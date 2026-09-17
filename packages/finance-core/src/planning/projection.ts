import { DomainError } from '../errors';
import { formatMoney, parseMoney, scaleToCents, type MoneyUnits } from '../money';
import { shiftMonth } from '../analytics/insights.service';

/*
 * Pure scenario maths. A baseline (liquid cash, average monthly income and expenses, goal
 * contributions, average spend per category) is projected forward month by month:
 *
 *   surplus  = income − expenses − goal contributions   (goal money is treated as set aside)
 *   point 0  = liquid cash now (asOf's month)
 *   point i  = liquid + i × surplus, for i = 1…12 (end of the i-th following month)
 *
 * A one-off amount in month m is subtracted from every point from index m on (m = 0 is this
 * month). Recurring adjustments change the surplus of each month from their start month on.
 * No input produces a different result on a different day: everything is relative to asOf.
 */

export const PROJECTION_MONTHS = 12;
export const DEFAULT_BUFFER_MONTHS = 3;
export const MAX_BUFFER_MONTHS = 24;
export const MAX_ADJUSTMENTS = 20;
/** How far ahead affordableFrom looks. */
const AFFORDABLE_SEARCH_MONTHS = 60;

export interface PlanningBaseline {
  currency: string;
  asOf: string;
  /** BANK + CASH balances in the currency. */
  liquid: string;
  /** Average over the last full months. */
  monthlyIncome: string;
  monthlyExpenses: string;
  /** Required monthly contributions of active goals in the currency. */
  goalContributions: string;
  /** income − expenses − goal contributions. */
  monthlySurplus: string;
  /** Full months the averages cover. */
  months: string[];
  /** Average monthly spend per category (top-level rolled up; subcategories on their own). */
  categories: { categoryId: string; name: string; monthly: string }[];
}

export type ScenarioAdjustment =
  | { type: 'category'; categoryId: string; mode: 'amount' | 'percent'; value: string; fromMonth?: string }
  | { type: 'income'; mode: 'amount' | 'percent'; value: string; fromMonth?: string }
  | { type: 'one_off'; month: string; amount: string; label?: string };

export interface ProjectionPoint {
  month: string;
  baseline: string;
  scenario: string;
}

export interface ResolvedAdjustment {
  adjustment: ScenarioAdjustment;
  label: string;
  /** Signed change to the monthly surplus once active (negative = less money); one-offs: the one-off. */
  monthlyImpact: string;
}

export interface WhatIfResult {
  currency: string;
  asOf: string;
  baseline: PlanningBaseline;
  adjustments: ResolvedAdjustment[];
  /** Steady-state change to the monthly surplus (sum of recurring adjustments). */
  monthlyChange: string;
  scenarioSurplus: string;
  /** Scenario − baseline at the end of the 12 months. */
  yearlyImpact: string;
  endBalance: { baseline: string; scenario: string };
  lowest: { month: string; amount: string };
  series: ProjectionPoint[];
}

export type AffordabilityStatus = 'affordable' | 'tight' | 'not_yet';

