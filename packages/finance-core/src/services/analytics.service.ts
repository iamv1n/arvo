import { LIABILITY_ACCOUNT_TYPES, TransactionType, type AccountType } from '@arvo/types';
import { DomainError } from '../errors';
import { formatMoney, parseMoney, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import type { CategoryRecord, TransactionAggregate } from '../records';
import { AccountService } from './account.service';
import { requireCurrency, requireDate } from './validation';

/*
 * Deterministic financial analytics. Classification rules:
 *   income   = INCOME + positive INTEREST
 *   expenses = EXPENSE + FEE + negative INTEREST − REFUND  (refunds reduce their category)
 *   TRANSFER is never income or expense (e.g. paying a credit card from a bank account).
 *   UNKNOWN is reported separately as unclassified so totals are never silently wrong.
 * Results are for one currency; there is no conversion in MVP.
 */

export interface PeriodInput {
  from: string;
  to: string;
  currency: string;
  accountId?: string;
}

export interface CategorySpend {
  categoryId: string | null;
  name: string;
  parentId: string | null;
  parentName: string | null;
  /** Net spend (positive), after refunds. */
  amount: string;
  transactionCount: number;
}

export interface PeriodSummary {
  from: string;
  to: string;
  currency: string;
  income: string;
  expenses: string;
  /** income − expenses. */
  netCashflow: string;
  /** netCashflow / income as a percentage with one decimal, null when there is no income. */
  savingsRate: number | null;
  transfersVolume: string;
  unclassified: { inflow: string; outflow: string; transactionCount: number };
  spendingByCategory: CategorySpend[];
  /** Top-level categories with their subcategories rolled up. */
  spendingByTopCategory: CategorySpend[];
  transactionCount: number;
}

export interface MonthlyPoint {
  month: string;
  income: string;
  expenses: string;
  netCashflow: string;
}

export interface NetWorthAccount {
  id: string;
  name: string;
  type: AccountType;
  kind: 'ASSET' | 'LIABILITY';
  balance: string;
}

export interface NetWorth {
  currency: string;
  assets: string;
  /** Amount owed, as a positive number. */
  liabilities: string;
  netWorth: string;
  accounts: NetWorthAccount[];
  /** Accounts in other currencies are not included. */
  excludedAccountCount: number;
}

interface Totals {
  income: MoneyUnits;
  expenses: MoneyUnits;
  transfers: MoneyUnits;
  unclassifiedIn: MoneyUnits;
  unclassifiedOut: MoneyUnits;
  unclassifiedCount: number;
  count: number;
}

const zeroTotals = (): Totals => ({
  income: 0n,
  expenses: 0n,
  transfers: 0n,
  unclassifiedIn: 0n,
  unclassifiedOut: 0n,
  unclassifiedCount: 0,
  count: 0,
});

/** Contribution of one bucket to income and expenses (both as positive-growing numbers). */
export function classifyAggregate(row: Pick<TransactionAggregate, 'type' | 'total'>): {
  income: MoneyUnits;
  expense: MoneyUnits;
} {
  const total = parseMoney(row.total);
  switch (row.type) {
    case TransactionType.INCOME:
      return { income: total, expense: 0n };
    case TransactionType.EXPENSE:
    case TransactionType.FEE:
      return { income: 0n, expense: -total };
    case TransactionType.REFUND:
      return { income: 0n, expense: -total };
    case TransactionType.INTEREST:
      return total >= 0n ? { income: total, expense: 0n } : { income: 0n, expense: -total };
    default:
      return { income: 0n, expense: 0n };
  }
}

export class AnalyticsService {
  constructor(private readonly store: FinanceStore) {}

  async summary(userId: string, input: PeriodInput): Promise<PeriodSummary> {
    const filter = validatePeriod(input);
    const [rows, categories] = await Promise.all([
      this.store.transactions.aggregate(userId, filter),
      this.store.categories.findVisible(userId),
    ]);

    const totals = zeroTotals();
    const byCategory = new Map<string | null, { amount: MoneyUnits; count: number }>();
    for (const row of rows) {
      accumulate(totals, row);
      const { expense } = classifyAggregate(row);
      if (expense !== 0n) {
        const entry = byCategory.get(row.categoryId) ?? { amount: 0n, count: 0 };
        entry.amount += expense;
        entry.count += row.count;
        byCategory.set(row.categoryId, entry);
      }
    }

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const leaf = [...byCategory].map(([categoryId, v]) => describeCategory(categoryId, v, categoryById));
    const top = new Map<string | null, { amount: MoneyUnits; count: number }>();
    for (const [categoryId, v] of byCategory) {
      const rootId = rootCategoryId(categoryId, categoryById);
      const entry = top.get(rootId) ?? { amount: 0n, count: 0 };
      entry.amount += v.amount;
      entry.count += v.count;
      top.set(rootId, entry);
    }

    const net = totals.income - totals.expenses;
    return {
      from: filter.from,
      to: filter.to,
      currency: filter.currency,
      income: formatMoney(totals.income),
      expenses: formatMoney(totals.expenses),
      netCashflow: formatMoney(net),
      savingsRate: percentage(net, totals.income),
      transfersVolume: formatMoney(totals.transfers),
      unclassified: {
        inflow: formatMoney(totals.unclassifiedIn),
        outflow: formatMoney(totals.unclassifiedOut),
        transactionCount: totals.unclassifiedCount,
      },
      spendingByCategory: sortSpend(leaf),
      spendingByTopCategory: sortSpend(
        [...top].map(([categoryId, v]) => describeCategory(categoryId, v, categoryById)),
      ),
      transactionCount: totals.count,
    };
  }

  /** One point per calendar month in [from, to], including empty months. */
  async monthly(userId: string, input: PeriodInput): Promise<MonthlyPoint[]> {
    const filter = validatePeriod(input);
    const rows = await this.store.transactions.aggregate(userId, filter);
    const months = new Map(monthsBetween(filter.from, filter.to).map((m) => [m, zeroTotals()]));
    for (const row of rows) {
      const totals = months.get(row.month);
      if (totals) accumulate(totals, row);
    }
    return [...months].map(([month, t]) => ({
      month,
      income: formatMoney(t.income),
      expenses: formatMoney(t.expenses),
      netCashflow: formatMoney(t.income - t.expenses),
    }));
  }

  async netWorth(userId: string, currencyInput: string): Promise<NetWorth> {
    const currency = requireCurrency(currencyInput);
    const accounts = await new AccountService(this.store).list(userId);
    let assets = 0n;
    let liabilities = 0n;
    const included: NetWorthAccount[] = [];
    for (const account of accounts) {
      if (account.currency !== currency) continue;
      const balance = parseMoney(account.balance);
      const kind = LIABILITY_ACCOUNT_TYPES.includes(account.type) ? 'LIABILITY' : 'ASSET';
      if (kind === 'LIABILITY') liabilities -= balance;
      else assets += balance;
      included.push({ id: account.id, name: account.name, type: account.type, kind, balance: account.balance });
    }
    return {
      currency,
      assets: formatMoney(assets),
      liabilities: formatMoney(liabilities),
      netWorth: formatMoney(assets - liabilities),
      accounts: included,
      excludedAccountCount: accounts.length - included.length,
    };
  }
}

function validatePeriod(input: PeriodInput) {
  const from = requireDate('from', input.from);
  const to = requireDate('to', input.to);
  if (from > to) throw DomainError.validation('INVALID_DATE_RANGE', 'from must not be after to');
  if (monthsBetween(from, to).length > 120) {
    throw DomainError.validation('INVALID_DATE_RANGE', 'Period must not exceed 10 years');
  }
  return { from, to, currency: requireCurrency(input.currency), accountId: input.accountId };
}

function accumulate(totals: Totals, row: TransactionAggregate): void {
  const total = parseMoney(row.total);
  totals.count += row.count;
  if (row.type === TransactionType.TRANSFER) {
    if (total > 0n) totals.transfers += total;
    return;
  }
  if (row.type === TransactionType.UNKNOWN) {
    totals.unclassifiedCount += row.count;
    if (total >= 0n) totals.unclassifiedIn += total;
    else totals.unclassifiedOut -= total;
    return;
  }
  const { income, expense } = classifyAggregate(row);
  totals.income += income;
  totals.expenses += expense;
}

function describeCategory(
  categoryId: string | null,
  value: { amount: MoneyUnits; count: number },
  categoryById: Map<string, CategoryRecord>,
): CategorySpend {
  const category = categoryId ? categoryById.get(categoryId) : undefined;
  const parent = category?.parentId ? categoryById.get(category.parentId) : undefined;
  return {
    categoryId,
    name: category?.name ?? 'Uncategorized',
    parentId: parent?.id ?? null,
    parentName: parent?.name ?? null,
    amount: formatMoney(value.amount),
    transactionCount: value.count,
  };
}

function rootCategoryId(categoryId: string | null, categoryById: Map<string, CategoryRecord>): string | null {
  let current = categoryId ? categoryById.get(categoryId) : undefined;
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = categoryById.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? categoryId;
}

function sortSpend(items: CategorySpend[]): CategorySpend[] {
  return items.sort((a, b) => {
    const diff = parseMoney(b.amount) - parseMoney(a.amount);
    return diff !== 0n ? (diff > 0n ? 1 : -1) : a.name.localeCompare(b.name, 'en');
  });
}

function percentage(numerator: MoneyUnits, denominator: MoneyUnits): number | null {
  if (denominator <= 0n) return null;
  // Integer math rounded half away from zero to one decimal place.
  const scaled = (numerator * 2000n) / denominator;
  const rounded = scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n;
  return Number(rounded) / 10;
}

export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [year, month] = from.slice(0, 7).split('-').map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > end || months.length > 1200) break;
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
