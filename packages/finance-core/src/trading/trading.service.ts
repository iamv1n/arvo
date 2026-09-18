import { DomainError } from '../errors';
import { formatMoney, parseMoney } from '../money';
import type { FinanceStore } from '../ports';
import { optionalText, requireDate, requireMoney, requireText } from '../services/validation';
import { estimateCharges, mergeCharges } from './charges';
import { behaviourReport, type BehaviourReport } from './behaviour';
import { tradingMetrics, type TradingMetrics } from './metrics';
import { reconstructPositions, type ReconstructionResult, type TradePosition } from './positions';
import { realityCheck, type RealityCheck } from './reality-check';
import { classifySegment, instrumentLabel, normaliseExchange, parseTradingSymbol } from './symbols';
import { itr3Rows, tradingFinancialYears, tradingTaxSummary, type Itr3Row, type TradingTaxSummary } from './tax';
import {
  ALLOWED_ATTACHMENT_TYPES,
  DEFAULT_TRADING_SETTINGS,
  MAX_ATTACHMENT_BYTES,
  SEGMENTS,
  type AttachmentStore,
  type ChargeBreakdown,
  type JournalEntryPatch,
  type JournalEntryRecord,
  type NewTrade,
  type TradeExchange,
  type TradeFilter,
  type TradeRecord,
  type TradeSegment,
  type TradeSide,
  type TradingSettingsPatch,
  type TradingSettingsRecord,
} from './types';

/*
 * The trading journal's entry point.
 *
 * Reads are all the same shape: pull the user's fills, rebuild positions from them for a
 * fixed `asOf`, and hand the positions to one of the analysis functions. Nothing is cached and
 * nothing is stored derived, so a corrected trade changes every report at once and there is
 * never a stale total to explain.
 *
 * The one thing written outside trades is the journal: notes, tags and screenshots the user
 * attaches to a round trip.
 */

export interface TradingDependencies {
  attachments?: AttachmentStore;
}

export interface ManualTradeInput {
  date: string;
  time?: string | null;
  broker?: string;
  exchange?: string;
  segment?: TradeSegment;
  symbol: string;
  isin?: string | null;
  side: TradeSide;
  quantity: string;
  price: string;
  lotSize?: number;
  orderId?: string | null;
  notes?: string | null;
  /** Charges the user knows from the contract note; anything missing is estimated. */
  charges?: Partial<ChargeBreakdown> | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const QUANTITY_PATTERN = /^\d{1,15}$/;

export class TradingService {
  constructor(
    private readonly store: FinanceStore,
    private readonly deps: TradingDependencies = {},
  ) {}

  // ---- trades ----

  async listTrades(userId: string, filter: TradeFilter = {}): Promise<TradeRecord[]> {
    return this.store.trades.findAll(userId, filter);
  }

  async requireTrade(userId: string, id: string): Promise<TradeRecord> {
    const trade = await this.store.trades.findById(userId, id);
    if (!trade) throw DomainError.notFound('TRADE_NOT_FOUND', 'That trade does not exist');
    return trade;
  }

  async createTrade(userId: string, input: ManualTradeInput): Promise<TradeRecord> {
    const draft = this.normalise(userId, input);
    const created = await this.store.trades.create(draft);
    return this.repriceCharges(userId, created.id);
  }

  async updateTrade(userId: string, id: string, input: ManualTradeInput): Promise<TradeRecord> {
    await this.requireTrade(userId, id);
    const draft = this.normalise(userId, input);
    const { userId: _ignored, ...patch } = draft;
    await this.store.trades.update(userId, id, patch);
    return this.repriceCharges(userId, id);
  }

  async deleteTrade(userId: string, id: string): Promise<void> {
    await this.requireTrade(userId, id);
    await this.store.trades.delete(userId, id);
    await this.store.tradingJournal.delete(userId, id);
  }

  async listBrokers(userId: string): Promise<string[]> {
    return this.store.trades.listBrokers(userId);
  }

