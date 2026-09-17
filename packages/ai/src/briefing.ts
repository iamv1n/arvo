import type { BudgetStatus, FinanceCore, GoalStatus, Highlight, SavingsConfidence, SavingsKind } from '@arvo/finance-core';
import { briefingNarrativePrompt } from './prompt';
import type { AIProvider } from './types';

/*
 * Weekly briefing: a deterministic structure assembled from Finance Core services. Every number
 * is copied from a service result. An optional AI narrative may describe it but adds no figures.
 */

export const UPCOMING_DAYS = 7;
const TOP_SAVINGS = 3;
const TOP_HIGHLIGHTS = 4;

export interface Briefing {
  version: 1;
  /** Monday of the briefing week (YYYY-MM-DD). */
  weekStart: string;
  weekEnd: string;
  asOf: string;
  currency: string;
  highlights: Highlight[];
  budgets: {
    month: string;
    percentOfMonthElapsed: number;
    total: { limit: string; spent: string; projected: string; percentUsed: number } | null;
    count: number;
    attention: { budgetId: string; categoryId: string; categoryName: string; limit: string; spent: string; projected: string; projectedOverspend: string; percentUsed: number; status: BudgetStatus }[];
  };
  goals: { goalId: string; name: string; status: GoalStatus; percent: number; current: string; targetAmount: string; remaining: string; requiredMonthly: string; targetDate: string }[];
  savings: {
    month: string;
    totalMonthly: string;
    top: { id: string; kind: SavingsKind; title: string; monthlySaving: string; confidence: SavingsConfidence; basis: string }[];
  };
  upcoming: { label: string; amount: string; date: string; frequency: string }[];
  upload: { overdue: boolean; daysSinceLastImport: number | null } | null;
  decision: { kind: 'budget_over' | 'goal_behind' | 'savings' | 'upload' | 'none'; text: string };
  provenance: { as_of: string; budgets: number; goals: number; opportunities: number; recurring_series: number; highlights: number };
}

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Monday of the ISO week containing `day`. */
export function weekStartOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Money for sentences: ₹1,25,000 (Indian grouping) for INR, "USD 1,250" otherwise; paise only when non-zero. */
export function formatAmount(value: string, currency: string): string {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^[-+]/, '').split('.');
  let grouped = whole!;
  if (currency === 'INR' && whole!.length > 3) {
    const head = whole!.slice(0, -3);
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole!.slice(-3)}`;
  } else grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const paise = fraction.replace(/0+$/, '') ? `.${fraction.padEnd(2, '0').slice(0, 2)}` : '';
  const amount = `${grouped}${paise}`;
  return `${negative ? '−' : ''}${currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`}`;
}

