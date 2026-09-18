import { MAX_CONDITION_DEPTH, MAX_INDICATOR_PERIOD, type Condition, type StrategySpec } from '@arvo/finance-core';
import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { ApiError } from '../common/api-exception.filter';

/*
 * Wire validation for a strategy specification.
 *
 * This is the one place in the API that uses zod rather than class-validator, and the reason is
 * the shape: a rule is a recursive tree, and expressing "an AND whose operands are themselves
 * conditions, at most six deep" in decorators means a class hierarchy nobody can read. zod says
 * it in a dozen lines and produces the same typed result.
 *
 * The schema is deliberately closed — `strict()` everywhere, so an unknown key is a 400 rather
 * than something silently ignored. A strategy is data the engine walks; nothing here can ever
 * become code, and there is no path from a request body to an eval.
 *
 * finance-core validates the spec again in `validateSpec` when it runs. That is not redundant:
 * a spec also arrives from a record saved by an earlier version of this schema, and only one of
 * those two paths goes through here.
 */

const period = z.int().min(1).max(MAX_INDICATOR_PERIOD);

const indicatorSpec = z
  .object({
    kind: z.enum([
      'SMA',
      'EMA',
      'RSI',
      'MACD',
      'VWAP',
      'ATR',
      'BOLLINGER',
      'SUPERTREND',
      'PREV_DAY_HIGH',
      'PREV_DAY_LOW',
      'PREV_DAY_CLOSE',
      'OPENING_RANGE_HIGH',
      'OPENING_RANGE_LOW',
    ]),
    period: period.optional(),
    fastPeriod: period.optional(),
    slowPeriod: period.optional(),
    signalPeriod: period.optional(),
    multiplier: z.number().gt(0).max(100).optional(),
    rangeBars: period.optional(),
    output: z.enum(['VALUE', 'SIGNAL', 'HISTOGRAM', 'UPPER', 'MIDDLE', 'LOWER', 'DIRECTION']).optional(),
  })
  .strict();

const offset = z.int().min(0).max(100).optional();

const operand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PRICE'), field: z.enum(['OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME']), offset }).strict(),
  z.object({ type: z.literal('INDICATOR'), indicator: indicatorSpec, offset }).strict(),
  z.object({ type: z.literal('CONSTANT'), value: z.number().finite() }).strict(),
]);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

/**
 * The recursive part. zod needs the type annotation and a getter to tie the knot; the depth cap
 * is enforced by finance-core rather than by the schema, because a zod recursion limit produces
 * an error message nobody can act on.
 */
const condition: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('AND'), operands: z.array(condition).min(1).max(16) }).strict(),
    z.object({ type: z.literal('OR'), operands: z.array(condition).min(1).max(16) }).strict(),
    z.object({ type: z.literal('NOT'), operand: condition }).strict(),
    z.object({ type: z.literal('COMPARE'), left: operand, op: z.enum(['GT', 'GTE', 'LT', 'LTE', 'CROSSES_ABOVE', 'CROSSES_BELOW']), right: operand }).strict(),
    z.object({ type: z.literal('TIME_AFTER'), time }).strict(),
    z.object({ type: z.literal('TIME_BEFORE'), time }).strict(),
    z.object({ type: z.literal('ALWAYS') }).strict(),
  ]),
);

const exitRule = z
  .object({ type: z.enum(['PERCENT', 'POINTS', 'ATR']), value: z.number().gt(0).max(1_000_000), period: period.optional() })
  .strict()
  .nullable();

const positiveMoney = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/, 'Use a positive decimal like 100000 or 1500.50');

export const strategySpecSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    symbol: z.string().trim().min(1).max(64),
    timeframe: z.enum(['DAY', 'MINUTE']),
    direction: z.enum(['LONG', 'SHORT', 'BOTH']),
    startingCapital: positiveMoney,
    entry: condition,
    exit: condition.nullable(),
    stopLoss: exitRule,
    target: exitRule,
    trailingStop: exitRule,
    maxBarsInTrade: z.int().min(1).max(100_000).nullable(),
    intradaySquareOffTime: time.nullable(),
    maxPositions: z.int().min(1).max(20),
    sizing: z
      .object({
        method: z.enum(['FIXED_QUANTITY', 'FIXED_RISK', 'FIXED_FRACTIONAL']),
        quantity: z.int().min(1).max(100_000_000).optional(),
        percent: z.number().gt(0).max(100).optional(),
        lotSize: z.int().min(1).max(100_000),
      })
      .strict(),
    execution: z
      .object({
        fill: z.enum(['NEXT_BAR_OPEN', 'SAME_BAR_CLOSE']),
        slippageType: z.enum(['POINTS', 'BPS']),
        slippage: z.number().min(0).max(10_000),
        segment: z.enum([
          'EQUITY_DELIVERY',
          'EQUITY_INTRADAY',
          'EQUITY_FUTURES',
          'EQUITY_OPTIONS',
          'INDEX_FUTURES',
          'INDEX_OPTIONS',
          'CURRENCY_FUTURES',
          'CURRENCY_OPTIONS',
          'COMMODITY_FUTURES',
          'COMMODITY_OPTIONS',
        ]),
        exchange: z.enum(['NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'BCD', 'MCX']),
        broker: z.string().trim().min(1).max(60),
      })
      .strict(),
  })
  .strict();

/** Parses a strategy spec from a request body, turning a zod failure into the API's error shape. */
export function parseStrategySpec(value: unknown): StrategySpec {
  const parsed = strategySpecSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'The strategy rules are not valid',
      parsed.error.issues.map((issue) => ({ field: ['spec', ...issue.path.map(String)].join('.'), messages: [issue.message] })),
    );
  }
  return parsed.data as StrategySpec;
}

export { MAX_CONDITION_DEPTH };
