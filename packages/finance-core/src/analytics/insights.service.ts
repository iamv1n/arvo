import { AccountType, TransactionType } from '@arvo/types';
import { DomainError } from '../errors';
import { formatMoney, parseMoney, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import type { RecurringSeriesRecord, TransactionRecord } from '../records';
import { AccountService } from '../services/account.service';
import { AnalyticsService, classifyAggregate, type PeriodInput } from '../services/analytics.service';
import { requireCurrency, requireDate } from '../services/validation';
import { detectRecurring, RECURRING_TYPES } from './recurring';

const RECURRING_LOOKBACK_MONTHS = 14;
const INVESTMENT_ACCOUNT_TYPES: AccountType[] = [AccountType.BROKER, AccountType.MUTUAL_FUND];

export interface CategoryChange {
  categoryId: string | null;
  name: string;
  current: string;
  previous: string;
  /** current − previous (positive = spent more). */
  change: string;
  /** Percentage change with one decimal; null when previous is zero. */
  changePercent: number | null;
}

export interface PeriodComparison {
  current: { from: string; to: string; income: string; expenses: string; netCashflow: string; transactionCount: number };
  previous: { from: string; to: string; income: string; expenses: string; netCashflow: string; transactionCount: number };
  change: { income: string; expenses: string; netCashflow: string; expensesPercent: number | null };
  categoryChanges: CategoryChange[];
  /** Largest outflows in the current period, to explain what drove spending. */
  largestExpenses: TransactionRecord[];
  currency: string;
}

export interface MerchantSpend {
  merchantId: string | null;
  name: string;
  amount: string;
  transactionCount: number;
}

export interface RecurringOverview {
  currency: string;
  asOf: string;
  series: RecurringSeriesRecord[];
  /** Sum of monthlyCost over active, not dismissed series. */
  monthlyTotal: string;
  annualTotal: string;
}

/** The structured monthly picture AI and dashboards build on. */
export interface FinancialSnapshot {
  period: string;
  currency: string;
  income: string;
  expenses: string;
  /** Money moved into broker and mutual fund accounts (transfers), not spending. */
  investments: string;
  netCashflow: string;
  savingsRate: number | null;
  /** Current balance of asset accounts in this currency. */
  accountBalance: string;
  liabilities: string;
  netWorth: string;
  recurringExpenses: string;
  topCategories: { name: string; amount: string }[];
  transactionCount: number;
}

export class InsightsService {
  private readonly analytics: AnalyticsService;

  constructor(private readonly store: FinanceStore) {
    this.analytics = new AnalyticsService(store);
  }

  async comparePeriods(
    userId: string,
    input: { current: { from: string; to: string }; previous: { from: string; to: string }; currency: string; accountId?: string },
  ): Promise<PeriodComparison> {
    const currency = requireCurrency(input.currency);
    const [current, previous] = await Promise.all([
      this.analytics.summary(userId, { ...input.current, currency, accountId: input.accountId }),
      this.analytics.summary(userId, { ...input.previous, currency, accountId: input.accountId }),
    ]);

    const byCategory = new Map<string, { categoryId: string | null; name: string; current: MoneyUnits; previous: MoneyUnits }>();
    const add = (list: typeof current.spendingByTopCategory, field: 'current' | 'previous') => {
      for (const c of list) {
        const key = c.categoryId ?? 'none';
        const entry = byCategory.get(key) ?? { categoryId: c.categoryId, name: c.name, current: 0n, previous: 0n };
        entry[field] += parseMoney(c.amount);
        byCategory.set(key, entry);
      }
    };
    add(current.spendingByTopCategory, 'current');
    add(previous.spendingByTopCategory, 'previous');

    const categoryChanges = [...byCategory.values()]
      .map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        current: formatMoney(c.current),
        previous: formatMoney(c.previous),
        change: formatMoney(c.current - c.previous),
        changePercent: percentChange(c.current, c.previous),
        abs: c.current - c.previous < 0n ? c.previous - c.current : c.current - c.previous,
      }))
      .sort((a, b) => (b.abs > a.abs ? 1 : b.abs < a.abs ? -1 : a.name.localeCompare(b.name, 'en')))
      .map(({ abs: _abs, ...rest }) => rest);

    const largestExpenses = await this.store.transactions.findLargestOutflows(
      userId,
      { ...input.current, currency, accountId: input.accountId, types: [TransactionType.EXPENSE, TransactionType.FEE] },
      5,
    );

    const pick = (s: typeof current) => ({
      from: s.from,
      to: s.to,
      income: s.income,
      expenses: s.expenses,
      netCashflow: s.netCashflow,
      transactionCount: s.transactionCount,
    });
    return {
      currency,
      current: pick(current),
      previous: pick(previous),
      change: {
        income: formatMoney(parseMoney(current.income) - parseMoney(previous.income)),
        expenses: formatMoney(parseMoney(current.expenses) - parseMoney(previous.expenses)),
        netCashflow: formatMoney(parseMoney(current.netCashflow) - parseMoney(previous.netCashflow)),
        expensesPercent: percentChange(parseMoney(current.expenses), parseMoney(previous.expenses)),
      },
      categoryChanges,
      largestExpenses,
    };
  }

  /** Compares a calendar month with the month before it. */
  compareMonths(userId: string, month: string, currency: string): Promise<PeriodComparison> {
    const current = monthRange(month);
    const previousMonth = shiftMonth(month, -1);
    return this.comparePeriods(userId, { current, previous: monthRange(previousMonth), currency });
  }

  async spendingByMerchant(userId: string, input: PeriodInput): Promise<MerchantSpend[]> {
    const currency = requireCurrency(input.currency);
    const from = requireDate('from', input.from);
    const to = requireDate('to', input.to);
    if (from > to) throw DomainError.validation('INVALID_DATE_RANGE', 'from must not be after to');
    const [rows, merchants] = await Promise.all([
      this.store.transactions.aggregateByMerchant(userId, { from, to, currency, accountId: input.accountId }),
      this.store.merchants.findAll(userId),
    ]);
    const names = new Map(merchants.map((m) => [m.id, m.name]));
    const totals = new Map<string | null, { amount: MoneyUnits; count: number }>();
    for (const row of rows) {
      const { expense } = classifyAggregate(row);
      if (expense === 0n) continue;
      const entry = totals.get(row.merchantId) ?? { amount: 0n, count: 0 };
      entry.amount += expense;
      entry.count += row.count;
      totals.set(row.merchantId, entry);
    }
    return [...totals]
      .map(([merchantId, v]) => ({
        merchantId,
        name: merchantId ? (names.get(merchantId) ?? 'Unknown merchant') : 'No merchant',
        amount: formatMoney(v.amount),
        transactionCount: v.count,
        units: v.amount,
      }))
      .sort((a, b) => (b.units > a.units ? 1 : b.units < a.units ? -1 : a.name.localeCompare(b.name, 'en')))
      .map(({ units: _units, ...rest }) => rest);
  }

  /** Detects recurring charges over the last 14 months, persists them and returns the overview. */
  async recurring(userId: string, input: { currency: string; asOf: string }): Promise<RecurringOverview> {
    const currency = requireCurrency(input.currency);
    const asOf = requireDate('asOf', input.asOf);
    const from = `${shiftMonth(asOf.slice(0, 7), -RECURRING_LOOKBACK_MONTHS)}-01`;
    const [transactions, merchants] = await Promise.all([
      this.store.transactions.findInPeriod(userId, { from, to: asOf, currency, types: RECURRING_TYPES }),
      this.store.merchants.findAll(userId),
    ]);
    const detected = detectRecurring(transactions, { asOf, merchantNames: new Map(merchants.map((m) => [m.id, m.name])) });
    await this.store.recurring.sync(
      userId,
      detected.map((s) => ({ ...s, userId })),
    );
    const series = (await this.store.recurring.findAll(userId))
      .filter((s) => s.currency === currency)
      .sort((a, b) => {
        const diff = parseMoney(b.monthlyCost) - parseMoney(a.monthlyCost);
        return diff !== 0n ? (diff > 0n ? 1 : -1) : a.label.localeCompare(b.label, 'en');
      });
    const monthly = series
      .filter((s) => s.status === 'ACTIVE' && !s.isDismissed)
      .reduce((sum, s) => sum + parseMoney(s.monthlyCost), 0n);
    return { currency, asOf, series, monthlyTotal: formatMoney(monthly), annualTotal: formatMoney(monthly * 12n) };
  }

  async setRecurringDismissed(userId: string, id: string, isDismissed: boolean): Promise<RecurringSeriesRecord> {
    if (!(await this.store.recurring.findById(userId, id))) {
      throw DomainError.notFound('RECURRING_NOT_FOUND', 'Recurring charge not found');
    }
    return this.store.recurring.setDismissed(userId, id, isDismissed);
  }

  async snapshot(userId: string, input: { month: string; currency: string; asOf: string }): Promise<FinancialSnapshot> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
      throw DomainError.validation('INVALID_INPUT', 'month must be YYYY-MM', { field: 'month' });
    }
    const currency = requireCurrency(input.currency);
    const range = monthRange(input.month);
    const [summary, worth, recurring, accounts, transfers] = await Promise.all([
      this.analytics.summary(userId, { ...range, currency }),
      this.analytics.netWorth(userId, currency),
      this.recurring(userId, { currency, asOf: input.asOf }),
      new AccountService(this.store).list(userId),
      this.store.transactions.findInPeriod(userId, { ...range, currency, types: [TransactionType.TRANSFER] }),
    ]);
    const investmentAccounts = new Set(accounts.filter((a) => INVESTMENT_ACCOUNT_TYPES.includes(a.type)).map((a) => a.id));
    const investments = transfers
      .filter((t) => investmentAccounts.has(t.accountId) && parseMoney(t.amount) > 0n)
      .reduce((sum, t) => sum + parseMoney(t.amount), 0n);
    return {
      period: input.month,
      currency,
      income: summary.income,
      expenses: summary.expenses,
      investments: formatMoney(investments),
      netCashflow: summary.netCashflow,
      savingsRate: summary.savingsRate,
      accountBalance: worth.assets,
      liabilities: worth.liabilities,
      netWorth: worth.netWorth,
      recurringExpenses: recurring.monthlyTotal,
      topCategories: summary.spendingByTopCategory.slice(0, 5).map((c) => ({ name: c.name, amount: c.amount })),
      transactionCount: summary.transactionCount,
    };
  }
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function percentChange(current: MoneyUnits, previous: MoneyUnits): number | null {
  if (previous <= 0n) return null;
  const scaled = ((current - previous) * 2000n) / previous;
  const rounded = scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n;
  return Number(rounded) / 10;
}
