import { TransactionType } from '@arvo/types';
import { DomainError } from '../errors';
import { formatMoney, parseMoney, scaleToCents, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import type { BudgetPatch, BudgetRecord, CategoryRecord } from '../records';
import { monthRange, shiftMonth } from '../analytics/insights.service';
import { requireCurrency, requireDate, requireMoney } from '../services/validation';

/*
 * Category budgets with month pacing. Spent is the sum of EXPENSE and FEE outflows in the
 * budget's category and all of its subcategories. Projection is a linear pace over the
 * elapsed days of the month. All figures use exact money arithmetic.
 */

export type BudgetStatus = 'on_track' | 'at_risk' | 'over';

export interface CreateBudgetInput {
  categoryId: string;
  amount: string;
  currency: string;
  rollover?: boolean;
}

export interface UpdateBudgetInput {
  categoryId?: string;
  amount?: string;
  rollover?: boolean;
}

export interface BudgetPacing extends BudgetRecord {
  categoryName: string;
  /** amount plus carried-over unspent amount from last month (rollover budgets only). */
  limit: string;
  carriedOver: string;
  spent: string;
  /** limit − spent; negative when over. */
  remaining: string;
  /** spent / limit × 100, one decimal. */
  percentUsed: number;
  percentOfMonthElapsed: number;
  /** Linear month-end projection of spent. */
  projected: string;
  /** max(0, projected − limit). */
  projectedOverspend: string;
  status: BudgetStatus;
  transactionCount: number;
}

export interface BudgetStatusResult {
  month: string;
  asOf: string;
  daysInMonth: number;
  daysElapsed: number;
  percentOfMonthElapsed: number;
  budgets: BudgetPacing[];
  totals: { currency: string; limit: string; spent: string; remaining: string; projected: string; percentUsed: number }[];
}

const SPENDING_TYPES = [TransactionType.EXPENSE, TransactionType.FEE];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** numerator / denominator × 100 with one decimal, half away from zero; 0 when denominator ≤ 0. */
export function percentOf(numerator: MoneyUnits | bigint, denominator: MoneyUnits | bigint): number {
  if (denominator <= 0n) return 0;
  const scaled = (numerator * 2000n) / denominator;
  return Number(scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n) / 10;
}

export class BudgetService {
  constructor(private readonly store: FinanceStore) {}

  async list(userId: string): Promise<BudgetRecord[]> {
    return this.store.budgets.findAll(userId);
  }

  async require(userId: string, id: string): Promise<BudgetRecord> {
    const budget = await this.store.budgets.findById(userId, id);
    if (!budget) throw DomainError.notFound('BUDGET_NOT_FOUND', 'Budget not found');
    return budget;
  }

  async create(userId: string, input: CreateBudgetInput): Promise<BudgetRecord> {
    const currency = requireCurrency(input.currency);
    const amount = requirePositive(input.amount);
    await this.requireCategory(userId, input.categoryId);
    await this.assertUnique(userId, input.categoryId, currency, null);
    return this.store.budgets.create({
      userId,
      categoryId: input.categoryId,
      amount: formatMoney(amount),
      currency,
      rollover: input.rollover ?? false,
    });
  }

  async update(userId: string, id: string, input: UpdateBudgetInput): Promise<BudgetRecord> {
    const budget = await this.require(userId, id);
    const patch: BudgetPatch = {};
    if (input.amount !== undefined) patch.amount = formatMoney(requirePositive(input.amount));
    if (input.rollover !== undefined) patch.rollover = input.rollover;
    if (input.categoryId !== undefined && input.categoryId !== budget.categoryId) {
      await this.requireCategory(userId, input.categoryId);
      await this.assertUnique(userId, input.categoryId, budget.currency, id);
      patch.categoryId = input.categoryId;
    }
    return this.store.budgets.update(userId, id, patch);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.store.budgets.delete(userId, id);
  }

  /** Pacing of every budget for `month` (default: asOf's month) as of `asOf`. */
  async status(userId: string, input: { asOf: string; month?: string }): Promise<BudgetStatusResult> {
    const asOf = requireDate('asOf', input.asOf);
    const month = input.month ?? asOf.slice(0, 7);
    if (!MONTH_PATTERN.test(month)) {
      throw DomainError.validation('INVALID_INPUT', 'month must be YYYY-MM', { field: 'month' });
    }
    const range = monthRange(month);
    const daysInMonth = Number(range.to.slice(8, 10));
    const daysElapsed = asOf < range.from ? 0 : asOf > range.to ? daysInMonth : Number(asOf.slice(8, 10));
    const monthElapsed = percentOf(BigInt(daysElapsed), BigInt(daysInMonth));

    const [budgets, categories] = await Promise.all([
      this.store.budgets.findAll(userId),
      this.store.categories.findVisible(userId),
    ]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const currencies = [...new Set(budgets.map((b) => b.currency))].sort();
    const previous = monthRange(shiftMonth(month, -1));

    const spendByCurrency = new Map<string, { current: Map<string, { units: bigint; count: number }>; previous: Map<string, bigint> }>();
    for (const currency of currencies) {
      const needsPrevious = budgets.some((b) => b.currency === currency && b.rollover);
      const [current, prior] = await Promise.all([
        this.store.transactions.findInPeriod(userId, { ...range, currency, types: SPENDING_TYPES }),
        needsPrevious ? this.store.transactions.findInPeriod(userId, { ...previous, currency, types: SPENDING_TYPES }) : [],
      ]);
      const cur = new Map<string, { units: bigint; count: number }>();
      for (const t of current) {
        const units = parseMoney(t.amount);
        if (units >= 0n || !t.categoryId) continue;
        const entry = cur.get(t.categoryId) ?? { units: 0n, count: 0 };
        entry.units += -units;
        entry.count += 1;
        cur.set(t.categoryId, entry);
      }
      const prev = new Map<string, bigint>();
      for (const t of prior) {
        const units = parseMoney(t.amount);
        if (units < 0n && t.categoryId) prev.set(t.categoryId, (prev.get(t.categoryId) ?? 0n) - units);
      }
      spendByCurrency.set(currency, { current: cur, previous: prev });
    }

    const rows: BudgetPacing[] = budgets
      .map((budget) => {
        const scope = descendants(categories, budget.categoryId);
        const spend = spendByCurrency.get(budget.currency)!;
        let spent = 0n;
        let count = 0;
        let previousSpent = 0n;
        for (const id of scope) {
          const entry = spend.current.get(id);
          if (entry) {
            spent += entry.units;
            count += entry.count;
          }
          previousSpent += spend.previous.get(id) ?? 0n;
        }
        const amount = parseMoney(budget.amount);
        const carried = budget.rollover && amount > previousSpent ? amount - previousSpent : 0n;
        const limit = amount + carried;
        const projected =
          daysElapsed === 0 ? spent : daysElapsed >= daysInMonth ? spent : scaleToCents(spent, BigInt(daysInMonth), BigInt(daysElapsed));
        const status: BudgetStatus = spent > limit ? 'over' : projected > limit ? 'at_risk' : 'on_track';
        return {
          ...budget,
          categoryName: names.get(budget.categoryId) ?? 'Unknown',
          limit: formatMoney(limit),
          carriedOver: formatMoney(carried),
          spent: formatMoney(spent),
          remaining: formatMoney(limit - spent),
          percentUsed: percentOf(spent, limit),
          percentOfMonthElapsed: monthElapsed,
          projected: formatMoney(projected),
          projectedOverspend: formatMoney(projected > limit ? projected - limit : 0n),
          status,
          transactionCount: count,
        };
      })
      .sort((a, b) => b.percentUsed - a.percentUsed || a.categoryName.localeCompare(b.categoryName, 'en'));

    const totals = currencies.map((currency) => {
      const group = rows.filter((r) => r.currency === currency);
      const sum = (pick: (r: BudgetPacing) => string) => group.reduce((acc, r) => acc + parseMoney(pick(r)), 0n);
      const limit = sum((r) => r.limit);
      const spent = sum((r) => r.spent);
      return {
        currency,
        limit: formatMoney(limit),
        spent: formatMoney(spent),
        remaining: formatMoney(limit - spent),
        projected: formatMoney(sum((r) => r.projected)),
        percentUsed: percentOf(spent, limit),
      };
    });

    return { month, asOf, daysInMonth, daysElapsed, percentOfMonthElapsed: monthElapsed, budgets: rows, totals };
  }

  private async requireCategory(userId: string, categoryId: string): Promise<CategoryRecord> {
    const category = await this.store.categories.findVisibleById(userId, categoryId);
    if (!category) throw DomainError.notFound('CATEGORY_NOT_FOUND', 'Category not found');
    return category;
  }

  private async assertUnique(userId: string, categoryId: string, currency: string, exceptId: string | null): Promise<void> {
    const existing = await this.store.budgets.findAll(userId);
    if (existing.some((b) => b.categoryId === categoryId && b.currency === currency && b.id !== exceptId)) {
      throw DomainError.conflict('BUDGET_EXISTS', 'A budget for this category already exists');
    }
  }
}

function requirePositive(value: string): MoneyUnits {
  const units = requireMoney('amount', value);
  if (units <= 0n) {
    throw DomainError.validation('INVALID_AMOUNT', 'amount must be greater than zero', { field: 'amount' });
  }
  return units;
}

/** The category id plus every descendant id. */
function descendants(categories: CategoryRecord[], rootId: string): Set<string> {
  const scope = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && scope.has(c.parentId) && !scope.has(c.id)) {
        scope.add(c.id);
        grew = true;
      }
    }
  }
  return scope;
}