export async function assembleBriefing(
  core: FinanceCore,
  userId: string,
  input: { currency: string; asOf: string; upload?: { overdue: boolean; daysSinceLastImport: number | null } | null },
): Promise<Briefing> {
  const { currency, asOf } = input;
  const [highlights, budgets, goals, savings, recurring] = await Promise.all([
    core.highlights.highlights(userId, { currency, asOf }),
    core.budgets.status(userId, { asOf }),
    core.goals.status(userId, { asOf }),
    core.savings.opportunities(userId, { currency, asOf }),
    core.insights.recurring(userId, { currency, asOf }),
  ]);

  const toneRank = { negative: 0, warning: 1, positive: 2, neutral: 3 } as const;
  const topHighlights = [...highlights.highlights].sort((a, b) => toneRank[a.tone] - toneRank[b.tone]).slice(0, TOP_HIGHLIGHTS);
  const total = budgets.totals.find((t) => t.currency === currency) ?? null;
  const rank: Record<BudgetStatus, number> = { over: 0, at_risk: 1, on_track: 2 };
  const attention = budgets.budgets
    .filter((b) => b.status !== 'on_track')
    .sort((a, b) => rank[a.status] - rank[b.status] || Number(b.projectedOverspend) - Number(a.projectedOverspend))
    .map((b) => ({
      budgetId: b.id,
      categoryId: b.categoryId,
      categoryName: b.categoryName,
      limit: b.limit,
      spent: b.spent,
      projected: b.projected,
      projectedOverspend: b.projectedOverspend,
      percentUsed: b.percentUsed,
      status: b.status,
    }));
  const goalRows = goals.goals.map((g) => ({
    goalId: g.id,
    name: g.name,
    status: g.status,
    percent: g.percent,
    current: g.current,
    targetAmount: g.targetAmount,
    remaining: g.remaining,
    requiredMonthly: g.requiredMonthly,
    targetDate: g.targetDate,
  }));
  const top = savings.opportunities
    .filter((o) => !o.informational)
    .slice(0, TOP_SAVINGS)
    .map((o) => ({ id: o.id, kind: o.kind, title: o.title, monthlySaving: o.monthlySaving, confidence: o.confidence, basis: o.rationale.basis }));
  const horizon = addDays(asOf, UPCOMING_DAYS);
  const upcoming = recurring.series
    .filter((s) => s.status === 'ACTIVE' && !s.isDismissed && s.nextExpected >= asOf && s.nextExpected <= horizon)
    .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected))
    .map((s) => ({ label: s.label, amount: s.expectedAmount, date: s.nextExpected, frequency: s.frequency }));

  const weekStart = weekStartOf(asOf);
  const briefing: Omit<Briefing, 'decision'> = {
    version: 1,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    asOf,
    currency,
    highlights: topHighlights,
    budgets: {
      month: budgets.month,
      percentOfMonthElapsed: budgets.percentOfMonthElapsed,
      total: total && { limit: total.limit, spent: total.spent, projected: total.projected, percentUsed: total.percentUsed },
      count: budgets.budgets.length,
      attention,
    },
    goals: goalRows,
    savings: { month: savings.month, totalMonthly: savings.totalMonthly, top },
    upcoming,
    upload: input.upload ?? null,
    provenance: {
      as_of: asOf,
      budgets: budgets.budgets.length,
      goals: goals.goals.length,
      opportunities: savings.opportunities.length,
      recurring_series: recurring.series.length,
      highlights: highlights.highlights.length,
    },
  };
  return { ...briefing, decision: pickDecision(briefing) };
}

/** The one decision to make this week, in priority order. */
export function pickDecision(b: Omit<Briefing, 'decision'>): Briefing['decision'] {
  const money = (v: string) => formatAmount(v, b.currency);
  const over = b.budgets.attention[0];
  if (over && Number(over.projectedOverspend) > 0) {
    return {
      kind: 'budget_over',
      text: `${over.categoryName} is pacing ${money(over.projectedOverspend)} over its ${money(over.limit)} budget. Cut back for the rest of the month or raise the limit.`,
    };
  }
  const behind = b.goals.find((g) => g.status === 'behind');
  if (behind) {
    return { kind: 'goal_behind', text: `${behind.name} is behind. It needs ${money(behind.requiredMonthly)} a month to reach ${money(behind.targetAmount)} by ${behind.targetDate}.` };
  }
  const saving = b.savings.top[0];
  if (saving && Number(saving.monthlySaving) > 0) {
    return { kind: 'savings', text: `${saving.title}: about ${money(saving.monthlySaving)} a month to save (${saving.basis}). Decide whether to act on it.` };
  }
  if (b.upload?.overdue) {
    return {
      kind: 'upload',
      text: b.upload.daysSinceLastImport === null ? 'Import your first statement so the briefing has data to work with.' : `Upload statements: the last import was ${b.upload.daysSinceLastImport} days ago.`,
    };
  }
  return { kind: 'none', text: 'Nothing needs a decision this week.' };
}

/** Optional AI narrative for a briefing. Returns null when the model produces nothing. */
export async function briefingNarrative(provider: AIProvider, briefing: Briefing, signal?: AbortSignal): Promise<string | null> {
  let text = '';
  for await (const event of provider.chat({
    system: briefingNarrativePrompt(),
    messages: [{ role: 'user', content: JSON.stringify(briefing) }],
    maxTokens: 400,
    signal,
  })) {
    if (event.type === 'text') text += event.delta;
  }
  return text.trim() || null;
}
