import { DomainError } from '../errors';
import { addBreakdowns, estimateCharges, type ChargeableTrade } from '../trading/charges';
import type { ChargeBreakdown, TradingSettingsRecord } from '../trading/types';
import type { Bar } from './bars';
import { atr, bollinger, ema, macd, openingRange, previousSessionLevels, rsi, sma, supertrend, vwap, type Series } from './indicators';
import { fmt } from './payoff';
import { BACKTEST_DISCLAIMER } from './types';
import { countParameters, validateSpec, type Condition, type ExitRule, type IndicatorSpec, type Operand, type StrategySpec } from './strategy-spec';

/*
 * The backtester.
 *
 * What it is: a deterministic replay of a rule set over bars the user imported. Same spec,
 * same bars, same numbers, every time — there is no randomness anywhere in here, so nothing
 * needs seeding, and two runs a month apart can be compared directly.
 *
 * What it is not: a simulation of trading. Fills are assumed at a price the bar contains, not
 * observed. Real life adds partial fills, rejected orders, liquidity that vanishes exactly when
 * a stop is hit, gaps through the stop, and circuit limits. Every one of those makes results
 * worse than this, never better, which is why the disclaimer is attached to every result and
 * why the defaults are pessimistic wherever there is a choice.
 *
 * The pessimistic choices, stated so they can be argued with:
 *   - Entries fill at the *next* bar's open by default. Filling on the signal bar's close is
 *     available but it is close to look-ahead: at the moment the close prints, you cannot trade
 *     at it.
 *   - Slippage always works against the trader, on entry and on exit.
 *   - When a bar's range contains both the stop and the target, the stop is taken. Without tick
 *     data there is no way to know which came first, and assuming the good one is how a
 *     backtest starts lying.
 *   - A gap through the stop fills at the open, not at the stop price.
 *   - Charges go through the Phase 11 statutory engine, so brokerage, STT, exchange charges,
 *     stamp duty and GST all come out. Most naive backtests skip these and most intraday
 *     strategies are profitable only until they are applied.
 *
 * Bounds. A run is capped on bars and on wall time, and the caps are enforced inside the loop
 * rather than by a timeout around it, so a pathological spec cannot occupy a request thread
 * indefinitely. The API layer runs the whole thing synchronously inside those bounds; see
 * lab.service.ts for the note on where that stops being acceptable.
 */

export const MAX_BACKTEST_BARS = 200_000;
export const MAX_BACKTEST_MILLISECONDS = 15_000;
/** How often the wall-clock budget is checked, in bars. */
const TIME_CHECK_INTERVAL = 2_000;
/** Trading sessions in an Indian year, for annualising. */
const SESSIONS_PER_YEAR = 252;

export interface BacktestOptions {
  /** Annual risk-free rate as a percent, used for the Sharpe ratio. */
  riskFreeRatePercent?: string;
  /** Fraction of the bars used as the in-sample half of a walk-forward split, 0–1. */
  walkForwardSplit?: number | null;
  /** How many variations of this strategy the user has already run. Feeds the overfitting note. */
  runsSoFar?: number;
  maxBars?: number;
  timeBudgetMs?: number;
}

export interface BacktestTrade {
  /** 1-based, in the order they were opened. */
  number: number;
  direction: 'LONG' | 'SHORT';
  entryDate: string;
  entryTime: string | null;
  entryPrice: string;
  exitDate: string;
  exitTime: string | null;
  exitPrice: string;
  quantity: number;
  /** Why the position was closed. */
  reason: ExitReason;
  /** Before charges. */
  grossPnl: string;
  charges: ChargeBreakdown;
  /** After every charge. */
  netPnl: string;
  /** Net P&L as a multiple of the risk taken to the initial stop. Null with no stop. */
  rMultiple: string | null;
  barsHeld: number;
  /** Equity after this trade closed. */
  equityAfter: string;
}

export type ExitReason = 'SIGNAL' | 'STOP_LOSS' | 'TARGET' | 'TRAILING_STOP' | 'TIME_EXIT' | 'SQUARE_OFF' | 'END_OF_DATA';

export interface BacktestEquityPoint {
  date: string;
  equity: string;
  /** Percent below the running high-water mark, never positive. */
  drawdownPercent: string;
}

