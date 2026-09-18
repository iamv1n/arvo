import { DomainError } from '../errors';
import type { BarTimeframe } from './bars';
import type { TradeExchange, TradeSegment } from '../trading/types';

/*
 * The strategy specification.
 *
 * A strategy is data, never code. There is no eval, no Function constructor, no expression
 * string to parse — an entry rule is a small tree of typed nodes that a form can build and the
 * engine can walk. That is the whole security model: the worst a malicious spec can do is
 * describe a condition that is never true.
 *
 * The tree is deliberately shallow and finite. Depth and node count are capped so a spec
 * cannot be nested into something that takes meaningful time to evaluate on every one of a
 * hundred thousand bars, and every numeric parameter has a range.
 *
 * Shape (see the zod schema in the API layer for the wire validation):
 *
 *   Condition := AND/OR(operands) | NOT(operand) | COMPARE(left, op, right) | TIME(before/after)
 *   Operand   := PRICE(field, offset) | INDICATOR(spec, output, offset) | CONSTANT(value)
 */

export const MAX_CONDITION_DEPTH = 6;
export const MAX_CONDITION_NODES = 64;
export const MAX_INDICATOR_PERIOD = 500;

export type PriceField = 'OPEN' | 'HIGH' | 'LOW' | 'CLOSE' | 'VOLUME';

export type IndicatorKind =
  | 'SMA'
  | 'EMA'
  | 'RSI'
  | 'MACD'
  | 'VWAP'
  | 'ATR'
  | 'BOLLINGER'
  | 'SUPERTREND'
  | 'PREV_DAY_HIGH'
  | 'PREV_DAY_LOW'
  | 'PREV_DAY_CLOSE'
  | 'OPENING_RANGE_HIGH'
  | 'OPENING_RANGE_LOW';

/** Which line of a multi-line indicator to read. */
export type IndicatorOutput = 'VALUE' | 'SIGNAL' | 'HISTOGRAM' | 'UPPER' | 'MIDDLE' | 'LOWER' | 'DIRECTION';

export interface IndicatorSpec {
  kind: IndicatorKind;
  /** Look-back, for the indicators that take one. */
  period?: number;
  /** MACD's fast, slow and signal periods. */
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  /** Band width in standard deviations (Bollinger) or ATRs (Supertrend). */
  multiplier?: number;
  /** Bars in the opening range. */
  rangeBars?: number;
  output?: IndicatorOutput;
}

export type Operand =
  | { type: 'PRICE'; field: PriceField; offset?: number }
  | { type: 'INDICATOR'; indicator: IndicatorSpec; offset?: number }
  | { type: 'CONSTANT'; value: number };

export type CompareOp = 'GT' | 'GTE' | 'LT' | 'LTE' | 'CROSSES_ABOVE' | 'CROSSES_BELOW';

export type Condition =
  | { type: 'AND'; operands: Condition[] }
  | { type: 'OR'; operands: Condition[] }
  | { type: 'NOT'; operand: Condition }
  | { type: 'COMPARE'; left: Operand; op: CompareOp; right: Operand }
  | { type: 'TIME_AFTER'; time: string }
  | { type: 'TIME_BEFORE'; time: string }
  | { type: 'ALWAYS' };

export type ExitRuleType = 'PERCENT' | 'POINTS' | 'ATR';

export interface ExitRule {
  type: ExitRuleType;
  value: number;
  /** ATR period, when the rule is measured in ATRs. */
  period?: number;
}

export type SizingMethod = 'FIXED_QUANTITY' | 'FIXED_RISK' | 'FIXED_FRACTIONAL';

export interface SizingRule {
  method: SizingMethod;
  /** Units per trade, for FIXED_QUANTITY. */
  quantity?: number;
  /** Percent of equity risked to the stop (FIXED_RISK) or deployed (FIXED_FRACTIONAL). */
  percent?: number;
  /** Contract multiplier; size is floored to whole lots. */
  lotSize: number;
}

export type FillModel = 'NEXT_BAR_OPEN' | 'SAME_BAR_CLOSE';
export type SlippageType = 'POINTS' | 'BPS';

export interface ExecutionRule {
  fill: FillModel;
  slippageType: SlippageType;
  /** Points, or basis points of the fill price. Always works against the trader. */
  slippage: number;
  /** Which charge table applies. */
  segment: TradeSegment;
  exchange: TradeExchange;
  broker: string;
}

export type StrategyDirection = 'LONG' | 'SHORT' | 'BOTH';

