import { DomainError } from '../errors';
import { formatMoney, parseMoney } from '../money';
import type { FinanceStore } from '../ports';
import { estimateCharges } from '../trading/charges';
import { classifySegment, instrumentKey, normaliseExchange, parseTradingSymbol } from '../trading/symbols';
import type { ChargeBreakdown, NewTrade, TradeExchange, TradeSegment } from '../trading/types';
import { MAX_BACKTEST_BARS, runBacktest, type BacktestOptions, type BacktestResult } from './backtest';
import { MAX_IMPORT_BARS, toBar, type Bar, type BarImportBatchRecord, type BarSeriesSummary, type BarTimeframe, type NewBar } from './bars';
import { calculateFutures } from './futures';
import { LIBRARY, libraryEntry, libraryIndex } from './library';
import {
  MAX_PAPER_ACCOUNTS,
  MAX_SAVED_STRATEGIES,
  type BacktestRecord,
  type BacktestSummary,
  type PaperAccountRecord,
  type PaperAccountView,
  type PaperOrderRecord,
  type PaperPosition,
  type StrategyPatch,
  type StrategyRecord,
} from './lab-records';
import { analyseStrategy, solveImpliedVolatility, strategyGreeks, type PayoffOptions } from './payoff';
import { calculateSizing, riskOfRuin } from './sizing';
import { validateSpec, type StrategySpec } from './strategy-spec';
import { buildTemplate, STRATEGY_TEMPLATES, type TemplateRequest } from './templates';
import { LAB_DISCLAIMER, type FuturesInput, type MarketAssumptions, type RiskOfRuinInput, type SizingInput, type StrategyLeg } from './types';

/*
 * The Strategy Lab service.
 *
 * Half of this module is stateless: a payoff, a Greek, an implied volatility, a futures
 * calculation or a position size is a pure function of what the user typed, and none of it
 * touches storage. The service still owns those entry points so the HTTP and MCP layers have
 * one place to call and the defaults live in one file.
 *
 * The other half persists: saved strategies, backtest runs, paper accounts and imported bars.
 * Everything is scoped to the authenticated user and a record belonging to someone else is
 * reported as absent, never as forbidden.
 *
 * On running backtests inside a request. A run is bounded twice — at most 200,000 bars and at
 * most fifteen seconds of wall clock, checked inside the loop rather than by a timer around it
 * — so it cannot occupy a request thread indefinitely. That is adequate while runs are
 * single-symbol and human-initiated. The moment this grows parameter sweeps or multi-symbol
 * portfolios, it needs to move to a worker with a job record the UI polls; the shape of
 * BacktestRecord is already what such a job would write.
 */

export interface MarketDataParser {
  /** Parses an uploaded OHLCV file. Throws with a readable message when it cannot. */
  parse(bytes: Uint8Array, filename: string): Promise<{ bars: Bar[]; warnings: string[]; timeframe: BarTimeframe; symbol: string | null }>;
}

export interface LabDependencies {
  marketData?: MarketDataParser;
}

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9&._-]{0,63}$/;

const requireSymbol = (raw: string): string => {
  const symbol = raw.trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) throw DomainError.validation('LAB_INVALID_SYMBOL', 'A symbol may only contain letters, digits and . _ - &');
  return symbol;
};

export class LabService {
  constructor(
    private readonly store: FinanceStore,
    private readonly deps: LabDependencies = {},
  ) {}

  // ---- stateless computes ----

  payoff(legs: StrategyLeg[], assumptions: MarketAssumptions, options?: PayoffOptions) {
    return analyseStrategy(legs, assumptions, options);
  }

  greeks(legs: StrategyLeg[], assumptions: MarketAssumptions) {
    return strategyGreeks(legs, assumptions);
  }

  impliedVolatility(request: Parameters<typeof solveImpliedVolatility>[0]) {
    return solveImpliedVolatility(request);
  }

