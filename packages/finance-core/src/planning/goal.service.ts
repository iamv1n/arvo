import { DomainError } from '../errors';
import { formatMoney, parseMoney, scaleToCents, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import type { GoalPatch, GoalRecord } from '../records';
import { AccountService } from '../services/account.service';
import { requireCurrency, requireDate, requireMoney, requireText } from '../services/validation';
import { percentOf } from './budget.service';

/*
 * Savings goals. Progress is the linked account's balance (clamped at zero) or the manually
 * saved amount. Expected progress grows linearly from the goal's creation date to its target
 * date; a goal behind that line is "behind".
 */

export type GoalStatus = 'on_track' | 'behind' | 'achieved';

export interface CreateGoalInput {
  name: string;
  targetAmount: string;
  currency: string;
  targetDate: string;
  accountId?: string | null;
  savedAmount?: string;
}

export type UpdateGoalInput = Partial<Omit<CreateGoalInput, 'currency'>>;

export interface GoalProgress extends GoalRecord {
  accountName: string | null;
  /** Progress amount used for status (account balance or savedAmount). */
  current: string;
  remaining: string;
  /** current / target × 100, one decimal, capped at 100. */
  percent: number;
  /** Where linear progress from creation says the goal should be today. */
  expected: string;
  expectedPercent: number;
  /** Contribution months left including the current partial month; 0 once past the target date. */
  monthsLeft: number;
  /** remaining / monthsLeft rounded to cents; the full remaining when no months are left. */
  requiredMonthly: string;
  status: GoalStatus;
}

export interface GoalsResult {
  asOf: string;
  goals: GoalProgress[];
}

const DAY_MS = 86_400_000;
const toDay = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** Calendar months from asOf to targetDate, counting a trailing partial month as one. */
export function goalMonthsLeft(asOf: string, targetDate: string): number {
  if (targetDate < asOf) return 0;
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [ty, tm, td] = targetDate.split('-').map(Number);
  const months = (ty - ay) * 12 + (tm - am) + (td > ad ? 1 : 0);
  return Math.max(1, months);
}

export class GoalService {
  private readonly accounts: AccountService;

  constructor(private readonly store: FinanceStore) {
    this.accounts = new AccountService(store);
  }

  async require(userId: string, id: string): Promise<GoalRecord> {
    const goal = await this.store.goals.findById(userId, id);
    if (!goal) throw DomainError.notFound('GOAL_NOT_FOUND', 'Goal not found');
    return goal;
  }

  async create(userId: string, input: CreateGoalInput): Promise<GoalRecord> {
    const currency = requireCurrency(input.currency);
    const accountId = input.accountId ?? null;
    if (accountId) await this.requireAccount(userId, accountId, currency);
    return this.store.goals.create({
      userId,
      name: requireText('name', input.name, 120),
      targetAmount: formatMoney(requirePositive('targetAmount', input.targetAmount)),
      currency,
      targetDate: requireDate('targetDate', input.targetDate),
      accountId,
      savedAmount: formatMoney(requireNonNegative('savedAmount', input.savedAmount ?? '0')),
    });
  }

  async update(userId: string, id: string, input: UpdateGoalInput): Promise<GoalRecord> {
    const goal = await this.require(userId, id);
    const patch: GoalPatch = {};
    if (input.name !== undefined) patch.name = requireText('name', input.name, 120);
    if (input.targetAmount !== undefined) patch.targetAmount = formatMoney(requirePositive('targetAmount', input.targetAmount));
    if (input.targetDate !== undefined) patch.targetDate = requireDate('targetDate', input.targetDate);
    if (input.savedAmount !== undefined) patch.savedAmount = formatMoney(requireNonNegative('savedAmount', input.savedAmount));
    if (input.accountId !== undefined) {
      if (input.accountId) await this.requireAccount(userId, input.accountId, goal.currency);
      patch.accountId = input.accountId ?? null;
    }
    return this.store.goals.update(userId, id, patch);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.store.goals.delete(userId, id);
  }

  async status(userId: string, input: { asOf: string }): Promise<GoalsResult> {
    const asOf = requireDate('asOf', input.asOf);
    const [goals, accounts] = await Promise.all([this.store.goals.findAll(userId), this.accounts.list(userId)]);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const rows = goals
      .map((goal) => progress(goal, asOf, goal.accountId ? byId.get(goal.accountId) : undefined))
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.name.localeCompare(b.name, 'en'));
    return { asOf, goals: rows };
  }

  private async requireAccount(userId: string, accountId: string, currency: string): Promise<void> {
    const account = await this.store.accounts.findById(userId, accountId);
    if (!account) throw DomainError.notFound('ACCOUNT_NOT_FOUND', 'Account not found');
    if (account.currency !== currency) {
      throw DomainError.validation('CURRENCY_MISMATCH', 'The linked account must use the goal currency', { field: 'accountId' });
    }
  }
}

function progress(goal: GoalRecord, asOf: string, account?: { name: string; balance: string }): GoalProgress {
  const target = parseMoney(goal.targetAmount);
  const raw = account ? parseMoney(account.balance) : parseMoney(goal.savedAmount);
  const current = raw > 0n ? raw : 0n;
  const remaining = current >= target ? 0n : target - current;

  const start = toDay(goal.createdAt.toISOString().slice(0, 10));
  const end = toDay(goal.targetDate);
  const today = toDay(asOf);
  const span = BigInt(Math.max(1, end - start));
  const elapsed = BigInt(Math.min(Math.max(0, today - start), Number(span)));
  const expected = end <= start ? target : scaleToCents(target, elapsed, span);

  const monthsLeft = goalMonthsLeft(asOf, goal.targetDate);
  const requiredMonthly: MoneyUnits = remaining === 0n ? 0n : monthsLeft === 0 ? remaining : scaleToCents(remaining, 1n, BigInt(monthsLeft));
  const status: GoalStatus = remaining === 0n ? 'achieved' : current < expected ? 'behind' : 'on_track';

  return {
    ...goal,
    accountName: account?.name ?? null,
    current: formatMoney(current),
    remaining: formatMoney(remaining),
    percent: Math.min(100, percentOf(current, target)),
    expected: formatMoney(expected),
    expectedPercent: percentOf(expected, target),
    monthsLeft,
    requiredMonthly: formatMoney(requiredMonthly),
    status,
  };
}

function requirePositive(field: string, value: string): MoneyUnits {
  const units = requireMoney(field, value);
  if (units <= 0n) throw DomainError.validation('INVALID_AMOUNT', `${field} must be greater than zero`, { field });
  return units;
}

function requireNonNegative(field: string, value: string): MoneyUnits {
  const units = requireMoney(field, value);
  if (units < 0n) throw DomainError.validation('INVALID_AMOUNT', `${field} must not be negative`, { field });
  return units;
}