export interface BacktestStats {
  startingCapital: string;
  endingCapital: string;
  netPnl: string;
  returnPercent: string;
  cagrPercent: string | null;
  maxDrawdownPercent: string;
  maxDrawdownAmount: string;
  sharpe: string | null;
  trades: number;
  wins: number;
  losses: number;
  winRatePercent: string;
  averageWin: string;
  averageLoss: string;
  expectancy: string;
  profitFactor: string | null;
  totalCharges: string;
  /** Charges as a percentage of the gross profit made by winning trades. */
  chargesPercentOfGross: string | null;
  /** Percentage of bars with a position open. */
  exposurePercent: string;
  averageBarsHeld: string;
  from: string | null;
  to: string | null;
  bars: number;
}

export interface YearBreakdown {
  year: string;
  trades: number;
  netPnl: string;
  winRatePercent: string;
  returnPercent: string;
}

export interface WalkForwardReport {
  splitPercent: string;
  splitDate: string;
  inSample: BacktestStats;
  outOfSample: BacktestStats;
  /** In words: did the edge survive the split? */
  verdict: string;
}

export interface BacktestResult {
  spec: StrategySpec;
  stats: BacktestStats;
  trades: BacktestTrade[];
  equityCurve: BacktestEquityPoint[];
  perYear: YearBreakdown[];
  walkForward: WalkForwardReport | null;
  overfittingWarning: string | null;
  /** Everything the run assumed, so a result can be read back in six months. */
  assumptions: string[];
  disclaimer: string;
  /** Milliseconds the run took; the UI shows it next to the bar count. */
  elapsedMs: number;
}

// ---- indicator resolution ----

/** A stable key for an indicator spec, so the same series is only computed once. */
const indicatorKey = (spec: IndicatorSpec): string =>
  [spec.kind, spec.period, spec.fastPeriod, spec.slowPeriod, spec.signalPeriod, spec.multiplier, spec.rangeBars, spec.output].join(':');

function computeIndicator(spec: IndicatorSpec, bars: Bar[]): Series {
  const closes = bars.map((bar) => bar.close);
  const output = spec.output ?? 'VALUE';
  switch (spec.kind) {
    case 'SMA':
      return sma(closes, spec.period ?? 20);
    case 'EMA':
      return ema(closes, spec.period ?? 20);
    case 'RSI':
      return rsi(closes, spec.period ?? 14);
    case 'MACD': {
      const lines = macd(closes, spec.fastPeriod ?? 12, spec.slowPeriod ?? 26, spec.signalPeriod ?? 9);
      return output === 'SIGNAL' ? lines.signal : output === 'HISTOGRAM' ? lines.histogram : lines.macd;
    }
    case 'VWAP':
      return vwap(bars);
    case 'ATR':
      return atr(bars, spec.period ?? 14);
    case 'BOLLINGER': {
      const bands = bollinger(closes, spec.period ?? 20, spec.multiplier ?? 2);
      return output === 'UPPER' ? bands.upper : output === 'LOWER' ? bands.lower : bands.middle;
    }
    case 'SUPERTREND': {
      const lines = supertrend(bars, spec.period ?? 10, spec.multiplier ?? 3);
      return output === 'DIRECTION' ? lines.direction : lines.value;
    }
    case 'PREV_DAY_HIGH':
      return previousSessionLevels(bars).previousHigh;
    case 'PREV_DAY_LOW':
      return previousSessionLevels(bars).previousLow;
    case 'PREV_DAY_CLOSE':
      return previousSessionLevels(bars).previousClose;
    case 'OPENING_RANGE_HIGH':
      return openingRange(bars, spec.rangeBars ?? 3).high;
    case 'OPENING_RANGE_LOW':
      return openingRange(bars, spec.rangeBars ?? 3).low;
    default: {
      const unreachable: never = spec.kind;
      throw DomainError.validation('LAB_UNKNOWN_INDICATOR', `Unknown indicator ${String(unreachable)}`);
    }
  }
}

function collectIndicators(condition: Condition, into: Map<string, IndicatorSpec>): void {
  const operand = (value: Operand) => {
    if (value.type === 'INDICATOR') into.set(indicatorKey(value.indicator), value.indicator);
  };
  switch (condition.type) {
    case 'AND':
    case 'OR':
      condition.operands.forEach((child) => collectIndicators(child, into));
      return;
    case 'NOT':
      collectIndicators(condition.operand, into);
      return;
    case 'COMPARE':
      operand(condition.left);
      operand(condition.right);
      return;
    default:
  }
}

