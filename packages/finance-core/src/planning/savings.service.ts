import { TransactionType } from '@arvo/types';
import { absMoney, formatMoney, parseMoney, scaleToCents, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import type { CategoryRecord, RecurringFrequency, RecurringSeriesRecord } from '../records';
import { AnalyticsService, classifyAggregate } from '../services/analytics.service';
import { requireCurrency, requireDate } from '../services/validation';
import { InsightsService, monthRange, shiftMonth } from '../analytics/insights.service';

/*
 * Savings opportunities: deterministic, ranked places where the user could keep more money each
 * month. Every figure is exact money computed from the ledger; each item points at the
 * transactions behind it.
 *
 * Basis: the last full calendar month is compared with the average of the three full months
 * before it (a partial current month is too noisy to call "creep").
 *
 * - category_creep: top-level category spend above its trailing average → saving = the excess.
 * - merchant_creep: same for a merchant (recurring merchants are skipped; their price changes
 *   are subscription_price_increase). Excluded from the total when its category already creeps.
 * - subscription_price_increase: active recurring charge whose latest price went up → saving =
 *   the increase normalised to a month. Excluded from the total when its category already creeps.
 * - fees_and_interest: fees and interest charged over the last three full months, monthly average.
 * - one_off_spikes: single large expenses far above their category's usual month. Informational
 *   (saving 0, never in the total).
 * - possibly_unused_subscription is not produced: the ledger has no usage signal, so any rule
 *   would be a guess.
 */

export const SAVINGS_TRAILING_MONTHS = 3;
/** Minimum excess over the trailing average for a creep finding. */
export const CREEP_MIN_EXCESS = '500';
/** Minimum percentage above the trailing average for a creep finding. */
export const CREEP_MIN_PERCENT = 20;
/** Fees and interest below this monthly average are not worth a finding. */
export const FEES_MIN_MONTHLY = '1';
/** A one-off spike must be at least this large… */
export const SPIKE_MIN_AMOUNT = '5000';
/** …and at least this many times its category's average month. */
export const SPIKE_MULTIPLE = 2n;
export const SPIKE_MAX_ITEMS = 3;

export type SavingsKind =
  | 'category_creep'
  | 'merchant_creep'
  | 'subscription_price_increase'
  | 'fees_and_interest'
  | 'one_off_spike';

export type SavingsConfidence = 'high' | 'medium' | 'low';

export interface SavingsOpportunity {
  id: string;
  kind: SavingsKind;
  title: string;
  /** Estimated monthly saving, exact decimal string ("0.00" for informational items). */
  monthlySaving: string;
  /** Informational items and overlapping items are not added to the total. */
  includedInTotal: boolean;
  informational: boolean;
  confidence: SavingsConfidence;
  /** Figures behind the estimate. */
  rationale: {
    /** Amount in the period examined. */
    current: string;
    /** What it is compared with (trailing average, previous price, …); null when not a comparison. */
    baseline: string | null;
    changePercent: number | null;
    period: { from: string; to: string };
    /** Short label for the basis, e.g. "Aug vs 3-month average". */
    basis: string;
  };
  categoryId: string | null;
  merchantId: string | null;
  evidence: {
    /** Transactions page filter. */
    query: Record<string, string>;
    transactionIds: string[];
  };
}

export interface SavingsOpportunitiesResult {
  currency: string;
  asOf: string;
  /** The last full month examined. */
  month: string;
  /** Sum of monthlySaving over items included in the total. */
  totalMonthly: string;
  totalYearly: string;
  opportunities: SavingsOpportunity[];
}

const PER_MONTH: Record<RecurringFrequency, [bigint, bigint]> = {
  WEEKLY: [52n, 12n],
  BIWEEKLY: [26n, 12n],
  MONTHLY: [1n, 1n],
  QUARTERLY: [1n, 3n],
  YEARLY: [1n, 12n],
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1];

function percentAbove(value: MoneyUnits, base: MoneyUnits): number | null {
  if (base <= 0n) return null;
  const scaled = ((value - base) * 2000n) / base;
  return Number(scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n) / 10;
}

function rootOf(categoryId: string | null, byId: Map<string, CategoryRecord>): string | null {
  let current = categoryId ? byId.get(categoryId) : undefined;
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? categoryId;
}

const compareUnits = (a: MoneyUnits, b: MoneyUnits) => (a > b ? 1 : a < b ? -1 : 0);

export class SavingsService {
  private readonly analytics: AnalyticsService;
  private readonly insights: InsightsService;

  constructor(private readonly store: FinanceStore) {
    this.analytics = new AnalyticsService(store);
    this.insights = new InsightsService(store);
  }

  async opportunities(userId: string, input: { currency: string; asOf: string }): Promise<SavingsOpportunitiesResult> {
    const currency = requireCurrency(input.currency);
    const asOf = requireDate('asOf', input.asOf);
    const month = shiftMonth(asOf.slice(0, 7), -1);
    const last = monthRange(month);
    const trailing = Array.from({ length: SAVINGS_TRAILING_MONTHS }, (_, i) => monthRange(shiftMonth(month, -(i + 1))));
    const n = BigInt(SAVINGS_TRAILING_MONTHS);
    const basis = `${monthName(month)} vs ${SAVINGS_TRAILING_MONTHS}-month average`;

    const [lastSummary, history, lastMerchants, merchantHistory, recurring, categories, lastTransactions, recentTransactions] = await Promise.all([
      this.analytics.summary(userId, { ...last, currency }),
      Promise.all(trailing.map((p) => this.analytics.summary(userId, { ...p, currency }))),
      this.insights.spendingByMerchant(userId, { ...last, currency }),
      Promise.all(trailing.map((p) => this.insights.spendingByMerchant(userId, { ...p, currency }))),
      this.insights.recurring(userId, { currency, asOf }),
      this.store.categories.findVisible(userId),
      this.store.transactions.findInPeriod(userId, { ...last, currency, types: [TransactionType.EXPENSE, TransactionType.FEE] }),
      this.store.transactions.findInPeriod(userId, { from: last.from, to: asOf, currency, types: [TransactionType.EXPENSE] }),
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const activeSeries = recurring.series.filter((s) => s.status === 'ACTIVE' && !s.isDismissed);
    const recurringMerchants = new Set(activeSeries.map((s) => s.merchantId).filter((id): id is string => !!id));
    const recurringTransactionIds = new Set(activeSeries.flatMap((s) => s.transactionIds));

    const opportunities: SavingsOpportunity[] = [];

    // ---- category creep ----
    const categoryAverage = new Map<string | null, MoneyUnits>();
    const categoryMonthsWithSpend = new Map<string | null, number>();
    for (const summary of history) {
      for (const c of summary.spendingByTopCategory) {
        categoryAverage.set(c.categoryId, (categoryAverage.get(c.categoryId) ?? 0n) + parseMoney(c.amount));
        if (parseMoney(c.amount) > 0n) categoryMonthsWithSpend.set(c.categoryId, (categoryMonthsWithSpend.get(c.categoryId) ?? 0) + 1);
      }
    }
    for (const [key, total] of categoryAverage) categoryAverage.set(key, scaleToCents(total, 1n, n));

    const creepingCategories = new Set<string | null>();
    for (const c of lastSummary.spendingByTopCategory) {
      const amount = parseMoney(c.amount);
      const average = categoryAverage.get(c.categoryId) ?? 0n;
      const excess = amount - average;
      const above = percentAbove(amount, average);
      if (average <= 0n || above === null || above < CREEP_MIN_PERCENT || excess < parseMoney(CREEP_MIN_EXCESS)) continue;
      creepingCategories.add(c.categoryId);
      const monthsWithSpend = categoryMonthsWithSpend.get(c.categoryId) ?? 0;
      opportunities.push({
        id: `category_creep:${c.categoryId ?? 'none'}`,
        kind: 'category_creep',
        title: c.name,
        monthlySaving: formatMoney(excess),
        includedInTotal: true,
        informational: false,
        confidence: monthsWithSpend === SAVINGS_TRAILING_MONTHS ? 'high' : 'medium',
        rationale: { current: formatMoney(amount), baseline: formatMoney(average), changePercent: above, period: last, basis },
        categoryId: c.categoryId,
        merchantId: null,
        evidence: {
          query: { ...last, type: 'EXPENSE,FEE', ...(c.categoryId ? { categoryId: c.categoryId } : { uncategorized: 'true' }) },
          transactionIds: [],
        },
      });
    }

    // ---- merchant creep ----
    const merchantCategoryCounts = new Map<string, Map<string | null, number>>();
    for (const t of lastTransactions) {
      if (!t.merchantId) continue;
      const counts = merchantCategoryCounts.get(t.merchantId) ?? new Map<string | null, number>();
      const root = rootOf(t.categoryId, categoryById);
      counts.set(root, (counts.get(root) ?? 0) + 1);
      merchantCategoryCounts.set(t.merchantId, counts);
    }
    const merchantRoot = (merchantId: string): string | null => {
      const counts = [...(merchantCategoryCounts.get(merchantId) ?? new Map<string | null, number>())];
      counts.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
      return counts[0]?.[0] ?? null;
    };
    const merchantAverage = new Map<string, MoneyUnits>();
    for (const list of merchantHistory) {
      for (const m of list) if (m.merchantId) merchantAverage.set(m.merchantId, (merchantAverage.get(m.merchantId) ?? 0n) + parseMoney(m.amount));
    }
    for (const m of lastMerchants) {
      if (!m.merchantId || recurringMerchants.has(m.merchantId)) continue;
      const amount = parseMoney(m.amount);
      const average = scaleToCents(merchantAverage.get(m.merchantId) ?? 0n, 1n, n);
      const excess = amount - average;
      const above = percentAbove(amount, average);
      if (average <= 0n || above === null || above < CREEP_MIN_PERCENT || excess < parseMoney(CREEP_MIN_EXCESS)) continue;
      const root = merchantRoot(m.merchantId);
      const overlaps = merchantCategoryCounts.has(m.merchantId) && creepingCategories.has(root);
      opportunities.push({
        id: `merchant_creep:${m.merchantId}`,
        kind: 'merchant_creep',
        title: m.name,
        monthlySaving: formatMoney(excess),
        includedInTotal: !overlaps,
        informational: false,
        confidence: m.transactionCount >= 3 ? 'high' : 'medium',
        rationale: { current: formatMoney(amount), baseline: formatMoney(average), changePercent: above, period: last, basis },
        categoryId: root,
        merchantId: m.merchantId,
        evidence: { query: { ...last, merchantId: m.merchantId }, transactionIds: [] },
      });
    }

    // ---- subscription price increases ----
    for (const s of activeSeries) {
      if (!s.priceIncreased || s.previousAmount === null) continue;
      const increase = parseMoney(s.lastAmount) - parseMoney(s.previousAmount);
      if (increase <= 0n) continue;
      const [num, den] = PER_MONTH[s.frequency];
      const monthly = scaleToCents(increase, num, den);
      const root = rootOf(s.categoryId, categoryById);
      opportunities.push({
        id: `subscription_price_increase:${s.id}`,
        kind: 'subscription_price_increase',
        title: s.label,
        monthlySaving: formatMoney(monthly),
        includedInTotal: !(s.categoryId !== null && creepingCategories.has(root)),
        informational: false,
        confidence: s.confidence >= 0.8 ? 'high' : 'medium',
        rationale: {
          current: s.lastAmount,
          baseline: s.previousAmount,
          changePercent: percentAbove(parseMoney(s.lastAmount), parseMoney(s.previousAmount)),
          period: { from: s.lastSeen, to: s.lastSeen },
          basis: `${s.frequency.toLowerCase()} price, latest vs previous`,
        },
        categoryId: s.categoryId,
        merchantId: s.merchantId,
        evidence: { query: s.merchantId ? { merchantId: s.merchantId } : { search: s.label }, transactionIds: seriesEvidence(s) },
      });
    }

    // ---- fees and interest ----
    const feePeriod = { from: `${shiftMonth(month, -(SAVINGS_TRAILING_MONTHS - 1))}-01`, to: last.to };
    const feeRows = await this.store.transactions.aggregate(userId, { ...feePeriod, currency });
    let fees = 0n;
    let feeCount = 0;
    for (const row of feeRows) {
      const isCharge = row.type === TransactionType.FEE || (row.type === TransactionType.INTEREST && row.direction === 'OUT');
      if (!isCharge) continue;
      fees += classifyAggregate(row).expense;
      feeCount += row.count;
    }
    const feesMonthly = scaleToCents(fees, 1n, n);
    if (feesMonthly >= parseMoney(FEES_MIN_MONTHLY)) {
      const period = feePeriod;
      opportunities.push({
        id: 'fees_and_interest',
        kind: 'fees_and_interest',
        title: 'Fees and interest charges',
        monthlySaving: formatMoney(feesMonthly),
        includedInTotal: true,
        informational: false,
        confidence: feeCount >= SAVINGS_TRAILING_MONTHS ? 'high' : 'medium',
        rationale: { current: formatMoney(fees), baseline: null, changePercent: null, period, basis: `${feeCount} charges over ${SAVINGS_TRAILING_MONTHS} months, monthly average` },
        categoryId: null,
        merchantId: null,
        evidence: { query: { ...period, type: 'FEE,INTEREST', direction: 'OUT' }, transactionIds: [] },
      });
    }

    // ---- one-off spikes (informational) ----
    const spikes = recentTransactions
      .filter((t) => !recurringTransactionIds.has(t.id) && !(t.merchantId && recurringMerchants.has(t.merchantId)))
      .map((t) => ({ t, amount: absMoney(parseMoney(t.amount)), root: rootOf(t.categoryId, categoryById) }))
      .filter(({ amount, root }) => amount >= parseMoney(SPIKE_MIN_AMOUNT) && amount >= (categoryAverage.get(root) ?? 0n) * SPIKE_MULTIPLE)
      .sort((a, b) => compareUnits(b.amount, a.amount) || a.t.date.localeCompare(b.t.date) || a.t.id.localeCompare(b.t.id))
      .slice(0, SPIKE_MAX_ITEMS);
    for (const { t, amount, root } of spikes) {
      const average = categoryAverage.get(root) ?? 0n;
      opportunities.push({
        id: `one_off_spike:${t.id}`,
        kind: 'one_off_spike',
        title: t.description,
        monthlySaving: '0.00',
        includedInTotal: false,
        informational: true,
        confidence: 'low',
        rationale: {
          current: formatMoney(amount),
          baseline: formatMoney(average),
          changePercent: percentAbove(amount, average),
          period: { from: t.date, to: t.date },
          basis: 'single expense vs category average month',
        },
        categoryId: root,
        merchantId: t.merchantId,
        evidence: { query: { from: t.date, to: t.date, search: t.description }, transactionIds: [t.id] },
      });
    }

    opportunities.sort(
      (a, b) =>
        Number(a.informational) - Number(b.informational) ||
        compareUnits(parseMoney(b.monthlySaving), parseMoney(a.monthlySaving)) ||
        compareUnits(parseMoney(b.rationale.current), parseMoney(a.rationale.current)) ||
        a.id.localeCompare(b.id),
    );
    const total = opportunities.filter((o) => o.includedInTotal).reduce((sum, o) => sum + parseMoney(o.monthlySaving), 0n);
    return { currency, asOf, month, totalMonthly: formatMoney(total), totalYearly: formatMoney(total * 12n), opportunities };
  }
}

/** The two latest charges of a series (previous price and increased price). */
function seriesEvidence(s: RecurringSeriesRecord): string[] {
  return s.transactionIds.slice(-2);
}
