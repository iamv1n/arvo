import { TransactionType } from '@arvo/types';
import { absMoney, formatMoney, parseMoney, type MoneyUnits } from '../money';
import type { RecurringFrequency, RecurringSeriesUpsert, TransactionRecord } from '../records';
import { descriptionPatternKey } from '../rules/categorizer';

/*
 * Deterministic recurring-charge detection.
 *
 * 1. Group outflows (EXPENSE, FEE) by merchant, or by description pattern (letters only, so
 *    changing reference numbers still group) when there is no merchant.
 * 2. A group needs at least MIN_OCCURRENCES charges whose median interval matches a known
 *    frequency and whose intervals mostly fall inside that frequency's window.
 * 3. At least half of the charges must be within ±20% of the typical amount, so variable
 *    spending (fuel, cabs, coffee) is not mistaken for a subscription or bill.
 * 4. Confidence = 0.45 × interval regularity + 0.35 × amount similarity + 0.20 × history depth.
 * 5. A price increase is flagged only when earlier charges were stable (within ±5%) and the
 *    latest charge is higher than the one before it.
 * Same input always yields the same series, in the same order.
 */

export const RECURRING_TYPES = [TransactionType.EXPENSE, TransactionType.FEE];
const MIN_OCCURRENCES = 3;
const MIN_CONFIDENCE = 0.6;

interface FrequencySpec {
  frequency: RecurringFrequency;
  minDays: number;
  maxDays: number;
  months: number | null;
  days: number | null;
  /** Numerator/denominator converting one charge to a monthly equivalent. */
  perMonth: [bigint, bigint];
}

const FREQUENCIES: FrequencySpec[] = [
  { frequency: 'WEEKLY', minDays: 6, maxDays: 8, months: null, days: 7, perMonth: [52n, 12n] },
  { frequency: 'BIWEEKLY', minDays: 13, maxDays: 16, months: null, days: 14, perMonth: [26n, 12n] },
  { frequency: 'MONTHLY', minDays: 26, maxDays: 35, months: 1, days: null, perMonth: [1n, 1n] },
  { frequency: 'QUARTERLY', minDays: 80, maxDays: 100, months: 3, days: null, perMonth: [1n, 3n] },
  { frequency: 'YEARLY', minDays: 350, maxDays: 380, months: 12, days: null, perMonth: [1n, 12n] },
];

const DAY_MS = 86_400_000;
const toDay = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS;