// ---- condition evaluation ----

interface EvalContext {
  bars: Bar[];
  series: Map<string, Series>;
}

function operandValue(operand: Operand, ctx: EvalContext, index: number): number | null {
  if (operand.type === 'CONSTANT') return operand.value;
  const at = index - (operand.offset ?? 0);
  if (at < 0 || at >= ctx.bars.length) return null;
  if (operand.type === 'PRICE') {
    const bar = ctx.bars[at];
    switch (operand.field) {
      case 'OPEN':
        return bar.open;
      case 'HIGH':
        return bar.high;
      case 'LOW':
        return bar.low;
      case 'CLOSE':
        return bar.close;
      case 'VOLUME':
        return bar.volume;
      default:
        return null;
    }
  }
  return ctx.series.get(indicatorKey(operand.indicator))?.[at] ?? null;
}

/**
 * Evaluates a condition on one bar.
 *
 * A comparison whose operands are not yet available (an indicator still warming up, a look-back
 * before the start of the data) is false, not an error. That is what stops a strategy from
 * trading on the first bar of a 200-period moving average.
 */
function evaluate(condition: Condition, ctx: EvalContext, index: number): boolean {
  switch (condition.type) {
    case 'ALWAYS':
      return true;
    case 'AND':
      return condition.operands.every((child) => evaluate(child, ctx, index));
    case 'OR':
      return condition.operands.some((child) => evaluate(child, ctx, index));
    case 'NOT':
      return !evaluate(condition.operand, ctx, index);
    case 'TIME_AFTER':
      return (ctx.bars[index].time ?? '00:00') >= condition.time;
    case 'TIME_BEFORE':
      return (ctx.bars[index].time ?? '00:00') <= condition.time;
    case 'COMPARE': {
      const left = operandValue(condition.left, ctx, index);
      const right = operandValue(condition.right, ctx, index);
      if (left === null || right === null) return false;
      switch (condition.op) {
        case 'GT':
          return left > right;
        case 'GTE':
          return left >= right;
        case 'LT':
          return left < right;
        case 'LTE':
          return left <= right;
        case 'CROSSES_ABOVE':
        case 'CROSSES_BELOW': {
          if (index === 0) return false;
          const previousLeft = operandValue(condition.left, ctx, index - 1);
          const previousRight = operandValue(condition.right, ctx, index - 1);
          if (previousLeft === null || previousRight === null) return false;
          return condition.op === 'CROSSES_ABOVE'
            ? previousLeft <= previousRight && left > right
            : previousLeft >= previousRight && left < right;
        }
        default:
          return false;
      }
    }
    default:
      return false;
  }
}

// ---- simulation ----

interface OpenPosition {
  direction: 1 | -1;
  quantity: number;
  entryIndex: number;
  entryPrice: number;
  entryDate: string;
  entryTime: string | null;
  stop: number | null;
  /** The stop as it was when the position opened, for the R-multiple. */
  initialStop: number | null;
  target: number | null;
  /** Best price reached, for the trailing stop. */
  extreme: number;
}

/** Applies slippage so it always costs the trader money. */
function withSlippage(price: number, side: 'BUY' | 'SELL', spec: StrategySpec): number {
  const { slippage, slippageType } = spec.execution;
  if (slippage <= 0) return price;
  const adjustment = slippageType === 'POINTS' ? slippage : (price * slippage) / 10_000;
  return side === 'BUY' ? price + adjustment : Math.max(price - adjustment, 0.0001);
}

function ruleDistance(rule: ExitRule, price: number, atrValue: number | null): number | null {
  switch (rule.type) {
    case 'PERCENT':
      return (price * rule.value) / 100;
    case 'POINTS':
      return rule.value;
    case 'ATR':
      return atrValue === null ? null : atrValue * rule.value;
    default:
      return null;
  }
}

function quantityFor(spec: StrategySpec, equity: number, price: number, stop: number | null): number {
  const { method, lotSize } = spec.sizing;
  let units: number;
  if (method === 'FIXED_QUANTITY') units = spec.sizing.quantity ?? lotSize;
  else if (method === 'FIXED_FRACTIONAL') units = ((equity * (spec.sizing.percent ?? 0)) / 100) / price;
  else {
    const distance = stop === null ? 0 : Math.abs(price - stop);
    units = distance > 0 ? ((equity * (spec.sizing.percent ?? 0)) / 100) / distance : 0;
  }
  return Math.max(Math.floor(units / lotSize), 0) * lotSize;
}