  async futures(userId: string, input: FuturesInput) {
    // The user's own brokerage plan, so the charge figure matches their journal.
    const settings = await this.store.tradingSettings.find(userId);
    return calculateFutures(input, settings);
  }

  sizing(input: SizingInput) {
    return calculateSizing(input);
  }

  riskOfRuin(input: RiskOfRuinInput) {
    return riskOfRuin(input);
  }

  template(request: TemplateRequest) {
    return buildTemplate(request);
  }

  templates() {
    return { templates: STRATEGY_TEMPLATES, disclaimer: LAB_DISCLAIMER };
  }

  library(slug?: string) {
    if (!slug) return libraryIndex();
    const found = libraryEntry(slug);
    if (!found) throw DomainError.notFound('LAB_LIBRARY_ENTRY_NOT_FOUND', 'There is no library article with that name');
    return { entry: found, disclaimer: LAB_DISCLAIMER };
  }

  libraryForTemplate(templateId: string) {
    return LIBRARY.filter((item) => item.templates.includes(templateId));
  }

  // ---- saved strategies ----

  async listStrategies(userId: string): Promise<StrategyRecord[]> {
    return this.store.labStrategies.findAll(userId);
  }

  async requireStrategy(userId: string, id: string): Promise<StrategyRecord> {
    const found = await this.store.labStrategies.findById(userId, id);
    if (!found) throw DomainError.notFound('LAB_STRATEGY_NOT_FOUND', 'That strategy does not exist');
    return found;
  }

  async createStrategy(userId: string, input: { name: string; description?: string | null; spec: StrategySpec }): Promise<StrategyRecord> {
    const existing = await this.store.labStrategies.findAll(userId);
    if (existing.length >= MAX_SAVED_STRATEGIES) {
      throw DomainError.validation('LAB_TOO_MANY_STRATEGIES', `You can keep up to ${MAX_SAVED_STRATEGIES} strategies; delete one first`);
    }
    const spec = this.normaliseSpec(input.spec);
    return this.store.labStrategies.create({
      userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      spec,
      runCount: 0,
    });
  }

