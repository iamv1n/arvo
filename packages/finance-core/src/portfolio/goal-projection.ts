import { formatMoney, parseMoney } from '../money';
import type { AssetClass } from './types';
import type { Position } from './valuation';

/*
 * Goal projection by Monte Carlo — an estimate, not a forecast and not advice.
 *
 * Assumptions, all stated in the result so a reader can disagree with them:
 *  - Monthly returns are drawn from a normal distribution whose annual mean and volatility
 *    depend on the asset class (ASSET_CLASS_ASSUMPTIONS below). They are long-run Indian
 *    averages, not a view on the next year.
 *  - The blend is the value-weighted mix of the holdings mapped to the goal, rebalanced back
 *    to that mix every month.
 *  - Monthly contributions, if given, arrive at the start of each month and are invested at
 *    the same blend. Inflation is not modelled; enter the target in today's rupees or inflate
 *    it yourself.
 *  - Taxes, exit loads and charges are not deducted.
 *
 * Reproducibility: the generator is a 32-bit mulberry32 seeded with PROJECTION_SEED, and the
 * normal draws use a deterministic Box–Muller pair. The same inputs always give the same
 * numbers, which is what makes the result testable and what makes it honest to show twice.
 */

export const PROJECTION_SEED = 0x5eed_1234;
export const PROJECTION_PATHS = 2000;

export interface ReturnAssumption {
  /** Expected annual return as a percent, e.g. "12". */
  annualReturnPercent: string;
  /** Annual standard deviation as a percent, e.g. "18". */
  annualVolatilityPercent: string;
}

export const ASSET_CLASS_ASSUMPTIONS: Record<AssetClass, ReturnAssumption> = {
  EQUITY: { annualReturnPercent: '12', annualVolatilityPercent: '18' },
  DEBT: { annualReturnPercent: '7', annualVolatilityPercent: '4' },
  GOLD: { annualReturnPercent: '8', annualVolatilityPercent: '15' },
  REAL_ESTATE: { annualReturnPercent: '7', annualVolatilityPercent: '10' },
  CASH: { annualReturnPercent: '4', annualVolatilityPercent: '1' },
  OTHER: { annualReturnPercent: '7', annualVolatilityPercent: '12' },
};

export const PROJECTION_DISCLAIMER =
  'An estimate, not advice or a forecast. It simulates 2,000 futures from long-run averages; real markets will not behave like any of them exactly.';

export interface GoalProjection {
  goalId: string;
  goalName: string;
  targetAmount: string;
  targetDate: string;
  currency: string;
  /** Holdings mapped to this goal. */
  holdingIds: string[];
  currentValue: string;
  monthsLeft: number;
  monthlyContribution: string;
  /** Share of simulated paths that reach the target by the target date, 0–100 with one decimal. */
  probability: number;
  /** Simulated end value at the 10th, 50th and 90th percentile. */
  p10: string;
  p50: string;
  p90: string;
  /** Blend used, value-weighted, as percentages by asset class. */
  blend: { assetClass: AssetClass; percent: number }[];
  assumptions: { paths: number; seed: number; blendReturnPercent: number; blendVolatilityPercent: number };
  disclaimer: string;
}

export interface GoalInput {
  id: string;
  name: string;
  targetAmount: string;
  targetDate: string;
  currency: string;
  /** Planned monthly contribution towards this goal; "0" when none is planned. */
  monthlyContribution?: string;
}

export function projectGoals(goals: GoalInput[], positions: Position[], asOf: string): GoalProjection[] {
  const byGoal = new Map<string, Position[]>();
  for (const position of positions) {
    const goalId = position.holding.goalId;
    if (!goalId || position.value <= 0n) continue;
    const list = byGoal.get(goalId);
    if (list) list.push(position);
    else byGoal.set(goalId, [position]);
  }
  return goals.map((goal) => projectGoal(goal, byGoal.get(goal.id) ?? [], asOf));
}

function projectGoal(goal: GoalInput, positions: Position[], asOf: string): GoalProjection {
  const currentValue = positions.reduce((sum, p) => sum + p.value, 0n);
  const monthsLeft = Math.max(0, monthsUntil(asOf, goal.targetDate));
  const contribution = parseMoney(goal.monthlyContribution ?? '0');
  const target = Number(goal.targetAmount);

  const weights = blendWeights(positions);
  const { annualReturn, annualVolatility } = blendAssumptions(weights);
  const monthlyMean = annualReturn / 12;
  const monthlyVol = annualVolatility / Math.sqrt(12);

  const start = Number(formatMoney(currentValue));
  const monthly = Number(formatMoney(contribution));
  const random = mulberry32(PROJECTION_SEED);
  const ends: number[] = [];
  let reached = 0;

  for (let path = 0; path < PROJECTION_PATHS; path++) {
    let value = start;
    for (let month = 0; month < monthsLeft; month++) {
      value += monthly;
      value *= 1 + monthlyMean + monthlyVol * normal(random);
      if (value < 0) value = 0;
    }
    ends.push(value);
    if (value >= target) reached++;
  }
  ends.sort((a, b) => a - b);

  return {
    goalId: goal.id,
    goalName: goal.name,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    currency: goal.currency,
    holdingIds: positions.map((p) => p.holding.id),
    currentValue: formatMoney(currentValue),
    monthsLeft,
    monthlyContribution: formatMoney(contribution),
    probability: Math.round((reached / PROJECTION_PATHS) * 1000) / 10,
    p10: money(percentile(ends, 0.1)),
    p50: money(percentile(ends, 0.5)),
    p90: money(percentile(ends, 0.9)),
    blend: [...weights.entries()]
      .map(([assetClass, weight]) => ({ assetClass, percent: Math.round(weight * 1000) / 10 }))
      .sort((a, b) => b.percent - a.percent),
    assumptions: {
      paths: PROJECTION_PATHS,
      seed: PROJECTION_SEED,
      blendReturnPercent: Math.round(annualReturn * 1000) / 10,
      blendVolatilityPercent: Math.round(annualVolatility * 1000) / 10,
    },
    disclaimer: PROJECTION_DISCLAIMER,
  };
}

function blendWeights(positions: Position[]): Map<AssetClass, number> {
  const total = positions.reduce((sum, p) => sum + p.value, 0n);
  const weights = new Map<AssetClass, number>();
  if (total <= 0n) {
    // Nothing mapped yet: assume the contributions go into equity, the usual default.
    weights.set('EQUITY', 1);
    return weights;
  }
  for (const position of positions) {
    const share = Number(position.value) / Number(total);
    weights.set(position.holding.assetClass, (weights.get(position.holding.assetClass) ?? 0) + share);
  }
  return weights;
}

function blendAssumptions(weights: Map<AssetClass, number>): { annualReturn: number; annualVolatility: number } {
  let annualReturn = 0;
  let variance = 0;
  for (const [assetClass, weight] of weights) {
    const assumption = ASSET_CLASS_ASSUMPTIONS[assetClass];
    annualReturn += weight * (Number(assumption.annualReturnPercent) / 100);
    // Correlations are not modelled; volatilities are blended linearly, which is conservative.
    variance += weight * (Number(assumption.annualVolatilityPercent) / 100);
  }
  return { annualReturn, annualVolatility: variance };
}

/** mulberry32: small, fast, and identical on every platform. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard normal draw by Box–Muller, taking two uniforms. */
function normal(random: () => number): number {
  const u1 = Math.max(random(), Number.MIN_VALUE);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index];
}

const money = (value: number) => formatMoney(BigInt(Math.round(value * 10_000)));

export function monthsUntil(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td >= fd ? 0 : -1);
}