export interface AffordabilityResult {
  currency: string;
  asOf: string;
  amount: string;
  date: string;
  bufferMonths: number;
  status: AffordabilityStatus;
  baseline: PlanningBaseline;
  /** bufferMonths × monthly expenses. */
  bufferTarget: string;
  /** Projected liquid cash in the purchase month, before and after paying. */
  cashBefore: string;
  cashAfter: string;
  /** cashAfter / monthly expenses, one decimal; null without expenses. */
  bufferMonthsAfter: number | null;
  /** Months of surplus needed to get back to the buffer; 0 when never below; null when the surplus is not positive. */
  monthsToRecover: number | null;
  /** First month in which buying keeps the buffer intact; null if not within 5 years. */
  affordableFrom: string | null;
  series: { month: string; without: string; with: string }[];
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERCENT_PATTERN = /^[+-]?\d{1,4}(\.\d{1,2})?$/;

export function monthIndex(asOf: string, month: string): number {
  const [ay, am] = asOf.slice(0, 7).split('-').map(Number);
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  return (y - ay) * 12 + (m - am);
}

function ratio1(numerator: MoneyUnits, denominator: MoneyUnits): number | null {
  if (denominator <= 0n) return null;
  const scaled = (numerator * 20n) / denominator;
  return Number(scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n) / 10;
}

function ceilDiv(a: MoneyUnits, b: MoneyUnits): number {
  return Number((a + b - 1n) / b);
}

const invalid = (message: string, field: string) => DomainError.validation('INVALID_ADJUSTMENT', message, { field });

/** Validates and canonicalises adjustments (money strings formatted, months checked). */
export function normalizeAdjustments(asOf: string, input: unknown): ScenarioAdjustment[] {
  if (!Array.isArray(input)) throw invalid('adjustments must be a list', 'adjustments');
  if (input.length > MAX_ADJUSTMENTS) throw invalid(`At most ${MAX_ADJUSTMENTS} adjustments`, 'adjustments');
  return input.map((raw, i): ScenarioAdjustment => {
    const field = `adjustments[${i}]`;
    const a = (raw ?? {}) as Record<string, unknown>;
    const month = (key: string, required: boolean): string | undefined => {
      const value = a[key];
      if (value === undefined || value === null) {
        if (required) throw invalid(`${key} is required`, `${field}.${key}`);
        return undefined;
      }
      if (typeof value !== 'string' || !MONTH_PATTERN.test(value)) throw invalid(`${key} must be YYYY-MM`, `${field}.${key}`);
      const idx = monthIndex(asOf, value);
      if (idx < 0 || idx > PROJECTION_MONTHS) throw invalid(`${key} must be within the next ${PROJECTION_MONTHS} months`, `${field}.${key}`);
      return value;
    };
    const signedValue = (mode: unknown): { mode: 'amount' | 'percent'; value: string } => {
      const value = a.value;
      if (mode !== 'amount' && mode !== 'percent') throw invalid('mode must be amount or percent', `${field}.mode`);
      if (typeof value !== 'string') throw invalid('value must be a decimal string', `${field}.value`);
      if (mode === 'percent') {
        if (!PERCENT_PATTERN.test(value.trim()) || Number(value) < -100) throw invalid('percent must be a number ≥ -100', `${field}.value`);
        return { mode, value: String(Number(value)) };
      }
      let units: MoneyUnits;
      try {
        units = parseMoney(value);
      } catch {
        throw invalid('value must be a decimal string', `${field}.value`);
      }
      return { mode, value: formatMoney(units) };
    };
    switch (a.type) {
      case 'category': {
        if (typeof a.categoryId !== 'string' || a.categoryId.length === 0) throw invalid('categoryId is required', `${field}.categoryId`);
        const fromMonth = month('fromMonth', false);
        return { type: 'category', categoryId: a.categoryId, ...signedValue(a.mode), ...(fromMonth ? { fromMonth } : {}) };
      }
      case 'income': {
        const fromMonth = month('fromMonth', false);
        return { type: 'income', ...signedValue(a.mode), ...(fromMonth ? { fromMonth } : {}) };
      }
      case 'one_off': {
        let units: MoneyUnits;
        try {
          units = typeof a.amount === 'string' ? parseMoney(a.amount) : -1n;
        } catch {
          units = -1n;
        }
        if (units <= 0n) throw invalid('amount must be a positive decimal string', `${field}.amount`);
        const label = typeof a.label === 'string' && a.label.trim() ? a.label.trim().slice(0, 80) : undefined;
        return { type: 'one_off', month: month('month', true)!, amount: formatMoney(units), ...(label ? { label } : {}) };
      }
      default:
        throw invalid('type must be category, income or one_off', `${field}.type`);
    }
  });
}

function percentOf(base: MoneyUnits, percent: string): MoneyUnits {
  const basisPoints = BigInt(Math.round(Number(percent) * 100));
  // scaleToCents expects a non-negative numerator; apply the sign afterwards.
  const scaled = scaleToCents(base, basisPoints < 0n ? -basisPoints : basisPoints, 10000n);
  return basisPoints < 0n ? -scaled : scaled;
}

/** Projects the baseline and the adjusted scenario 12 months ahead. */
export function projectWhatIf(baseline: PlanningBaseline, adjustments: ScenarioAdjustment[]): WhatIfResult {
  const surplus = parseMoney(baseline.monthlySurplus);
  const liquid = parseMoney(baseline.liquid);
  const categories = new Map(baseline.categories.map((c) => [c.categoryId, c]));
  const recurring: { from: number; delta: MoneyUnits }[] = [];
  const oneOffs: { index: number; amount: MoneyUnits }[] = [];

  const resolved = adjustments.map((adjustment): ResolvedAdjustment => {
    if (adjustment.type === 'one_off') {
      const amount = parseMoney(adjustment.amount);
      oneOffs.push({ index: monthIndex(baseline.asOf, adjustment.month), amount });
      return { adjustment, label: adjustment.label ?? `One-off in ${adjustment.month}`, monthlyImpact: formatMoney(-amount) };
    }
    const from = Math.max(1, adjustment.fromMonth ? monthIndex(baseline.asOf, adjustment.fromMonth) : 1);
    let delta: MoneyUnits;
    let label: string;
    if (adjustment.type === 'income') {
      const base = parseMoney(baseline.monthlyIncome);
      delta = adjustment.mode === 'amount' ? parseMoney(adjustment.value) : percentOf(base, adjustment.value);
      label = 'Income';
    } else {
      const category = categories.get(adjustment.categoryId);
      const base = category ? parseMoney(category.monthly) : 0n;
      // More spending means less surplus.
      delta = -(adjustment.mode === 'amount' ? parseMoney(adjustment.value) : percentOf(base, adjustment.value));
      label = category?.name ?? 'Category';
    }
    recurring.push({ from, delta });
    return { adjustment, label, monthlyImpact: formatMoney(delta) };
  });

  const series: ProjectionPoint[] = [];
  let base = liquid;
  let scenario = liquid;
  let lowest = { index: 0, amount: 0n };
  for (let i = 0; i <= PROJECTION_MONTHS; i++) {
    if (i > 0) {
      base += surplus;
      scenario += surplus + recurring.filter((r) => i >= r.from).reduce((sum, r) => sum + r.delta, 0n);
    }
    scenario -= oneOffs.filter((o) => o.index === i).reduce((sum, o) => sum + o.amount, 0n);
    if (i === 0 || scenario < lowest.amount) lowest = { index: i, amount: scenario };
    series.push({ month: shiftMonth(baseline.asOf.slice(0, 7), i), baseline: formatMoney(base), scenario: formatMoney(scenario) });
  }
  const monthlyChange = recurring.reduce((sum, r) => sum + r.delta, 0n);
  return {
    currency: baseline.currency,
    asOf: baseline.asOf,
    baseline,
    adjustments: resolved,
    monthlyChange: formatMoney(monthlyChange),
    scenarioSurplus: formatMoney(surplus + monthlyChange),
    yearlyImpact: formatMoney(scenario - base),
    endBalance: { baseline: formatMoney(base), scenario: formatMoney(scenario) },
    lowest: { month: series[lowest.index].month, amount: formatMoney(lowest.amount) },
    series,
  };
}

/** Can the user pay `amount` in `date`'s month and keep `bufferMonths` of expenses in cash? */
export function assessAffordability(
  baseline: PlanningBaseline,
  input: { amount: string; date: string; bufferMonths: number },
): AffordabilityResult {
  const amount = parseMoney(input.amount);
  const index = monthIndex(baseline.asOf, input.date);
  const liquid = parseMoney(baseline.liquid);
  const surplus = parseMoney(baseline.monthlySurplus);
  const expenses = parseMoney(baseline.monthlyExpenses);
  const bufferTarget = scaleToCents(expenses, BigInt(Math.round(input.bufferMonths * 10)), 10n);

  const cashBefore = liquid + BigInt(index) * surplus;
  const cashAfter = cashBefore - amount;
  let status: AffordabilityStatus;
  if (cashAfter >= bufferTarget) status = 'affordable';
  else if (cashAfter >= 0n && surplus > 0n) status = 'tight';
  else status = 'not_yet';

  const monthsToRecover = cashAfter >= bufferTarget ? 0 : surplus > 0n ? ceilDiv(bufferTarget - cashAfter, surplus) : null;
  let affordableFrom: string | null = null;
  for (let i = Math.max(0, index); i <= AFFORDABLE_SEARCH_MONTHS; i++) {
    if (liquid + BigInt(i) * surplus - amount >= bufferTarget) {
      affordableFrom = shiftMonth(baseline.asOf.slice(0, 7), i);
      break;
    }
    if (surplus <= 0n) break;
  }

  const series = Array.from({ length: PROJECTION_MONTHS + 1 }, (_, i) => {
    const without = liquid + BigInt(i) * surplus;
    return {
      month: shiftMonth(baseline.asOf.slice(0, 7), i),
      without: formatMoney(without),
      with: formatMoney(i >= index ? without - amount : without),
    };
  });

  return {
    currency: baseline.currency,
    asOf: baseline.asOf,
    amount: formatMoney(amount),
    date: input.date,
    bufferMonths: input.bufferMonths,
    status,
    baseline,
    bufferTarget: formatMoney(bufferTarget),
    cashBefore: formatMoney(cashBefore),
    cashAfter: formatMoney(cashAfter),
    bufferMonthsAfter: ratio1(cashAfter, expenses),
    monthsToRecover,
    affordableFrom,
    series,
  };
}