  async updateStrategy(userId: string, id: string, patch: { name?: string; description?: string | null; spec?: StrategySpec }): Promise<StrategyRecord> {
    await this.requireStrategy(userId, id);
    const next: StrategyPatch = {};
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.description !== undefined) next.description = patch.description?.trim() || null;
    if (patch.spec !== undefined) next.spec = this.normaliseSpec(patch.spec);
    return this.store.labStrategies.update(userId, id, next);
  }

  async deleteStrategy(userId: string, id: string): Promise<void> {
    await this.requireStrategy(userId, id);
    await this.store.labStrategies.delete(userId, id);
  }

  private normaliseSpec(spec: StrategySpec): StrategySpec {
    const normalised: StrategySpec = { ...spec, symbol: requireSymbol(spec.symbol), name: spec.name.trim() };
    validateSpec(normalised);
    return normalised;
  }

  // ---- market data ----

  async listSeries(userId: string): Promise<{ series: BarSeriesSummary[] }> {
    return { series: await this.store.marketBars.listSeries(userId) };
  }

  async deleteSeries(userId: string, symbol: string, timeframe: BarTimeframe): Promise<void> {
    await this.store.marketBars.deleteSeries(userId, requireSymbol(symbol), timeframe);
  }

  async listBarImports(userId: string): Promise<BarImportBatchRecord[]> {
    return (await this.store.labBarImports.list(userId)).map(withoutParsedBars);
  }

  /**
   * Parses an uploaded price file and holds it for review. Nothing reaches the bar table until
   * the user commits, and a file that cannot be read fails here rather than half-importing.
   */
  async uploadBars(userId: string, input: { filename: string; bytes: Uint8Array; symbol?: string }): Promise<BarImportBatchRecord> {
    if (!this.deps.marketData) throw new Error('LabService was created without a market data parser');
    let parsed: Awaited<ReturnType<MarketDataParser['parse']>>;
    try {
      parsed = await this.deps.marketData.parse(input.bytes, input.filename);
    } catch (error) {
      throw DomainError.validation('LAB_BAR_IMPORT_FAILED', error instanceof Error ? error.message : 'That file could not be read');
    }
    const symbol = requireSymbol(input.symbol?.trim() || parsed.symbol || input.filename.replace(/\.[^.]+$/, ''));
    if (parsed.bars.length > MAX_IMPORT_BARS) {
      throw DomainError.validation('LAB_TOO_MANY_BARS', `One upload may carry up to ${MAX_IMPORT_BARS.toLocaleString('en-IN')} bars`);
    }
    return this.store.labBarImports.create({
      userId,
      filename: input.filename,
      symbol,
      timeframe: parsed.timeframe,
      status: 'READY',
      rowCount: parsed.bars.length,
      warnings: parsed.warnings,
      error: null,
      from: parsed.bars[0]?.date ?? null,
      to: parsed.bars[parsed.bars.length - 1]?.date ?? null,
      parsed: parsed.bars,
    });
  }

  async findBarImport(userId: string, id: string): Promise<BarImportBatchRecord> {
    const batch = await this.store.labBarImports.find(userId, id);
    if (!batch) throw DomainError.notFound('LAB_BAR_IMPORT_NOT_FOUND', 'That import does not exist');
    return batch;
  }

  /** The first and last twenty bars, so the review screen can show what was read. */
  async previewBarImport(userId: string, id: string): Promise<{ batch: BarImportBatchRecord; head: Bar[]; tail: Bar[] }> {
    const batch = await this.findBarImport(userId, id);
    return { batch: withoutParsedBars(batch), head: batch.parsed.slice(0, 20), tail: batch.parsed.slice(-20) };
  }

  async commitBarImport(userId: string, id: string): Promise<{ batch: BarImportBatchRecord; inserted: number }> {
    const batch = await this.findBarImport(userId, id);
    if (batch.status === 'COMMITTED') throw DomainError.conflict('LAB_BAR_IMPORT_COMMITTED', 'That import has already been committed');
    const rows: NewBar[] = batch.parsed.map((bar) => ({
      userId,
      symbol: batch.symbol,
      timeframe: batch.timeframe,
      date: bar.date,
      time: bar.time,
      open: String(bar.open),
      high: String(bar.high),
      low: String(bar.low),
      close: String(bar.close),
      volume: String(Math.round(bar.volume)),
    }));
    const inserted = await this.store.marketBars.insertMany(rows);
    // The parsed blob is dropped on commit: it is now duplicated in the bar table, and a price
    // file is large enough that keeping both would double the storage for no benefit.
    const updated = await this.store.labBarImports.update(userId, id, { status: 'COMMITTED', parsed: [] });
    return { batch: withoutParsedBars(updated), inserted };
  }

  async deleteBarImport(userId: string, id: string): Promise<void> {
    await this.findBarImport(userId, id);
    await this.store.labBarImports.delete(userId, id);
  }

  // ---- backtests ----

  async listBacktests(userId: string, strategyId?: string): Promise<BacktestSummary[]> {
    return this.store.labBacktests.list(userId, strategyId);
  }

  async requireBacktest(userId: string, id: string): Promise<BacktestRecord> {
    const found = await this.store.labBacktests.findById(userId, id);
    if (!found) throw DomainError.notFound('LAB_BACKTEST_NOT_FOUND', 'That backtest does not exist');
    return found;
  }

  async deleteBacktest(userId: string, id: string): Promise<void> {
    await this.requireBacktest(userId, id);
    await this.store.labBacktests.delete(userId, id);
  }

  /**
   * Runs a strategy over the user's imported bars and stores the result.
   *
   * The bar query is capped before it is issued, so a symbol with a decade of minute data
   * cannot be loaded into memory whole by accident — the caller narrows the range instead.
   */
  async runBacktest(
    userId: string,
    input: { spec?: StrategySpec; strategyId?: string; from?: string; to?: string; walkForwardSplit?: number | null; save?: boolean },
  ): Promise<{ result: BacktestResult; record: BacktestRecord | null }> {
    const strategy = input.strategyId ? await this.requireStrategy(userId, input.strategyId) : null;
    const spec = this.normaliseSpec(input.spec ?? strategy?.spec ?? ({} as StrategySpec));

    const rows = await this.store.marketBars.find(userId, spec.symbol, spec.timeframe, {
      from: input.from,
      to: input.to,
      limit: MAX_BACKTEST_BARS + 1,
    });
    if (rows.length === 0) {
      throw DomainError.validation(
        'LAB_NO_BARS',
        `There are no ${spec.timeframe === 'DAY' ? 'daily' : 'minute'} bars stored for ${spec.symbol}. Import a price file for it first.`,
      );
    }

    const settings = await this.store.tradingSettings.find(userId);
    const runsSoFar = strategy ? strategy.runCount : 0;
    const options: BacktestOptions = { walkForwardSplit: input.walkForwardSplit ?? null, runsSoFar };
    const result = runBacktest(spec, rows.map(toBar), options, settings);

    if (strategy) await this.store.labStrategies.recordRun(userId, strategy.id);
    if (input.save === false) return { result, record: null };

    const record = await this.store.labBacktests.create({
      userId,
      strategyId: strategy?.id ?? null,
      name: spec.name || `${spec.symbol} run`,
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      from: result.stats.from,
      to: result.stats.to,
      stats: result.stats,
      result,
    });
    return { result, record };
  }

  // ---- paper trading ----

  async listPaperAccounts(userId: string): Promise<PaperAccountRecord[]> {
    return this.store.labPaper.listAccounts(userId);
  }

  async requirePaperAccount(userId: string, id: string): Promise<PaperAccountRecord> {
    const found = await this.store.labPaper.findAccount(userId, id);
    if (!found) throw DomainError.notFound('LAB_PAPER_ACCOUNT_NOT_FOUND', 'That paper account does not exist');
    return found;
  }

  async createPaperAccount(userId: string, input: { name: string; startingCapital: string }): Promise<PaperAccountRecord> {
    const existing = await this.store.labPaper.listAccounts(userId);
    if (existing.length >= MAX_PAPER_ACCOUNTS) {
      throw DomainError.validation('LAB_TOO_MANY_PAPER_ACCOUNTS', `You can keep up to ${MAX_PAPER_ACCOUNTS} paper accounts`);
    }
    const capital = parseMoney(input.startingCapital);
    if (capital <= 0n) throw DomainError.validation('LAB_INVALID_CAPITAL', 'Starting capital must be above zero');
    return this.store.labPaper.createAccount({
      userId,
      name: input.name.trim() || 'Paper account',
      startingCapital: formatMoney(capital),
      cash: formatMoney(capital),
    });
  }

  async renamePaperAccount(userId: string, id: string, name: string): Promise<PaperAccountRecord> {
    await this.requirePaperAccount(userId, id);
    return this.store.labPaper.updateAccount(userId, id, { name: name.trim() });
  }

  async deletePaperAccount(userId: string, id: string): Promise<void> {
    await this.requirePaperAccount(userId, id);
    await this.store.labPaper.deleteAccount(userId, id);
  }

  /**
   * Places a simulated order.
   *
   * It is evaluated against the bars the user imported, not against a live feed: a market order
   * fills at the open of the first bar strictly after the moment it was placed, and a limit
   * order waits for a bar whose range contains its price. An order with no bar to fill against
   * stays pending rather than filling at a made-up price.
   *
   * A fill writes a trade into the journal marked `isPaper`, so the lab and the journal never
   * disagree about what happened — and every journal query leaves paper fills out by default,
   * so the metrics that describe real money stay clean.
   */
  async placePaperOrder(
    userId: string,
    accountId: string,
    input: {
      symbol: string;
      timeframe: BarTimeframe;
      side: 'BUY' | 'SELL';
      quantity: string;
      orderType: 'MARKET' | 'LIMIT';
      limitPrice?: string | null;
      placedDate: string;
      placedTime?: string | null;
      exchange?: TradeExchange;
      lotSize?: number;
    },
  ): Promise<PaperOrderRecord> {
    const account = await this.requirePaperAccount(userId, accountId);
    const symbol = requireSymbol(input.symbol);
    const quantity = BigInt(input.quantity);
    if (quantity <= 0n) throw DomainError.validation('LAB_INVALID_QUANTITY', 'Quantity must be above zero');
    if (input.orderType === 'LIMIT' && !input.limitPrice) {
      throw DomainError.validation('LAB_LIMIT_PRICE_REQUIRED', 'A limit order needs a limit price');
    }

    const order = await this.store.labPaper.createOrder({
      userId,
      accountId,
      symbol,
      timeframe: input.timeframe,
      side: input.side,
      quantity: quantity.toString(),
      orderType: input.orderType,
      limitPrice: input.limitPrice ? formatMoney(parseMoney(input.limitPrice)) : null,
      status: 'PENDING',
      placedDate: input.placedDate,
      placedTime: input.placedTime ?? null,
      filledDate: null,
      filledTime: null,
      fillPrice: null,
      tradeId: null,
      message: null,
    });
    return this.tryFill(userId, account, order, input.exchange ?? 'NSE', input.lotSize ?? 1);
  }

  async cancelPaperOrder(userId: string, id: string): Promise<PaperOrderRecord> {
    const order = await this.store.labPaper.findOrder(userId, id);
    if (!order) throw DomainError.notFound('LAB_PAPER_ORDER_NOT_FOUND', 'That order does not exist');
    if (order.status !== 'PENDING') throw DomainError.conflict('LAB_PAPER_ORDER_NOT_PENDING', 'Only a pending order can be cancelled');
    return this.store.labPaper.updateOrder(userId, id, { status: 'CANCELLED', message: 'Cancelled by you' });
  }

  /** Attempts to fill a pending order against the imported bars. */
  private async tryFill(
    userId: string,
    account: PaperAccountRecord,
    order: PaperOrderRecord,
    exchange: TradeExchange,
    lotSize: number,
  ): Promise<PaperOrderRecord> {
    const rows = await this.store.marketBars.find(userId, order.symbol, order.timeframe, { from: order.placedDate, limit: 5_000 });
    const bars = rows.map(toBar).filter((bar) => bar.date > order.placedDate || (bar.date === order.placedDate && (bar.time ?? '') > (order.placedTime ?? '')));
    if (bars.length === 0) {
      return this.store.labPaper.updateOrder(userId, order.id, {
        message: `No bar for ${order.symbol} after ${order.placedDate}${order.placedTime ? ` ${order.placedTime}` : ''}, so there is nothing to fill against yet. Import more price data, or place the order earlier in the series.`,
      });
    }

    let fill: { bar: Bar; price: number } | null = null;
    if (order.orderType === 'MARKET') {
      fill = { bar: bars[0], price: bars[0].open };
    } else {
      const limit = Number(order.limitPrice);
      for (const bar of bars) {
        // A buy limit fills when the bar trades down to it; a sell limit when it trades up to it.
        const touched = order.side === 'BUY' ? bar.low <= limit : bar.high >= limit;
        if (!touched) continue;
        // A gap through the limit fills at the open, which is better than the limit.
        const price = order.side === 'BUY' ? Math.min(limit, bar.open) : Math.max(limit, bar.open);
        fill = { bar, price };
        break;
      }
      if (!fill) {
        return this.store.labPaper.updateOrder(userId, order.id, {
          message: `The price never reached ${order.limitPrice} in the bars available, so the order is still working.`,
        });
      }
    }

    const trade = await this.writePaperTrade(userId, account, order, fill, exchange, lotSize);
    const cash = parseMoney(account.cash);
    const consideration = parseMoney(formatMoney(BigInt(order.quantity) * parseMoney(String(fill.price))));
    const charges = parseMoney(trade.totalCharges);
    const nextCash = order.side === 'BUY' ? cash - consideration - charges : cash + consideration - charges;
    await this.store.labPaper.updateAccount(userId, account.id, { cash: formatMoney(nextCash) });

    return this.store.labPaper.updateOrder(userId, order.id, {
      status: 'FILLED',
      filledDate: fill.bar.date,
      filledTime: fill.bar.time,
      fillPrice: formatMoney(parseMoney(String(fill.price))),
      tradeId: trade.id,
      message: order.orderType === 'MARKET' ? 'Filled at the next bar’s open.' : 'Filled at the limit price.',
    });
  }

  /** Writes the fill into the journal, marked as paper so it never pollutes real metrics. */
  private async writePaperTrade(
    userId: string,
    account: PaperAccountRecord,
    order: PaperOrderRecord,
    fill: { bar: Bar; price: number },
    exchange: TradeExchange,
    lotSize: number,
  ) {
    const parsedSymbol = parseTradingSymbol(order.symbol);
    const segment: TradeSegment = classifySegment({
      exchange,
      underlying: parsedSymbol.underlying,
      right: parsedSymbol.right,
      expiry: parsedSymbol.expiry,
      intraday: false,
    });
    const price = formatMoney(parseMoney(String(fill.price)));
    const amount = formatMoney(BigInt(order.quantity) * parseMoney(price));
    const draft: NewTrade = {
      userId,
      date: fill.bar.date,
      time: fill.bar.time ? `${fill.bar.time}:00` : null,
      broker: 'Paper',
      exchange,
      segment,
      kind: 'TRADE',
      symbol: order.symbol,
      underlying: parsedSymbol.underlying || order.symbol,
      isin: null,
      expiry: parsedSymbol.expiry,
      strike: parsedSymbol.strike,
      right: parsedSymbol.right,
      lotSize,
      side: order.side,
      quantity: order.quantity,
      price,
      amount,
      ...zeroCharges(),
      chargesSource: 'ESTIMATED',
      orderId: order.id,
      tradeRef: null,
      notes: `Paper order in "${account.name}"`,
      externalRef: null,
      isPaper: true,
      paperAccountId: account.id,
    };
    const created = await this.store.trades.create(draft);
    // Charged exactly like a real fill, because the whole point of paper trading is to find out
    // what the costs do to the idea.
    const settings = await this.store.tradingSettings.find(userId);
    const breakdown = estimateCharges(
      [
        {
          id: created.id,
          date: created.date,
          broker: created.broker,
          segment: created.segment,
          exchange: created.exchange,
          side: created.side,
          amount: created.amount,
          underlying: created.underlying,
          orderId: created.orderId,
        },
      ],
      settings,
    ).get(created.id) as ChargeBreakdown;
    return this.store.trades.update(userId, created.id, {
      brokerage: breakdown.brokerage,
      stt: breakdown.stt,
      exchangeCharges: breakdown.exchangeCharges,
      sebiCharges: breakdown.sebiCharges,
      stampDuty: breakdown.stampDuty,
      gst: breakdown.gst,
      dpCharges: breakdown.dpCharges,
      otherCharges: breakdown.otherCharges,
      totalCharges: breakdown.total,
      chargesSource: 'ESTIMATED',
    });
  }

  /**
   * The account as it stands: open positions rebuilt FIFO from the paper fills, marked against
   * the last imported bar for each symbol.
   */
  async paperAccount(userId: string, id: string): Promise<PaperAccountView> {
    const account = await this.requirePaperAccount(userId, id);
    const [orders, fills] = await Promise.all([
      this.store.labPaper.listOrders(userId, id),
      this.store.trades.findAll(userId, { paperAccountId: id, includePaper: true }),
    ]);

    // FIFO per instrument: buys and sells consume each other, and what is left is the position.
    const books = new Map<string, { symbol: string; lots: { quantity: bigint; price: bigint; direction: 1 | -1 }[]; realised: bigint; charges: bigint }>();
    for (const fill of fills) {
      const key = instrumentKey(fill);
      const book = books.get(key) ?? { symbol: fill.symbol, lots: [], realised: 0n, charges: 0n };
      books.set(key, book);
      book.charges += parseMoney(fill.totalCharges);
      const direction: 1 | -1 = fill.side === 'BUY' ? 1 : -1;
      let remaining = BigInt(fill.quantity);
      const price = parseMoney(fill.price);
      while (remaining > 0n && book.lots.length > 0 && book.lots[0].direction !== direction) {
        const open = book.lots[0];
        const matched = remaining < open.quantity ? remaining : open.quantity;
        book.realised += ((price - open.price) * matched * BigInt(open.direction)) / 10_000n;
        open.quantity -= matched;
        remaining -= matched;
        if (open.quantity === 0n) book.lots.shift();
      }
      if (remaining > 0n) book.lots.push({ quantity: remaining, price, direction });
    }

    const positions: PaperPosition[] = [];
    let unrealisedTotal = 0n;
    let hasMark = false;
    let realisedTotal = 0n;
    let chargesTotal = 0n;
    for (const book of books.values()) {
      realisedTotal += book.realised;
      chargesTotal += book.charges;
      const quantity = book.lots.reduce((total, lot) => total + lot.quantity * BigInt(lot.direction), 0n);
      if (quantity === 0n) continue;
      const cost = book.lots.reduce((total, lot) => total + lot.quantity * lot.price, 0n);
      const units = book.lots.reduce((total, lot) => total + lot.quantity, 0n);
      const average = units === 0n ? 0n : cost / units;
      const last = await this.lastBar(userId, book.symbol);
      const unrealised = last === null ? null : ((parseMoney(String(last.close)) - average) * quantity) / 10_000n;
      if (unrealised !== null) {
        unrealisedTotal += unrealised;
        hasMark = true;
      }
      positions.push({
        symbol: book.symbol,
        quantity: Number(quantity),
        averagePrice: formatMoney(average),
        lastPrice: last === null ? null : formatMoney(parseMoney(String(last.close))),
        lastPriceDate: last?.date ?? null,
        unrealisedPnl: unrealised === null ? null : formatMoney(unrealised),
        realisedPnl: formatMoney(book.realised),
      });
    }

    const cash = parseMoney(account.cash);
    const equity = cash + (hasMark ? unrealisedTotal : 0n) + positionCost(positions);
    return {
      account,
      positions: positions.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      orders,
      equity: formatMoney(equity),
      totalPnl: formatMoney(equity - parseMoney(account.startingCapital)),
      realisedPnl: formatMoney(realisedTotal - chargesTotal),
      unrealisedPnl: hasMark ? formatMoney(unrealisedTotal) : null,
      charges: formatMoney(chargesTotal),
      disclaimer: LAB_DISCLAIMER,
    };
  }

  private async lastBar(userId: string, symbol: string): Promise<Bar | null> {
    for (const timeframe of ['MINUTE', 'DAY'] as BarTimeframe[]) {
      const rows = await this.store.marketBars.find(userId, symbol, timeframe, { limit: 1_000_000 });
      if (rows.length > 0) return toBar(rows[rows.length - 1]);
    }
    return null;
  }
}

/** Cash was taken out when a long was opened, so the position's cost has to come back in. */
function positionCost(positions: PaperPosition[]): bigint {
  return positions.reduce((total, position) => total + (parseMoney(position.averagePrice) * BigInt(position.quantity)) / 10_000n, 0n);
}

const zeroCharges = () => ({
  brokerage: '0',
  stt: '0',
  exchangeCharges: '0',
  sebiCharges: '0',
  stampDuty: '0',
  gst: '0',
  dpCharges: '0',
  otherCharges: '0',
  totalCharges: '0',
});

/** Strips the parsed-bar blob before a batch crosses an API boundary; it can be megabytes. */
const withoutParsedBars = (batch: BarImportBatchRecord): BarImportBatchRecord => ({ ...batch, parsed: [] });

export { normaliseExchange };