  /** Validates and fills in everything derivable from the symbol. */
  private normalise(userId: string, input: ManualTradeInput): NewTrade {
    const date = requireDate('date', input.date);
    const time = input.time ? requireTime(input.time) : null;
    const symbol = requireText('symbol', input.symbol, 64).toUpperCase();
    if (!QUANTITY_PATTERN.test(input.quantity.trim())) {
      throw DomainError.validation('INVALID_QUANTITY', 'Quantity must be a whole number of units');
    }
    const quantity = BigInt(input.quantity.trim());
    if (quantity <= 0n) throw DomainError.validation('INVALID_QUANTITY', 'Quantity must be greater than zero');
    const price = requireMoney('price', input.price);
    if (price < 0n) throw DomainError.validation('INVALID_PRICE', 'Price cannot be negative');
    if (input.side !== 'BUY' && input.side !== 'SELL') throw DomainError.validation('INVALID_SIDE', 'Side must be BUY or SELL');

    const parsed = parseTradingSymbol(symbol);
    const exchange: TradeExchange = normaliseExchange(input.exchange, parsed.right || parsed.expiry ? 'NFO' : 'NSE');
    const segment =
      input.segment ?? classifySegment({ exchange, underlying: parsed.underlying, right: parsed.right, expiry: parsed.expiry });
    if (!SEGMENTS.includes(segment)) throw DomainError.validation('INVALID_SEGMENT', 'That is not a segment Arvo knows');

    return {
      userId,
      date,
      time,
      broker: requireText('broker', input.broker ?? 'Manual', 60),
      exchange,
      segment,
      kind: 'TRADE',
      symbol,
      underlying: parsed.underlying || symbol,
      isin: optionalText('isin', input.isin, 12),
      expiry: parsed.expiry,
      strike: parsed.strike,
      right: parsed.right,
      lotSize: input.lotSize && input.lotSize > 0 ? Math.trunc(input.lotSize) : 1,
      side: input.side,
      quantity: quantity.toString(),
      price: formatMoney(price),
      amount: formatMoney(quantity * price),
      ...blankCharges(input.charges),
      orderId: optionalText('orderId', input.orderId, 64),
      tradeRef: null,
      notes: optionalText('notes', input.notes, 500),
      externalRef: null,
      isPaper: false,
      paperAccountId: null,
    };
  }

  /**
   * Recomputes a trade's estimated charges alongside the other fills of its order, so the
   * per-order brokerage cap and the per-scrip DP charge come out right.
   */
  private async repriceCharges(userId: string, tradeId: string): Promise<TradeRecord> {
    const trade = await this.requireTrade(userId, tradeId);
    const sameDay = await this.store.trades.findAll(userId, { from: trade.date, to: trade.date });
    const estimates = estimateCharges(sameDay, await this.settings(userId));
    for (const row of sameDay) {
      const merged = mergeCharges(estimates.get(row.id) ?? estimates.get(trade.id)!, row.chargesSource === 'BROKER' ? reportedOf(row) : null);
      if (sameBreakdown(row, merged)) continue;
      await this.store.trades.update(userId, row.id, toPatch(merged));
    }
    return this.requireTrade(userId, tradeId);
  }

  // ---- positions ----

  async positions(userId: string, asOf: string, filter: TradeFilter = {}): Promise<ReconstructionResult> {
    // Reconstruction always sees the full history: a position opened before the window still
    // has to be matched, or a partial exit inside it would look like a short sale.
    const trades = await this.store.trades.findAll(userId, {});
    const result = reconstructPositions({ trades, asOf });
    if (!hasFilter(filter)) return result;
    const keep = (p: TradePosition) =>
      (!filter.from || (p.closedAt ?? p.openedAt) >= filter.from) &&
      (!filter.to || p.openedAt <= filter.to) &&
      (!filter.segment || p.segment === filter.segment) &&
      (!filter.underlying || p.underlying === filter.underlying) &&
      (!filter.broker || p.broker === filter.broker);
    const positions = result.positions.filter(keep);
    return { positions, open: positions.filter((p) => p.status === 'OPEN'), closed: positions.filter((p) => p.status === 'CLOSED'), warnings: result.warnings };
  }

  async position(userId: string, asOf: string, positionId: string): Promise<{ position: TradePosition; journal: JournalEntryRecord | null }> {
    const { positions } = await this.positions(userId, asOf);
    const position = positions.find((p) => p.id === positionId);
    if (!position) throw DomainError.notFound('POSITION_NOT_FOUND', 'That position does not exist');
    return { position, journal: await this.store.tradingJournal.findByPosition(userId, positionId) };
  }

  // ---- analysis ----

  async metrics(userId: string, asOf: string, filter: TradeFilter = {}): Promise<TradingMetrics> {
    const { positions } = await this.positions(userId, asOf, filter);
    const journal = await this.journalMap(userId);
    return tradingMetrics({ positions, journal, asOf });
  }

