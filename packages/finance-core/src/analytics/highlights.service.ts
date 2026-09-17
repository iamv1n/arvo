import { AccountType, TransactionType } from '@arvo/types';
import { absMoney, formatMoney, parseMoney, scaleToCents, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import type { TransactionRecord } from '../records';
import { AccountService } from '../services/account.service';
import { AnalyticsService, classifyAggregate } from '../services/analytics.service';
import { requireCurrency, requireDate } from '../services/validation';
import { InsightsService, monthRange, shiftMonth } from './insights.service';

/*
 * Highlights: short, deterministic findings about the user's money, each with the figures that
 * support it and a pointer to the transactions behind it. The UI turns them into sentences.
 * Every number is computed here with exact money arithmetic; nothing is estimated by AI.
 */

export type HighlightTone = 'positive' | 'negative' | 'neutral' | 'warning';

interface Base {
  id: string;
  tone: HighlightTone;
  /** Transactions filter that shows the evidence (maps to the transactions page query). */
  evidence?: Record<string, string>;
}

export type Highlight =
  | (Base & { kind: 'spending_pace'; spentSoFar: string; projected: string; lastMonth: string; difference: string; dayOfMonth: number; daysInMonth: number })
  | (Base & { kind: 'category_spike'; category: string; categoryId: string | null; month: string; amount: string; average: string; percentAbove: number })
  | (Base & { kind: 'top_merchant'; merchant: string; merchantId: string; amount: string; count: number; perVisit: string })
  | (Base & { kind: 'biggest_expense'; description: string; amount: string; date: string; transactionId: string })
  | (Base & { kind: 'small_purchases'; count: number; total: string; threshold: string; days: number })
  | (Base & { kind: 'no_spend_days'; days: number; daysSoFar: number })
  | (Base & { kind: 'weekend_spending'; weekendPerDay: string; weekdayPerDay: string; ratio: number; days: number })
  | (Base & { kind: 'subscriptions'; monthly: string; yearly: string; count: number; priceIncreases: string[] })
  | (Base & { kind: 'fees_paid'; total: string; count: number; year: string })
  | (Base & { kind: 'cash_runway'; months: number; liquid: string; averageMonthlyExpenses: string })
  | (Base & { kind: 'savings_rate'; rate: number; previousRate: number | null; month: string });

export interface HighlightsResult {
  currency: string;
  asOf: string;
  month: string;
  highlights: Highlight[];
}

const SPENDING_TYPES = [TransactionType.EXPENSE, TransactionType.FEE];
const LIQUID_ACCOUNT_TYPES: AccountType[] = [AccountType.BANK, AccountType.CASH];
const SMALL_PURCHASE_LIMIT = '500';
const DAY_MS = 86_400_000;

const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const addDays = (date: string, days: number) => new Date((toDay(date) + days) * DAY_MS).toISOString().slice(0, 10);
const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

/** Percentage with one decimal, rounded half away from zero; null when the base is not positive. */
function percent(numerator: MoneyUnits, denominator: MoneyUnits): number | null {
  if (denominator <= 0n) return null;
  const scaled = (numerator * 2000n) / denominator;
  return Number(scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n) / 10;
}

/** Ratio with one decimal (e.g. 2.1). */
function ratio(numerator: MoneyUnits, denominator: MoneyUnits): number {
  if (denominator <= 0n) return 0;
  return Number((numerator * 20n + denominator) / (2n * denominator)) / 10;
}

export class HighlightsService {
  private readonly analytics: AnalyticsService;
  private readonly insights: InsightsService;

  constructor(private readonly store: FinanceStore) {
    this.analytics = new AnalyticsService(store);
    this.insights = new InsightsService(store);
  }

  async highlights(userId: string, input: { currency: string; asOf: string }): Promise<HighlightsResult> {
    const currency = requireCurrency(input.currency);
    const asOf = requireDate('asOf', input.asOf);
    const month = asOf.slice(0, 7);
    const current = { from: monthRange(month).from, to: asOf };
    const lastMonth = shiftMonth(month, -1);
    const recentFrom = addDays(asOf, -89);

    const [currentSummary, lastSummary, recent, recurring, accounts, monthlySeries] = await Promise.all([
      this.analytics.summary(userId, { ...current, currency }),
      this.analytics.summary(userId, { ...monthRange(lastMonth), currency }),
      this.store.transactions.findInPeriod(userId, { from: recentFrom, to: asOf, currency, types: SPENDING_TYPES }),
      this.insights.recurring(userId, { currency, asOf }),
      new AccountService(this.store).list(userId),
      this.analytics.monthly(userId, { from: monthRange(shiftMonth(month, -3)).from, to: monthRange(lastMonth).to, currency }),
    ]);

    const highlights: Highlight[] = [];
    const push = (h: Highlight | null) => h && highlights.push(h);

    push(this.spendingPace(asOf, currentSummary.expenses, lastSummary.expenses));
    push(await this.categorySpike(userId, currency, lastMonth));
    push(await this.topMerchant(userId, currency, current));
    push(this.biggestExpense(recent.filter((t) => t.date >= current.from)));
    push(this.smallPurchases(recent, asOf));
    push(this.noSpendDays(recent, current.from, asOf));
    push(this.weekendSpending(recent, recentFrom, asOf));
    push(this.subscriptions(recurring));
    push(await this.feesPaid(userId, currency, asOf));
    push(this.cashRunway(accounts.filter((a) => a.currency === currency), monthlySeries.map((m) => m.expenses)));
    push(this.savingsRate(lastMonth, lastSummary.savingsRate, monthlySeries.at(-2) ? percent(parseMoney(monthlySeries.at(-2)!.netCashflow), parseMoney(monthlySeries.at(-2)!.income)) : null));

    return { currency, asOf, month, highlights };
  }

  private spendingPace(asOf: string, spentSoFar: string, lastMonthExpenses: string): Highlight | null {
    const spent = parseMoney(spentSoFar);
    if (spent <= 0n) return null;
    const dayOfMonth = Number(asOf.slice(8, 10));
    const daysInMonth = Number(monthRange(asOf.slice(0, 7)).to.slice(8, 10));
    const projected = scaleToCents(spent, BigInt(daysInMonth), BigInt(dayOfMonth));
    const last = parseMoney(lastMonthExpenses);
    const difference = projected - last;
    return {
      id: 'spending_pace',
      kind: 'spending_pace',
      tone: last > 0n && difference > last / 10n ? 'warning' : difference < 0n ? 'positive' : 'neutral',
      spentSoFar: formatMoney(spent),
      projected: formatMoney(projected),
      lastMonth: formatMoney(last),
      difference: formatMoney(difference),
      dayOfMonth,
      daysInMonth,
      evidence: { from: monthRange(asOf.slice(0, 7)).from, to: asOf, type: 'EXPENSE,FEE' },
    };
  }

  /** Largest category jump of last full month versus the average of the three months before it. */
  private async categorySpike(userId: string, currency: string, month: string): Promise<Highlight | null> {
    const target = await this.analytics.summary(userId, { ...monthRange(month), currency });
    const history = await Promise.all(
      [1, 2, 3].map((i) => this.analytics.summary(userId, { ...monthRange(shiftMonth(month, -i)), currency })),
    );
    let best: Highlight | null = null;
    let bestExcess = 0n;
    for (const category of target.spendingByTopCategory) {
      const amount = parseMoney(category.amount);
      const past = history.map((h) => parseMoney(h.spendingByTopCategory.find((c) => c.categoryId === category.categoryId)?.amount ?? '0'));
      const average = scaleToCents(past.reduce((a, b) => a + b, 0n), 1n, 3n);
      const excess = amount - average;
      const above = percent(excess, average);
      // Meaningful spikes only: at least 25% and ₹500 above a non-zero average.
      if (average <= 0n || above === null || above < 25 || excess < parseMoney('500')) continue;
      if (excess > bestExcess) {
        bestExcess = excess;
        best = {
          id: `category_spike:${category.categoryId ?? 'none'}`,
          kind: 'category_spike',
          tone: 'warning',
          category: category.name,
          categoryId: category.categoryId,
          month,
          amount: formatMoney(amount),
          average: formatMoney(average),
          percentAbove: above,
          evidence: { ...monthRange(month), ...(category.categoryId ? { categoryId: category.categoryId } : { uncategorized: 'true' }) },
        };
      }
    }
    return best;
  }

  private async topMerchant(userId: string, currency: string, period: { from: string; to: string }): Promise<Highlight | null> {
    const merchants = await this.insights.spendingByMerchant(userId, { ...period, currency });
    // The most frequently paid merchant is more telling than the largest one-off (rent, EMI).
    const top = merchants
      .filter((m) => m.merchantId && parseMoney(m.amount) > 0n && m.transactionCount >= 2)
      .sort((a, b) => b.transactionCount - a.transactionCount || (parseMoney(b.amount) > parseMoney(a.amount) ? 1 : -1))[0];
    if (!top || !top.merchantId) return null;
    const amount = parseMoney(top.amount);
    return {
      id: 'top_merchant',
      kind: 'top_merchant',
      tone: 'neutral',
      merchant: top.name,
      merchantId: top.merchantId,
      amount: top.amount,
      count: top.transactionCount,
      perVisit: formatMoney(scaleToCents(amount, 1n, BigInt(Math.max(1, top.transactionCount)))),
      evidence: { ...period, merchantId: top.merchantId },
    };
  }

  private biggestExpense(transactions: TransactionRecord[]): Highlight | null {
    const biggest = [...transactions].sort((a, b) => {
      const d = parseMoney(a.amount) - parseMoney(b.amount);
      return d !== 0n ? (d < 0n ? -1 : 1) : a.date.localeCompare(b.date);
    })[0];
    if (!biggest) return null;
    return {
      id: 'biggest_expense',
      kind: 'biggest_expense',
      tone: 'neutral',
      description: biggest.description,
      amount: formatMoney(absMoney(parseMoney(biggest.amount))),
      date: biggest.date,
      transactionId: biggest.id,
      evidence: { search: biggest.description },
    };
  }

  private smallPurchases(transactions: TransactionRecord[], asOf: string): Highlight | null {
    const from = addDays(asOf, -29);
    const limit = parseMoney(SMALL_PURCHASE_LIMIT);
    const small = transactions.filter((t) => t.type === TransactionType.EXPENSE && t.date >= from && absMoney(parseMoney(t.amount)) < limit);
    if (small.length < 5) return null;
    const total = small.reduce((sum, t) => sum + absMoney(parseMoney(t.amount)), 0n);
    return {
      id: 'small_purchases',
      kind: 'small_purchases',
      tone: small.length >= 20 ? 'warning' : 'neutral',
      count: small.length,
      total: formatMoney(total),
      threshold: formatMoney(limit),
      days: 30,
      evidence: { from, to: asOf, type: 'EXPENSE', maxAmount: '499.99' },
    };
  }

  private noSpendDays(transactions: TransactionRecord[], from: string, asOf: string): Highlight | null {
    const daysSoFar = toDay(asOf) - toDay(from) + 1;
    // Meaningless without any spending history (e.g. a brand-new account).
    if (daysSoFar < 3 || !transactions.some((t) => t.type === TransactionType.EXPENSE)) return null;
    const spendDays = new Set(transactions.filter((t) => t.type === TransactionType.EXPENSE && t.date >= from && t.date <= asOf).map((t) => t.date));
    const days = daysSoFar - spendDays.size;
    return { id: 'no_spend_days', kind: 'no_spend_days', tone: days >= daysSoFar / 3 ? 'positive' : 'neutral', days, daysSoFar };
  }

  private weekendSpending(transactions: TransactionRecord[], from: string, asOf: string): Highlight | null {
    let weekend = 0n;
    let weekday = 0n;
    for (const t of transactions) {
      if (t.type !== TransactionType.EXPENSE) continue;
      if (isWeekend(t.date)) weekend += absMoney(parseMoney(t.amount));
      else weekday += absMoney(parseMoney(t.amount));
    }
    let weekendDays = 0;
    const total = toDay(asOf) - toDay(from) + 1;
    for (let i = 0; i < total; i++) if (isWeekend(addDays(from, i))) weekendDays++;
    const weekdayDays = total - weekendDays;
    if (weekendDays === 0 || weekdayDays === 0 || weekend === 0n || weekday === 0n) return null;
    const weekendPerDay = scaleToCents(weekend, 1n, BigInt(weekendDays));
    const weekdayPerDay = scaleToCents(weekday, 1n, BigInt(weekdayDays));
    const r = ratio(weekendPerDay, weekdayPerDay);
    if (r < 1.3 && r > 0.77) return null;
    return {
      id: 'weekend_spending',
      kind: 'weekend_spending',
      tone: r >= 1.3 ? 'warning' : 'positive',
      weekendPerDay: formatMoney(weekendPerDay),
      weekdayPerDay: formatMoney(weekdayPerDay),
      ratio: r,
      days: total,
    };
  }

  private subscriptions(recurring: Awaited<ReturnType<InsightsService['recurring']>>): Highlight | null {
    const active = recurring.series.filter((s) => s.status === 'ACTIVE' && !s.isDismissed);
    if (active.length === 0) return null;
    const increases = active.filter((s) => s.priceIncreased).map((s) => s.label);
    return {
      id: 'subscriptions',
      kind: 'subscriptions',
      tone: increases.length ? 'warning' : 'neutral',
      monthly: recurring.monthlyTotal,
      yearly: recurring.annualTotal,
      count: active.length,
      priceIncreases: increases,
    };
  }

  private async feesPaid(userId: string, currency: string, asOf: string): Promise<Highlight | null> {
    const year = asOf.slice(0, 4);
    const rows = await this.store.transactions.aggregate(userId, { from: `${year}-01-01`, to: asOf, currency });
    let total = 0n;
    let count = 0;
    for (const row of rows) {
      const isCharge = row.type === TransactionType.FEE || (row.type === TransactionType.INTEREST && row.direction === 'OUT');
      if (!isCharge) continue;
      total += classifyAggregate(row).expense;
      count += row.count;
    }
    if (total <= 0n) return null;
    return {
      id: 'fees_paid',
      kind: 'fees_paid',
      tone: 'warning',
      total: formatMoney(total),
      count,
      year,
      evidence: { from: `${year}-01-01`, to: asOf, type: 'FEE,INTEREST', direction: 'OUT' },
    };
  }

  /** Months of expenses covered by bank and cash balances, using the average of recent full months. */
  private cashRunway(accounts: { type: AccountType; balance: string }[], monthlyExpenses: string[]): Highlight | null {
    const liquid = accounts.filter((a) => LIQUID_ACCOUNT_TYPES.includes(a.type)).reduce((sum, a) => sum + parseMoney(a.balance), 0n);
    const months = monthlyExpenses.map(parseMoney).filter((m) => m > 0n);
    if (liquid <= 0n || months.length === 0) return null;
    const average = scaleToCents(months.reduce((a, b) => a + b, 0n), 1n, BigInt(months.length));
    if (average <= 0n) return null;
    const runway = ratio(liquid, average);
    return {
      id: 'cash_runway',
      kind: 'cash_runway',
      tone: runway >= 6 ? 'positive' : runway >= 3 ? 'neutral' : 'warning',
      months: runway,
      liquid: formatMoney(liquid),
      averageMonthlyExpenses: formatMoney(average),
    };
  }

  private savingsRate(month: string, rate: number | null, previousRate: number | null): Highlight | null {
    if (rate === null) return null;
    return {
      id: 'savings_rate',
      kind: 'savings_rate',
      tone: rate >= 20 ? 'positive' : rate < 0 ? 'negative' : 'neutral',
      rate,
      previousRate,
      month,
    };
  }
}