export interface StrategySpec {
  name: string;
  symbol: string;
  timeframe: BarTimeframe;
  direction: StrategyDirection;
  /** Opening capital for the simulation. */
  startingCapital: string;
  entry: Condition;
  /** Exit signal. A strategy with none relies on the stop, target or time exit. */
  exit: Condition | null;
  stopLoss: ExitRule | null;
  target: ExitRule | null;
  /** Ratchets the stop behind the best price reached. */
  trailingStop: ExitRule | null;
  /** Close the position after this many bars, whatever it is doing. */
  maxBarsInTrade: number | null;
  /** Flatten everything at this time of day, HH:MM. Intraday only. */
  intradaySquareOffTime: string | null;
  /** How many positions may be open at once. One, unless you mean pyramiding. */
  maxPositions: number;
  sizing: SizingRule;
  execution: ExecutionRule;
}

export const DEFAULT_EXECUTION: ExecutionRule = {
  fill: 'NEXT_BAR_OPEN',
  slippageType: 'BPS',
  slippage: 5,
  segment: 'EQUITY_INTRADAY',
  exchange: 'NSE',
  broker: 'estimate',
};

// ---- validation ----

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Counter {
  nodes: number;
}

function checkOperand(operand: Operand, counter: Counter): void {
  counter.nodes += 1;
  if (operand.type === 'CONSTANT') {
    if (!Number.isFinite(operand.value)) throw DomainError.validation('LAB_SPEC_INVALID', 'A constant must be a finite number');
    return;
  }
  const offset = operand.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 100) {
    throw DomainError.validation('LAB_SPEC_INVALID', 'A look-back offset must be a whole number of bars between 0 and 100');
  }
  if (operand.type === 'INDICATOR') {
    const { period, fastPeriod, slowPeriod, signalPeriod, rangeBars, multiplier } = operand.indicator;
    for (const value of [period, fastPeriod, slowPeriod, signalPeriod, rangeBars]) {
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 1 || value > MAX_INDICATOR_PERIOD) {
        throw DomainError.validation('LAB_SPEC_INVALID', `An indicator period must be a whole number between 1 and ${MAX_INDICATOR_PERIOD}`);
      }
    }
    if (multiplier !== undefined && (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 100)) {
      throw DomainError.validation('LAB_SPEC_INVALID', 'An indicator multiplier must be between 0 and 100');
    }
  }
}

function checkCondition(condition: Condition, depth: number, counter: Counter): void {
  counter.nodes += 1;
  if (depth > MAX_CONDITION_DEPTH) {
    throw DomainError.validation('LAB_SPEC_TOO_DEEP', `A rule may not nest more than ${MAX_CONDITION_DEPTH} levels deep`);
  }
  if (counter.nodes > MAX_CONDITION_NODES) {
    throw DomainError.validation('LAB_SPEC_TOO_LARGE', `A rule may not have more than ${MAX_CONDITION_NODES} parts`);
  }
  switch (condition.type) {
    case 'AND':
    case 'OR':
      if (condition.operands.length === 0) throw DomainError.validation('LAB_SPEC_INVALID', `An ${condition.type} needs at least one condition`);
      for (const operand of condition.operands) checkCondition(operand, depth + 1, counter);
      return;
    case 'NOT':
      checkCondition(condition.operand, depth + 1, counter);
      return;
    case 'COMPARE':
      checkOperand(condition.left, counter);
      checkOperand(condition.right, counter);
      return;
    case 'TIME_AFTER':
    case 'TIME_BEFORE':
      if (!TIME_PATTERN.test(condition.time)) throw DomainError.validation('LAB_SPEC_INVALID', 'A time condition needs HH:MM');
      return;
    case 'ALWAYS':
      return;
    default: {
      const unreachable: never = condition;
      throw DomainError.validation('LAB_SPEC_INVALID', `Unknown condition ${JSON.stringify(unreachable)}`);
    }
  }
}

function checkExitRule(rule: ExitRule | null, label: string): void {
  if (!rule) return;
  if (!Number.isFinite(rule.value) || rule.value <= 0) throw DomainError.validation('LAB_SPEC_INVALID', `The ${label} must be above zero`);
  if (rule.type === 'PERCENT' && rule.value > 100) throw DomainError.validation('LAB_SPEC_INVALID', `A percentage ${label} above 100% makes no sense`);
  if (rule.period !== undefined && (!Number.isInteger(rule.period) || rule.period < 1 || rule.period > MAX_INDICATOR_PERIOD)) {
    throw DomainError.validation('LAB_SPEC_INVALID', `The ${label} ATR period must be between 1 and ${MAX_INDICATOR_PERIOD}`);
  }
}