  async behaviour(userId: string, asOf: string, filter: TradeFilter = {}): Promise<BehaviourReport> {
    const [{ positions }, trades, settings] = await Promise.all([
      this.positions(userId, asOf, filter),
      this.store.trades.findAll(userId, filter),
      this.settings(userId),
    ]);
    return behaviourReport({ trades, positions, settings, asOf });
  }

  async realityCheck(userId: string, asOf: string): Promise<RealityCheck> {
    const [{ positions }, settings] = await Promise.all([this.positions(userId, asOf), this.settings(userId)]);
    let benchmark: { series: string; points: Awaited<ReturnType<FinanceStore['portfolioData']['findBenchmarkPoints']>> } | null = null;
    const series = settings.benchmarkSeries ?? (await this.store.portfolioData.listBenchmarkSeries(userId))[0]?.series ?? null;
    if (series) benchmark = { series, points: await this.store.portfolioData.findBenchmarkPoints(userId, series) };
    return realityCheck({
      positions,
      benchmark,
      assumedIndexReturnPercent: settings.assumedIndexReturnPercent,
      assumedFdRatePercent: settings.assumedFdRatePercent,
      asOf,
    });
  }

  async tax(userId: string, asOf: string, financialYear: string): Promise<TradingTaxSummary> {
    const [{ positions }, trades] = await Promise.all([this.positions(userId, asOf), this.store.trades.findAll(userId, {})]);
    return tradingTaxSummary({ positions, trades, financialYear });
  }

  async financialYears(userId: string, asOf: string): Promise<string[]> {
    const { positions } = await this.positions(userId, asOf);
    return tradingFinancialYears(positions);
  }

  async itr3Export(userId: string, asOf: string, financialYear: string): Promise<Itr3Row[]> {
    return itr3Rows(await this.tax(userId, asOf, financialYear));
  }

  // ---- journal ----

  async journal(userId: string, positionId: string): Promise<JournalEntryRecord | null> {
    return this.store.tradingJournal.findByPosition(userId, positionId);
  }

  async journalMap(userId: string): Promise<Map<string, JournalEntryRecord>> {
    const entries = await this.store.tradingJournal.findAll(userId);
    return new Map(entries.map((entry) => [entry.positionId, entry]));
  }

  async saveJournal(userId: string, positionId: string, patch: JournalEntryPatch): Promise<JournalEntryRecord> {
    await this.requireTrade(userId, positionId);
    const clean: JournalEntryPatch = {};
    if (patch.notes !== undefined) clean.notes = optionalText('notes', patch.notes, 4000);
    if (patch.setupTags !== undefined) clean.setupTags = tags('setupTags', patch.setupTags);
    if (patch.emotionTags !== undefined) clean.emotionTags = tags('emotionTags', patch.emotionTags);
    if (patch.mistakes !== undefined) clean.mistakes = tags('mistakes', patch.mistakes);
    if (patch.stopPrice !== undefined) clean.stopPrice = patch.stopPrice === null ? null : formatMoney(requireMoney('stopPrice', patch.stopPrice));
    if (patch.targetPrice !== undefined) clean.targetPrice = patch.targetPrice === null ? null : formatMoney(requireMoney('targetPrice', patch.targetPrice));
    if (patch.screenshots !== undefined) clean.screenshots = patch.screenshots;
    return this.store.tradingJournal.upsert(userId, positionId, clean);
  }

  /** Stores a screenshot on local disk and attaches it to the round trip. */
  async addAttachment(userId: string, positionId: string, file: { filename: string; mimeType: string; bytes: Uint8Array }): Promise<JournalEntryRecord> {
    const attachments = this.deps.attachments;
    if (!attachments) throw DomainError.validation('ATTACHMENTS_DISABLED', 'Screenshot storage is not configured on this install');
    await this.requireTrade(userId, positionId);
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.mimeType)) {
      throw DomainError.validation('UNSUPPORTED_ATTACHMENT', 'Screenshots have to be PNG, JPEG or WebP images');
    }
    if (file.bytes.byteLength === 0) throw DomainError.validation('EMPTY_FILE', 'The file is empty');
    if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw DomainError.validation('FILE_TOO_LARGE', 'Screenshots have to be 5 MB or smaller');