interface RunOutput {
  trades: BacktestTrade[];
  equityCurve: BacktestEquityPoint[];
  stats: BacktestStats;
}

function runOne(spec: StrategySpec, bars: Bar[], ctx: EvalContext, options: Required<Pick<BacktestOptions, 'riskFreeRatePercent' | 'timeBudgetMs'>>, settings: TradingSettingsRecord | null): RunOutput {
  const startingCapital = Number(spec.startingCapital);
  const atrSeries = ctx.series.get('__atr') ?? [];
  const trades: BacktestTrade[] = [];
  const positions: OpenPosition[] = [];
  let equity = startingCapital;
  let barsWithPosition = 0;
  let pendingEntry: 1 | -1 | null = null;
  let pendingExit = false;
  const sessionEquity = new Map<string, number>();
  const startedAt = Date.now();

  const closeAt = (position: OpenPosition, index: number, rawPrice: number, reason: ExitReason) => {
    const bar = bars[index];
    const side = position.direction === 1 ? 'SELL' : 'BUY';
    const exitPrice = withSlippage(rawPrice, side, spec);
    const gross = (exitPrice - position.entryPrice) * position.quantity * position.direction;
    const fills: ChargeableTrade[] = [
      {
        id: 'entry',
        date: position.entryDate,
        broker: spec.execution.broker,
        segment: spec.execution.segment,
        exchange: spec.execution.exchange,
        side: position.direction === 1 ? 'BUY' : 'SELL',
        amount: fmt(position.entryPrice * position.quantity),
        underlying: spec.symbol,
        orderId: 'entry',
      },
      {
        id: 'exit',
        date: bar.date,
        broker: spec.execution.broker,
        segment: spec.execution.segment,
        exchange: spec.execution.exchange,
        side,
        amount: fmt(exitPrice * position.quantity),
        underlying: spec.symbol,
        orderId: 'exit',
      },
    ];
    const chargeMap = estimateCharges(fills, settings);
    const charges = addBreakdowns(fills.map((f) => chargeMap.get(f.id)!));
    const net = gross - Number(charges.total);
    equity += net;
    const risk = position.initialStop === null ? null : Math.abs(position.entryPrice - position.initialStop) * position.quantity;
    trades.push({
      number: trades.length + 1,
      direction: position.direction === 1 ? 'LONG' : 'SHORT',
      entryDate: position.entryDate,
      entryTime: position.entryTime,
      entryPrice: fmt(position.entryPrice),
      exitDate: bar.date,
      exitTime: bar.time,
      exitPrice: fmt(exitPrice),
      quantity: position.quantity,
      reason,
      grossPnl: fmt(gross),
      charges,
      netPnl: fmt(net),
      rMultiple: risk === null || risk === 0 ? null : fmt(net / risk, 2),
      barsHeld: index - position.entryIndex,
      equityAfter: fmt(equity),
    });
  };

  for (let i = 0; i < bars.length; i += 1) {
    if (i % TIME_CHECK_INTERVAL === 0 && Date.now() - startedAt > options.timeBudgetMs) {
      throw DomainError.validation(
        'LAB_BACKTEST_TIMEOUT',
        `This run passed its ${options.timeBudgetMs / 1000}-second budget. Narrow the date range, use a longer timeframe, or simplify the rules.`,
      );
    }
    const bar = bars[i];

    // 1. Orders queued by the previous bar fill at this bar's open.
    if (pendingExit) {
      for (const position of positions.splice(0)) closeAt(position, i, bar.open, 'SIGNAL');
      pendingExit = false;
    }
    if (pendingEntry !== null && positions.length < spec.maxPositions) {
      const direction = pendingEntry;
      const entryPrice = withSlippage(bar.open, direction === 1 ? 'BUY' : 'SELL', spec);
      const atrValue = atrSeries[i] ?? null;
      const stopDistance = spec.stopLoss ? ruleDistance(spec.stopLoss, entryPrice, atrValue) : null;
      const targetDistance = spec.target ? ruleDistance(spec.target, entryPrice, atrValue) : null;
      const stop = stopDistance === null ? null : entryPrice - stopDistance * direction;
      const quantity = quantityFor(spec, equity, entryPrice, stop);
      if (quantity > 0) {
        positions.push({
          direction,
          quantity,
          entryIndex: i,
          entryPrice,
          entryDate: bar.date,
          entryTime: bar.time,
          stop,
          initialStop: stop,
          target: targetDistance === null ? null : entryPrice + targetDistance * direction,
          extreme: entryPrice,
        });
      }
    }
    pendingEntry = null;

    // 2. Manage whatever is open against this bar's range.
    if (positions.length > 0) {
      barsWithPosition += 1;
      for (let p = positions.length - 1; p >= 0; p -= 1) {
        const position = positions[p];
        const long = position.direction === 1;
        position.extreme = long ? Math.max(position.extreme, bar.high) : Math.min(position.extreme, bar.low);
        if (spec.trailingStop) {
          const atrValue = atrSeries[i] ?? null;
          const distance = ruleDistance(spec.trailingStop, position.extreme, atrValue);
          if (distance !== null) {
            const trail = position.extreme - distance * position.direction;
            // The trail only ever ratchets towards the price; it never gives ground back.
            position.stop = position.stop === null ? trail : long ? Math.max(position.stop, trail) : Math.min(position.stop, trail);
          }
        }
        // The stop is checked before the target: with only OHLC there is no way to know which
        // the bar touched first, and assuming the good one flatters every result.
        const stopHit = position.stop !== null && (long ? bar.low <= position.stop : bar.high >= position.stop);
        const targetHit = position.target !== null && (long ? bar.high >= position.target : bar.low <= position.target);
        if (stopHit) {
          // A gap through the stop fills at the open, not at the stop price.
          const gapped = long ? bar.open < (position.stop as number) : bar.open > (position.stop as number);
          positions.splice(p, 1);
          closeAt(position, i, gapped ? bar.open : (position.stop as number), spec.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS');
          continue;
        }
        if (targetHit) {
          const gapped = long ? bar.open > (position.target as number) : bar.open < (position.target as number);
          positions.splice(p, 1);
          closeAt(position, i, gapped ? bar.open : (position.target as number), 'TARGET');
          continue;
        }
        if (spec.intradaySquareOffTime && bar.time !== null && bar.time >= spec.intradaySquareOffTime) {
          positions.splice(p, 1);
          closeAt(position, i, bar.close, 'SQUARE_OFF');
          continue;
        }
        if (spec.maxBarsInTrade !== null && i - position.entryIndex >= spec.maxBarsInTrade) {
          positions.splice(p, 1);
          closeAt(position, i, bar.close, 'TIME_EXIT');
        }
      }
    }

    // 3. Mark the session's equity, including anything still open.
    const openValue = positions.reduce((total, position) => total + (bar.close - position.entryPrice) * position.quantity * position.direction, 0);
    sessionEquity.set(bar.date, equity + openValue);

    // 4. Read the rules for the next bar.
    const isLast = i === bars.length - 1;
    if (!isLast) {
      const squareOffPending = spec.intradaySquareOffTime !== null && bars[i + 1].date !== bar.date;
      if (positions.length > 0 && spec.exit && evaluate(spec.exit, ctx, i)) pendingExit = true;
      if (!squareOffPending && positions.length < spec.maxPositions && evaluate(spec.entry, ctx, i)) {
        const long = spec.direction !== 'SHORT';
        pendingEntry = long ? 1 : -1;
      }
      if (spec.execution.fill === 'SAME_BAR_CLOSE') {
        // Fill immediately at this bar's close instead of waiting. Kept because some rules are
        // written that way, but it is optimistic: the close is not tradeable once it has printed.
        if (pendingExit) {
          for (const position of positions.splice(0)) closeAt(position, i, bar.close, 'SIGNAL');
          pendingExit = false;
        }
        if (pendingEntry !== null && positions.length < spec.maxPositions) {
          const direction = pendingEntry;
          const entryPrice = withSlippage(bar.close, direction === 1 ? 'BUY' : 'SELL', spec);
          const atrValue = atrSeries[i] ?? null;
          const stopDistance = spec.stopLoss ? ruleDistance(spec.stopLoss, entryPrice, atrValue) : null;
          const stop = stopDistance === null ? null : entryPrice - stopDistance * direction;
          const targetDistance = spec.target ? ruleDistance(spec.target, entryPrice, atrValue) : null;
          const quantity = quantityFor(spec, equity, entryPrice, stop);
          if (quantity > 0) {
            positions.push({
              direction,
              quantity,
              entryIndex: i,
              entryPrice,
              entryDate: bar.date,
              entryTime: bar.time,
              stop,
              initialStop: stop,
              target: targetDistance === null ? null : entryPrice + targetDistance * direction,
              extreme: entryPrice,
            });
          }
          pendingEntry = null;
        }
      }
    }
  }

  // Anything still open when the data runs out is closed at the last price, marked as such so
  // it is obvious the strategy did not choose to exit there.
  if (positions.length > 0 && bars.length > 0) {
    const last = bars.length - 1;
    for (const position of positions.splice(0)) closeAt(position, last, bars[last].close, 'END_OF_DATA');
    sessionEquity.set(bars[last].date, equity);
  }

  const equityCurve = buildEquityCurve(sessionEquity);
  return { trades, equityCurve, stats: summarise(spec, bars, trades, equityCurve, barsWithPosition, options.riskFreeRatePercent) };
}

function buildEquityCurve(sessionEquity: Map<string, number>): BacktestEquityPoint[] {
  let peak = Number.NEGATIVE_INFINITY;
  const points: BacktestEquityPoint[] = [];
  for (const [date, value] of sessionEquity) {
    peak = Math.max(peak, value);
    points.push({ date, equity: fmt(value), drawdownPercent: fmt(peak > 0 ? ((value - peak) / peak) * 100 : 0) });
  }
  return points;
}

function summarise(
  spec: StrategySpec,
  bars: Bar[],
  trades: BacktestTrade[],
  equityCurve: BacktestEquityPoint[],
  barsWithPosition: number,
  riskFreeRatePercent: string,
): BacktestStats {
  const startingCapital = Number(spec.startingCapital);
  const ending = equityCurve.length > 0 ? Number(equityCurve[equityCurve.length - 1].equity) : startingCapital;
  const wins = trades.filter((trade) => Number(trade.netPnl) > 0);
  const losses = trades.filter((trade) => Number(trade.netPnl) < 0);
  const grossWin = wins.reduce((total, trade) => total + Number(trade.netPnl), 0);
  const grossLoss = losses.reduce((total, trade) => total + Math.abs(Number(trade.netPnl)), 0);
  const totalCharges = trades.reduce((total, trade) => total + Number(trade.charges.total), 0);
  const grossProfit = trades.reduce((total, trade) => total + Math.max(Number(trade.grossPnl), 0), 0);

  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdownPercent = 0;
  let maxDrawdownAmount = 0;
  for (const point of equityCurve) {
    const value = Number(point.equity);
    peak = Math.max(peak, value);
    maxDrawdownPercent = Math.min(maxDrawdownPercent, Number(point.drawdownPercent));
    maxDrawdownAmount = Math.min(maxDrawdownAmount, value - peak);
  }

  const from = bars.length > 0 ? bars[0].date : null;
  const to = bars.length > 0 ? bars[bars.length - 1].date : null;
  const years = from && to ? Math.max((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 / 365, 0) : 0;
  const cagr = years > 0.05 && startingCapital > 0 && ending > 0 ? (Math.pow(ending / startingCapital, 1 / years) - 1) * 100 : null;

  return {
    startingCapital: fmt(startingCapital),
    endingCapital: fmt(ending),
    netPnl: fmt(ending - startingCapital),
    returnPercent: fmt(startingCapital > 0 ? ((ending - startingCapital) / startingCapital) * 100 : 0),
    cagrPercent: cagr === null ? null : fmt(cagr),
    maxDrawdownPercent: fmt(maxDrawdownPercent),
    maxDrawdownAmount: fmt(maxDrawdownAmount),
    sharpe: sharpeRatio(equityCurve, riskFreeRatePercent),
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePercent: fmt(trades.length > 0 ? (wins.length / trades.length) * 100 : 0),
    averageWin: fmt(wins.length > 0 ? grossWin / wins.length : 0),
    averageLoss: fmt(losses.length > 0 ? -grossLoss / losses.length : 0),
    expectancy: fmt(trades.length > 0 ? (grossWin - grossLoss) / trades.length : 0),
    profitFactor: grossLoss > 0 ? fmt(grossWin / grossLoss) : null,
    totalCharges: fmt(totalCharges),
    chargesPercentOfGross: grossProfit > 0 ? fmt((totalCharges / grossProfit) * 100) : null,
    exposurePercent: fmt(bars.length > 0 ? (barsWithPosition / bars.length) * 100 : 0),
    averageBarsHeld: fmt(trades.length > 0 ? trades.reduce((total, trade) => total + trade.barsHeld, 0) / trades.length : 0),
    from,
    to,
    bars: bars.length,
  };
}

/**
 * Sharpe on session returns, annualised by √252 with the risk-free rate taken off first.
 *
 * Stated because Sharpe is quoted carelessly more often than not: this is the ratio of the mean
 * excess session return to its sample standard deviation, scaled to a year. A strategy with a
 * handful of trades will produce a meaningless number, so it is withheld below 20 sessions.
 */
function sharpeRatio(equityCurve: BacktestEquityPoint[], riskFreeRatePercent: string): string | null {
  if (equityCurve.length < 20) return null;
  const dailyRiskFree = Number(riskFreeRatePercent) / 100 / SESSIONS_PER_YEAR;
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const previous = Number(equityCurve[i - 1].equity);
    if (previous <= 0) continue;
    returns.push(Number(equityCurve[i].equity) / previous - 1 - dailyRiskFree);
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance = returns.reduce((total, value) => total + (value - mean) ** 2, 0) / (returns.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? fmt((mean / sd) * Math.sqrt(SESSIONS_PER_YEAR), 2) : null;
}

function perYearBreakdown(trades: BacktestTrade[], startingCapital: number): YearBreakdown[] {
  const years = new Map<string, BacktestTrade[]>();
  for (const trade of trades) {
    const year = trade.exitDate.slice(0, 4);
    const list = years.get(year);
    if (list) list.push(trade);
    else years.set(year, [trade]);
  }
  let equity = startingCapital;
  return [...years.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, yearTrades]) => {
      const net = yearTrades.reduce((total, trade) => total + Number(trade.netPnl), 0);
      const opening = equity;
      equity += net;
      return {
        year,
        trades: yearTrades.length,
        netPnl: fmt(net),
        winRatePercent: fmt((yearTrades.filter((trade) => Number(trade.netPnl) > 0).length / yearTrades.length) * 100),
        returnPercent: fmt(opening > 0 ? (net / opening) * 100 : 0),
      };
    });
}

/**
 * The overfitting note.
 *
 * There is no statistic that proves a backtest was curve-fitted, so this does not pretend to
 * one. It counts the things that make overfitting likely — many tunable numbers, few trades to
 * tune them against, many attempts — and says so plainly. The trades-per-parameter rule of
 * thumb (want at least 30, be suspicious under 10) is the one most quantitative trading texts
 * settle on.
 */
function overfittingWarning(spec: StrategySpec, trades: number, runsSoFar: number, walkForward: WalkForwardReport | null): string | null {
  const parameters = countParameters(spec);
  const reasons: string[] = [];
  const perParameter = parameters > 0 ? trades / parameters : trades;
  if (trades < 30) reasons.push(`only ${trades} trade${trades === 1 ? '' : 's'} came out of this run, which is too few to tell an edge from luck`);
  if (parameters >= 6) reasons.push(`the rules have ${parameters} tunable numbers in them`);
  if (parameters > 0 && perParameter < 10) reasons.push(`that is ${fmt(perParameter, 1)} trades for each tunable number, where 30 or more is the usual bar`);
  if (runsSoFar >= 10) reasons.push(`you have run ${runsSoFar} variations of this strategy, and the best of many tries beats the market by chance alone`);
  if (walkForward && Number(walkForward.outOfSample.netPnl) <= 0 && Number(walkForward.inSample.netPnl) > 0) {
    reasons.push('the strategy made money on the first half of the data and lost it on the second, which is the signature of a fitted rule');
  }
  if (reasons.length === 0) return null;
  return `Treat this result with suspicion: ${reasons.join('; ')}. A backtest is a description of the past, and the easiest way to make one look good is to keep changing the rules until it does.`;
}

// ---- entry point ----

/**
 * Runs a strategy over bars and reports what happened.
 *
 * The caller is responsible for loading the bars, and for having capped how many it loaded —
 * this refuses anything over MAX_BACKTEST_BARS as a second line of defence.
 */
export function runBacktest(
  spec: StrategySpec,
  bars: Bar[],
  options: BacktestOptions = {},
  settings: TradingSettingsRecord | null = null,
): BacktestResult {
  validateSpec(spec);
  const maxBars = Math.min(options.maxBars ?? MAX_BACKTEST_BARS, MAX_BACKTEST_BARS);
  if (bars.length > maxBars) {
    throw DomainError.validation('LAB_TOO_MANY_BARS', `A run is limited to ${maxBars.toLocaleString('en-IN')} bars; this one asked for ${bars.length.toLocaleString('en-IN')}. Narrow the date range.`);
  }
  if (bars.length < 2) {
    throw DomainError.validation('LAB_NOT_ENOUGH_BARS', 'There need to be at least two bars to run anything. Import price data for this symbol first.');
  }

  const startedAt = Date.now();
  const riskFreeRatePercent = options.riskFreeRatePercent ?? '6.5';
  const timeBudgetMs = Math.min(options.timeBudgetMs ?? MAX_BACKTEST_MILLISECONDS, MAX_BACKTEST_MILLISECONDS);
  const runOptions = { riskFreeRatePercent, timeBudgetMs };

  const buildContext = (slice: Bar[]): EvalContext => {
    const specs = new Map<string, IndicatorSpec>();
    collectIndicators(spec.entry, specs);
    if (spec.exit) collectIndicators(spec.exit, specs);
    const series = new Map<string, Series>();
    for (const [key, indicator] of specs) series.set(key, computeIndicator(indicator, slice));
    // The exit rules can be measured in ATRs, so one is always available under a reserved key.
    const atrPeriod = spec.stopLoss?.period ?? spec.target?.period ?? spec.trailingStop?.period ?? 14;
    series.set('__atr', atr(slice, atrPeriod));
    return { bars: slice, series };
  };

  const main = runOne(spec, bars, buildContext(bars), runOptions, settings);

  let walkForward: WalkForwardReport | null = null;
  if (options.walkForwardSplit !== null && options.walkForwardSplit !== undefined) {
    const fraction = Math.min(Math.max(options.walkForwardSplit, 0.1), 0.9);
    const cut = Math.floor(bars.length * fraction);
    if (cut > 1 && bars.length - cut > 1) {
      // Each half gets its own indicator warm-up, which is the point: the out-of-sample run
      // must not be able to see anything from the in-sample period, not even an EMA's state.
      const inBars = bars.slice(0, cut);
      const outBars = bars.slice(cut);
      const inSample = runOne(spec, inBars, buildContext(inBars), runOptions, settings).stats;
      const outOfSample = runOne(spec, outBars, buildContext(outBars), runOptions, settings).stats;
      const held = Number(outOfSample.returnPercent) > 0 && Number(inSample.returnPercent) > 0;
      walkForward = {
        splitPercent: fmt(fraction * 100),
        splitDate: bars[cut].date,
        inSample,
        outOfSample,
        verdict: held
          ? 'The strategy made money on both halves. That is the minimum bar, not proof of an edge — two halves of one price series are not two independent tests.'
          : Number(inSample.returnPercent) > 0
            ? 'The strategy made money before the split and lost it after. That is what a curve-fitted rule looks like.'
            : 'The strategy did not make money in the in-sample half either, so the split says little.',
      };
    }
  }

  return {
    spec,
    stats: main.stats,
    trades: main.trades,
    equityCurve: main.equityCurve,
    perYear: perYearBreakdown(main.trades, Number(spec.startingCapital)),
    walkForward,
    overfittingWarning: overfittingWarning(spec, main.trades.length, options.runsSoFar ?? 0, walkForward),
    assumptions: [
      spec.execution.fill === 'NEXT_BAR_OPEN'
        ? 'Orders fill at the next bar’s open after the signal.'
        : 'Orders fill at the signal bar’s close, which you could not actually have traded at.',
      spec.execution.slippage > 0
        ? `Slippage of ${spec.execution.slippage} ${spec.execution.slippageType === 'POINTS' ? 'points' : 'basis points'} against you on entry and on exit.`
        : 'No slippage assumed, which is optimistic.',
      `Charges from the statutory table for ${spec.execution.segment} on ${spec.execution.exchange}, on both legs of every trade.`,
      'When a bar contains both the stop and the target, the stop is taken.',
      'A gap through the stop or the target fills at the open, not at the level.',
      `Sharpe annualised over ${SESSIONS_PER_YEAR} sessions at a ${riskFreeRatePercent}% risk-free rate.`,
      'No randomness anywhere: the same spec and the same bars give exactly these numbers again.',
    ],
    disclaimer: BACKTEST_DISCLAIMER,
    elapsedMs: Date.now() - startedAt,
  };
}