/**
 * Rejects a spec the engine would not be able to run, before any bars are loaded.
 *
 * This is belt and braces over the zod schema at the HTTP edge: the same spec arrives from the
 * API, from a saved record written by an older version, and from the MCP layer, and only one
 * of those three has been through the DTO.
 */
export function validateSpec(spec: StrategySpec): void {
  if (!spec.symbol.trim()) throw DomainError.validation('LAB_SPEC_INVALID', 'A strategy needs a symbol to run against');
  if (!Number.isInteger(spec.maxPositions) || spec.maxPositions < 1 || spec.maxPositions > 20) {
    throw DomainError.validation('LAB_SPEC_INVALID', 'Max positions must be a whole number between 1 and 20');
  }
  if (spec.maxBarsInTrade !== null && (!Number.isInteger(spec.maxBarsInTrade) || spec.maxBarsInTrade < 1 || spec.maxBarsInTrade > 100_000)) {
    throw DomainError.validation('LAB_SPEC_INVALID', 'A time-based exit must be a whole number of bars');
  }
  if (spec.intradaySquareOffTime !== null && !TIME_PATTERN.test(spec.intradaySquareOffTime)) {
    throw DomainError.validation('LAB_SPEC_INVALID', 'The square-off time needs HH:MM');
  }
  if (!Number.isInteger(spec.sizing.lotSize) || spec.sizing.lotSize < 1) {
    throw DomainError.validation('LAB_SPEC_INVALID', 'Lot size must be a whole number of at least 1');
  }
  if (spec.sizing.method === 'FIXED_QUANTITY' && (!Number.isInteger(spec.sizing.quantity ?? 0) || (spec.sizing.quantity ?? 0) < 1)) {
    throw DomainError.validation('LAB_SPEC_INVALID', 'Fixed-quantity sizing needs a quantity of at least 1');
  }
  if (spec.sizing.method !== 'FIXED_QUANTITY') {
    const percent = spec.sizing.percent ?? 0;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw DomainError.validation('LAB_SPEC_INVALID', 'Percentage sizing needs a percentage between 0 and 100');
    }
    if (spec.sizing.method === 'FIXED_RISK' && !spec.stopLoss) {
      throw DomainError.validation('LAB_SPEC_INVALID', 'Risk-based sizing needs a stop loss: without one there is no risk to size against');
    }
  }
  if (!Number.isFinite(spec.execution.slippage) || spec.execution.slippage < 0 || spec.execution.slippage > 10_000) {
    throw DomainError.validation('LAB_SPEC_INVALID', 'Slippage must be between 0 and 10000');
  }
  checkExitRule(spec.stopLoss, 'stop loss');
  checkExitRule(spec.target, 'target');
  checkExitRule(spec.trailingStop, 'trailing stop');
  checkCondition(spec.entry, 1, { nodes: 0 });
  if (spec.exit) checkCondition(spec.exit, 1, { nodes: 0 });
  if (!spec.exit && !spec.stopLoss && !spec.target && !spec.trailingStop && !spec.maxBarsInTrade && !spec.intradaySquareOffTime) {
    throw DomainError.validation(
      'LAB_SPEC_NO_EXIT',
      'This strategy has no way to close a position: give it an exit rule, a stop, a trailing stop, a target, a bar limit or a square-off time.',
    );
  }
}

/** Counts the tunable numbers in a spec. The overfitting warning is built on this. */
export function countParameters(spec: StrategySpec): number {
  let count = 0;
  const walkOperand = (operand: Operand) => {
    if (operand.type === 'CONSTANT') count += 1;
    if (operand.type === 'INDICATOR') {
      const { period, fastPeriod, slowPeriod, signalPeriod, rangeBars, multiplier } = operand.indicator;
      count += [period, fastPeriod, slowPeriod, signalPeriod, rangeBars, multiplier].filter((value) => value !== undefined).length;
    }
  };
  const walk = (condition: Condition) => {
    switch (condition.type) {
      case 'AND':
      case 'OR':
        condition.operands.forEach(walk);
        return;
      case 'NOT':
        walk(condition.operand);
        return;
      case 'COMPARE':
        walkOperand(condition.left);
        walkOperand(condition.right);
        return;
      default:
    }
  };
  walk(spec.entry);
  if (spec.exit) walk(spec.exit);
  for (const rule of [spec.stopLoss, spec.target, spec.trailingStop]) if (rule) count += rule.period === undefined ? 1 : 2;
  if (spec.maxBarsInTrade !== null) count += 1;
  if (spec.sizing.method !== 'FIXED_QUANTITY') count += 1;
  return count;
}