    const saved = await attachments.save(userId, file.filename, file.mimeType, file.bytes);
    const existing = await this.store.tradingJournal.findByPosition(userId, positionId);
    return this.store.tradingJournal.upsert(userId, positionId, { screenshots: [...(existing?.screenshots ?? []), saved] });
  }

  async readAttachment(userId: string, positionId: string, path: string): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
    const attachments = this.deps.attachments;
    if (!attachments) throw DomainError.validation('ATTACHMENTS_DISABLED', 'Screenshot storage is not configured on this install');
    const entry = await this.store.tradingJournal.findByPosition(userId, positionId);
    const match = entry?.screenshots.find((s) => s.path === path);
    if (!match) throw DomainError.notFound('ATTACHMENT_NOT_FOUND', 'That screenshot does not exist');
    return { bytes: await attachments.read(userId, path), mimeType: match.mimeType, filename: match.filename };
  }

  async removeAttachment(userId: string, positionId: string, path: string): Promise<JournalEntryRecord> {
    const entry = await this.store.tradingJournal.findByPosition(userId, positionId);
    const match = entry?.screenshots.find((s) => s.path === path);
    if (!entry || !match) throw DomainError.notFound('ATTACHMENT_NOT_FOUND', 'That screenshot does not exist');
    await this.deps.attachments?.remove(userId, path);
    return this.store.tradingJournal.upsert(userId, entry.positionId, { screenshots: entry.screenshots.filter((s) => s.path !== path) });
  }

  // ---- settings ----

  async settings(userId: string): Promise<TradingSettingsRecord> {
    const saved = await this.store.tradingSettings.find(userId);
    return saved ?? { userId, ...DEFAULT_TRADING_SETTINGS, updatedAt: new Date(0) };
  }

  async saveSettings(userId: string, patch: TradingSettingsPatch): Promise<TradingSettingsRecord> {
    if (patch.revengeWindowMinutes !== undefined && (patch.revengeWindowMinutes < 1 || patch.revengeWindowMinutes > 720)) {
      throw DomainError.validation('INVALID_WINDOW', 'The revenge-trade window has to be between 1 and 720 minutes');
    }
    return this.store.tradingSettings.save(userId, patch);
  }
}

// ---- helpers ----

function requireTime(value: string): string {
  const time = value.trim();
  if (!TIME_PATTERN.test(time)) throw DomainError.validation('INVALID_TIME', 'Time has to look like 09:20 or 09:20:31');
  return time.length === 5 ? `${time}:00` : time;
}

function tags(field: string, values: string[]): string[] {
  if (values.length > 20) throw DomainError.validation('TOO_MANY_TAGS', `At most 20 ${field} can be set`);
  return [...new Set(values.map((tag) => requireText(field, tag, 40)))];
}

const hasFilter = (filter: TradeFilter) => Object.values(filter).some((value) => value !== undefined && value !== null && value !== '');

function blankCharges(reported: Partial<ChargeBreakdown> | null | undefined) {
  const pick = (key: keyof ChargeBreakdown) => (reported?.[key] as string | undefined) ?? '0';
  return {
    brokerage: pick('brokerage'),
    stt: pick('stt'),
    exchangeCharges: pick('exchangeCharges'),
    sebiCharges: pick('sebiCharges'),
    stampDuty: pick('stampDuty'),
    gst: pick('gst'),
    dpCharges: pick('dpCharges'),
    otherCharges: pick('otherCharges'),
    totalCharges: pick('total'),
    chargesSource: (reported ? 'BROKER' : 'ESTIMATED') as TradeRecord['chargesSource'],
  };
}

const reportedOf = (trade: TradeRecord): Partial<ChargeBreakdown> => ({
  brokerage: trade.brokerage,
  stt: trade.stt,
  exchangeCharges: trade.exchangeCharges,
  sebiCharges: trade.sebiCharges,
  stampDuty: trade.stampDuty,
  gst: trade.gst,
  dpCharges: trade.dpCharges,
  otherCharges: trade.otherCharges,
  total: trade.totalCharges,
});

const toPatch = (charges: ChargeBreakdown) => ({
  brokerage: charges.brokerage,
  stt: charges.stt,
  exchangeCharges: charges.exchangeCharges,
  sebiCharges: charges.sebiCharges,
  stampDuty: charges.stampDuty,
  gst: charges.gst,
  dpCharges: charges.dpCharges,
  otherCharges: charges.otherCharges,
  totalCharges: charges.total,
  chargesSource: charges.source,
});

function sameBreakdown(trade: TradeRecord, charges: ChargeBreakdown): boolean {
  return (
    trade.chargesSource === charges.source &&
    parseMoney(trade.totalCharges) === parseMoney(charges.total) &&
    parseMoney(trade.brokerage) === parseMoney(charges.brokerage)
  );
}

export { instrumentLabel };
