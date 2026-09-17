import { AccountType } from '@arvo/types';
import { DomainError } from '../errors';
import { formatMoney, parseMoney, scaleToCents, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import type { ScenarioPatch, ScenarioRecord } from '../records';
import { monthRange, shiftMonth } from '../analytics/insights.service';
import { AccountService } from '../services/account.service';
import { AnalyticsService } from '../services/analytics.service';
import { optionalText, requireCurrency, requireDate, requireMoney, requireText } from '../services/validation';
import { GoalService } from './goal.service';
import {
  assessAffordability,
  DEFAULT_BUFFER_MONTHS,
  MAX_BUFFER_MONTHS,
  monthIndex,
  normalizeAdjustments,
  PROJECTION_MONTHS,
  projectWhatIf,
  type AffordabilityResult,
  type PlanningBaseline,
  type ScenarioAdjustment,
  type WhatIfResult,
} from './projection';

/*
 * Scenario engine: builds the planning baseline from the ledger and runs affordability checks and
 * what-if projections on it (pure maths in projection.ts). Saved scenarios store only named
 * adjustments; they are re-run against today's baseline, so they stay current.
 */

export const BASELINE_MONTHS = 3;
export const MAX_COMPARE = 5;
const LIQUID_ACCOUNT_TYPES: AccountType[] = [AccountType.BANK, AccountType.CASH];

export interface CreateScenarioInput {
  name: string;
  description?: string | null;
  adjustments: unknown;
}

export type UpdateScenarioInput = Partial<CreateScenarioInput>;

export interface ScenarioComparison {
  currency: string;
  asOf: string;
  baseline: PlanningBaseline;
  months: string[];
  /** Baseline balance per month (same for every scenario). */
  baselineSeries: string[];
  scenarios: {
    id: string;
    name: string;
    monthlyChange: string;
    yearlyImpact: string;
    endBalance: string;
    series: string[];
  }[];
}

export class ScenarioService {
  private readonly analytics: AnalyticsService;
  private readonly accounts: AccountService;
  private readonly goals: GoalService;

  constructor(private readonly store: FinanceStore) {
    this.analytics = new AnalyticsService(store);
    this.accounts = new AccountService(store);
    this.goals = new GoalService(store);
  }

  /** Liquid cash now, averages over the last three full months and goal contributions. */
  async baseline(userId: string, input: { currency: string; asOf: string }): Promise<PlanningBaseline> {
    const currency = requireCurrency(input.currency);
    const asOf = requireDate('asOf', input.asOf);
    const lastFull = shiftMonth(asOf.slice(0, 7), -1);
    const from = monthRange(shiftMonth(lastFull, -(BASELINE_MONTHS - 1))).from;
    const to = monthRange(lastFull).to;
    const [accounts, monthly, summary, goals] = await Promise.all([
      this.accounts.list(userId),
      this.analytics.monthly(userId, { from, to, currency }),
      this.analytics.summary(userId, { from, to, currency }),
      this.goals.status(userId, { asOf }),
    ]);
    const n = BigInt(BASELINE_MONTHS);
    const liquid = accounts
      .filter((a) => a.currency === currency && LIQUID_ACCOUNT_TYPES.includes(a.type))
      .reduce((sum, a) => sum + parseMoney(a.balance), 0n);
    const income = scaleToCents(monthly.reduce((sum, m) => sum + parseMoney(m.income), 0n), 1n, n);
    const expenses = scaleToCents(monthly.reduce((sum, m) => sum + parseMoney(m.expenses), 0n), 1n, n);
    const goalContributions = goals.goals
      .filter((g) => g.currency === currency && g.status !== 'achieved' && g.monthsLeft > 0)
      .reduce((sum, g) => sum + parseMoney(g.requiredMonthly), 0n);

    const categories = new Map<string, { categoryId: string; name: string; monthly: MoneyUnits }>();
    for (const c of [...summary.spendingByTopCategory, ...summary.spendingByCategory]) {
      if (!c.categoryId || categories.has(c.categoryId)) continue;
      categories.set(c.categoryId, { categoryId: c.categoryId, name: c.name, monthly: scaleToCents(parseMoney(c.amount), 1n, n) });
    }
    return {
      currency,
      asOf,
      liquid: formatMoney(liquid),
      monthlyIncome: formatMoney(income),
      monthlyExpenses: formatMoney(expenses),
      goalContributions: formatMoney(goalContributions),
      monthlySurplus: formatMoney(income - expenses - goalContributions),
      months: monthly.map((m) => m.month),
      categories: [...categories.values()]
        .filter((c) => c.monthly > 0n)
        .sort((a, b) => (b.monthly > a.monthly ? 1 : b.monthly < a.monthly ? -1 : a.name.localeCompare(b.name, 'en')))
        .map((c) => ({ ...c, monthly: formatMoney(c.monthly) })),
    };
  }

  async affordability(
    userId: string,
    input: { currency: string; asOf: string; amount: string; date?: string; bufferMonths?: number },
  ): Promise<AffordabilityResult> {
    const asOf = requireDate('asOf', input.asOf);
    const amount = requireMoney('amount', input.amount);
    if (amount <= 0n) throw DomainError.validation('INVALID_AMOUNT', 'amount must be greater than zero', { field: 'amount' });
    const date = requireDate('date', input.date ?? asOf);
    const index = monthIndex(asOf, date);
    if (date < asOf || index > PROJECTION_MONTHS) {
      throw DomainError.validation('INVALID_DATE', `date must be between today and ${PROJECTION_MONTHS} months ahead`, { field: 'date' });
    }
    const bufferMonths = input.bufferMonths ?? DEFAULT_BUFFER_MONTHS;
    if (!Number.isFinite(bufferMonths) || bufferMonths < 0 || bufferMonths > MAX_BUFFER_MONTHS || Math.round(bufferMonths * 10) !== bufferMonths * 10) {
      throw DomainError.validation('INVALID_INPUT', `bufferMonths must be between 0 and ${MAX_BUFFER_MONTHS} with one decimal`, { field: 'bufferMonths' });
    }
    const baseline = await this.baseline(userId, { currency: input.currency, asOf });
    return assessAffordability(baseline, { amount: formatMoney(amount), date, bufferMonths });
  }

  async whatIf(userId: string, input: { currency: string; asOf: string; adjustments: unknown }): Promise<WhatIfResult> {
    const asOf = requireDate('asOf', input.asOf);
    const adjustments = normalizeAdjustments(asOf, input.adjustments);
    await this.requireCategories(userId, adjustments);
    const baseline = await this.baseline(userId, { currency: input.currency, asOf });
    return projectWhatIf(baseline, adjustments);
  }

  list(userId: string): Promise<ScenarioRecord[]> {
    return this.store.scenarios.findAll(userId);
  }

  async require(userId: string, id: string): Promise<ScenarioRecord> {
    const scenario = await this.store.scenarios.findById(userId, id);
    if (!scenario) throw DomainError.notFound('SCENARIO_NOT_FOUND', 'Scenario not found');
    return scenario;
  }

  async create(userId: string, input: CreateScenarioInput & { asOf: string }): Promise<ScenarioRecord> {
    const adjustments = normalizeAdjustments(requireDate('asOf', input.asOf), input.adjustments);
    await this.requireCategories(userId, adjustments);
    return this.store.scenarios.create({
      userId,
      name: requireText('name', input.name, 120),
      description: optionalText('description', input.description, 500),
      adjustments,
    });
  }

  async update(userId: string, id: string, input: UpdateScenarioInput & { asOf: string }): Promise<ScenarioRecord> {
    await this.require(userId, id);
    const patch: ScenarioPatch = {};
    if (input.name !== undefined) patch.name = requireText('name', input.name, 120);
    if (input.description !== undefined) patch.description = optionalText('description', input.description, 500);
    if (input.adjustments !== undefined) {
      patch.adjustments = normalizeAdjustments(requireDate('asOf', input.asOf), input.adjustments);
      await this.requireCategories(userId, patch.adjustments);
    }
    return this.store.scenarios.update(userId, id, patch);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.store.scenarios.delete(userId, id);
  }

  /**
   * Runs a saved scenario against today's baseline. Months that have passed since it was saved
   * are clamped: one-offs in the past are dropped, recurring changes start next month.
   */
  async run(userId: string, id: string, input: { currency: string; asOf: string }): Promise<WhatIfResult & { scenario: ScenarioRecord }> {
    const scenario = await this.require(userId, id);
    const baseline = await this.baseline(userId, input);
    return { ...projectWhatIf(baseline, current(baseline.asOf, scenario.adjustments)), scenario };
  }

  async compare(userId: string, ids: string[], input: { currency: string; asOf: string }): Promise<ScenarioComparison> {
    const unique = [...new Set(ids)];
    if (unique.length === 0 || unique.length > MAX_COMPARE) {
      throw DomainError.validation('INVALID_INPUT', `Compare between 1 and ${MAX_COMPARE} scenarios`, { field: 'ids' });
    }
    const scenarios = await Promise.all(unique.map((id) => this.require(userId, id)));
    const baseline = await this.baseline(userId, input);
    const runs = scenarios.map((s) => ({ s, r: projectWhatIf(baseline, current(baseline.asOf, s.adjustments)) }));
    const first = projectWhatIf(baseline, []);
    return {
      currency: baseline.currency,
      asOf: baseline.asOf,
      baseline,
      months: first.series.map((p) => p.month),
      baselineSeries: first.series.map((p) => p.baseline),
      scenarios: runs.map(({ s, r }) => ({
        id: s.id,
        name: s.name,
        monthlyChange: r.monthlyChange,
        yearlyImpact: r.yearlyImpact,
        endBalance: r.endBalance.scenario,
        series: r.series.map((p) => p.scenario),
      })),
    };
  }

  private async requireCategories(userId: string, adjustments: ScenarioAdjustment[]): Promise<void> {
    const ids = [...new Set(adjustments.flatMap((a) => (a.type === 'category' ? [a.categoryId] : [])))];
    for (const id of ids) {
      if (!(await this.store.categories.findVisibleById(userId, id))) {
        throw DomainError.notFound('CATEGORY_NOT_FOUND', 'Category not found');
      }
    }
  }
}

/** Drops one-offs that are already in the past and clamps start months to the projection window. */
function current(asOf: string, adjustments: ScenarioAdjustment[]): ScenarioAdjustment[] {
  const out: ScenarioAdjustment[] = [];
  for (const a of adjustments) {
    if (a.type === 'one_off') {
      const i = monthIndex(asOf, a.month);
      if (i >= 0 && i <= PROJECTION_MONTHS) out.push(a);
    } else if (a.fromMonth && monthIndex(asOf, a.fromMonth) > PROJECTION_MONTHS) {
      continue;
    } else if (a.fromMonth && monthIndex(asOf, a.fromMonth) < 1) {
      const { fromMonth: _f, ...rest } = a;
      out.push(rest);
    } else {
      out.push(a);
    }
  }
  return out;
}