function addInterval(date: string, spec: FrequencySpec): string {
  const [y, m, d] = date.split('-').map(Number);
  if (spec.months) {
    const target = new Date(Date.UTC(y, m - 1 + spec.months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(y, m - 1, d + (spec.days ?? 0))).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianUnits(values: MoneyUnits[]): MoneyUnits {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function groupKey(t: Pick<TransactionRecord, 'merchantId' | 'description'>): string | null {
  if (t.merchantId) return `m:${t.merchantId}`;
  const pattern = descriptionPatternKey(t.description);
  return pattern.length >= 3 ? `d:${pattern}` : null;
}

export interface DetectionOptions {
  /** YYYY-MM-DD used to decide whether a series is still active. */
  asOf: string;
  merchantNames?: Map<string, string>;
}

export function detectRecurring(
  transactions: TransactionRecord[],
  options: DetectionOptions,
): Omit<RecurringSeriesUpsert, 'userId'>[] {
  const groups = new Map<string, TransactionRecord[]>();
  for (const t of transactions) {
    if (!RECURRING_TYPES.includes(t.type) || parseMoney(t.amount) >= 0n) continue;
    const key = groupKey(t);
    if (!key) continue;
    // Series never mix accounts or currencies.
    const fullKey = `${key}|${t.accountId}|${t.currency}`;
    const list = groups.get(fullKey) ?? [];
    list.push(t);
    groups.set(fullKey, list);
  }

  const result: Omit<RecurringSeriesUpsert, 'userId'>[] = [];
  for (const [fullKey, items] of groups) {
    const charges = collapseSameDay(items);
    if (charges.length < MIN_OCCURRENCES) continue;

    const intervals = charges.slice(1).map((c, i) => toDay(c.date) - toDay(charges[i].date));
    const typical = median(intervals);
    const spec = FREQUENCIES.find((f) => typical >= f.minDays && typical <= f.maxDays);
    if (!spec) continue;

    const regular = intervals.filter((d) => d >= spec.minDays && d <= spec.maxDays).length / intervals.length;
    if (regular < 0.6) continue;

    const amounts = charges.map((c) => absMoney(parseMoney(c.amount)));
    const expected = medianUnits(amounts.slice(-3));
    const similar = amounts.filter((a) => within(a, expected, 20n)).length / amounts.length;
    if (similar < 0.5) continue;
    const depth = Math.min(1, charges.length / 6);
    const confidence = round2(0.45 * regular + 0.35 * similar + 0.2 * depth);
    if (confidence < MIN_CONFIDENCE) continue;

    const last = charges[charges.length - 1];
    const earlier = amounts.slice(0, -1);
    const earlierReference = medianUnits(earlier);
    const priceIncreased =
      amounts[amounts.length - 1] > earlier[earlier.length - 1] && earlier.every((a) => within(a, earlierReference, 5n));
    const nextExpected = addInterval(last.date, spec);
    // Stopped when the next charge is overdue by more than half an interval.
    const overdueDays = toDay(options.asOf) - toDay(nextExpected);
    const status = overdueDays > Math.max(7, (spec.minDays + spec.maxDays) / 4) ? 'STOPPED' : 'ACTIVE';

    const [key] = fullKey.split('|');
    const merchantId = key.startsWith('m:') ? key.slice(2) : null;
    const label = merchantId ? (options.merchantNames?.get(merchantId) ?? last.description) : titleFromPattern(key.slice(2));
    const [numerator, denominator] = spec.perMonth;
    const categoryCounts = new Map<string, number>();
    for (const c of charges) if (c.categoryId) categoryCounts.set(c.categoryId, (categoryCounts.get(c.categoryId) ?? 0) + 1);
    const categoryId = [...categoryCounts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;

    result.push({
      key: fullKey,
      label,
      merchantId,
      categoryId,
      accountId: last.accountId,
      currency: last.currency,
      frequency: spec.frequency,
      expectedAmount: formatMoney(expected),
      monthlyCost: formatMoney(roundToCents(divideRounded(expected * numerator, denominator))),
      lastAmount: formatMoney(amounts[amounts.length - 1]),
      previousAmount: amounts.length > 1 ? formatMoney(amounts[amounts.length - 2]) : null,
      lastSeen: last.date,
      nextExpected,
      occurrences: charges.length,
      priceIncreased,
      confidence,
      status,
      transactionIds: charges.map((c) => c.id),
    });
  }
  return result.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Two charges from the same group on the same day count once (e.g. a split payment). */
function collapseSameDay(items: TransactionRecord[]): TransactionRecord[] {
  const byDate = new Map<string, TransactionRecord>();
  for (const t of [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : 1))) {
    const existing = byDate.get(t.date);
    if (!existing) byDate.set(t.date, t);
    else if (absMoney(parseMoney(t.amount)) > absMoney(parseMoney(existing.amount))) byDate.set(t.date, t);
  }
  return [...byDate.values()];
}

function within(value: MoneyUnits, reference: MoneyUnits, percent: bigint): boolean {
  const diff = value > reference ? value - reference : reference - value;
  return diff * 100n <= reference * percent;
}

function divideRounded(numerator: MoneyUnits, denominator: bigint): MoneyUnits {
  return (numerator * 2n + denominator) / (2n * denominator);
}

/** Derived amounts are shown in minor currency units: round half away from zero to 0.01. */
function roundToCents(units: MoneyUnits): MoneyUnits {
  const sign = units < 0n ? -1n : 1n;
  const abs = units * sign;
  return sign * (((abs + 50n) / 100n) * 100n);
}

function titleFromPattern(pattern: string): string {
  return pattern
    .toLowerCase()
    .split(' ')
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
