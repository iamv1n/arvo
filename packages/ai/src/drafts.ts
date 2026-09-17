import { DomainError, normalizeAdjustments, type FinanceCore } from '@arvo/finance-core';
import type { FinanceTool, ToolContext } from '@arvo/finance-tools';
import { TransactionType } from '@arvo/types';
import { z } from 'zod';

/*
 * Advisor-only draft tools. They never write budgets, goals, rules or scenarios: they validate a
 * proposal and hand it to a SuggestionSink, which stores it as a pending suggestion. Only an
 * explicit approval (applySuggestion) persists anything. Not exposed over MCP.
 */

export type SuggestionKind = 'budget' | 'goal' | 'rule' | 'scenario';
export const SUGGESTION_KINDS: SuggestionKind[] = ['budget', 'goal', 'rule', 'scenario'];

export interface SuggestionSink {
  create(input: { kind: SuggestionKind; payload: Record<string, unknown>; rationale: string }): Promise<{ id: string }>;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/, 'Use a positive decimal like 1500 or 649.50');
const uuid = z.uuid();
const rationale = z.string().min(1).max(600).describe('Why this helps, citing the tool results it is based on');

// ---- approval payload schemas (camelCase, as the REST API accepts them) ----

export const budgetPayload = z.object({ categoryId: uuid, amount: money, rollover: z.boolean().optional() });
export const goalPayload = z.object({
  name: z.string().min(1).max(120),
  targetAmount: money,
  targetDate: date,
  accountId: uuid.nullable().optional(),
  savedAmount: money.optional(),
});
const condition = z.object({
  field: z.enum(['description', 'merchant', 'amount', 'direction']),
  operator: z.enum(['contains', 'equals', 'starts_with', 'gte', 'lte']),
  value: z.string().min(1).max(200),
});
export const rulePayload = z.object({
  name: z.string().min(1).max(120),
  conditions: z.array(condition).min(1).max(10),
  actions: z
    .object({ categoryId: uuid.optional(), merchantName: z.string().min(1).max(120).optional(), type: z.enum(TransactionType).optional() })
    .refine((a) => a.categoryId || a.merchantName || a.type, 'A rule needs at least one action'),
});
export const scenarioPayload = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  adjustments: z.array(z.record(z.string(), z.unknown())).max(20),
});

export const SUGGESTION_PAYLOADS = { budget: budgetPayload, goal: goalPayload, rule: rulePayload, scenario: scenarioPayload } as const;

async function requireCategory(ctx: ToolContext, id: string) {
  const categories = await ctx.core.categories.list(ctx.userId);
  if (!categories.some((c) => c.id === id)) throw new DomainError('NOT_FOUND', 'CATEGORY_NOT_FOUND', 'Category not found');
}

function defineDraft<S extends z.ZodObject>(tool: FinanceTool<S>): FinanceTool {
  return tool as unknown as FinanceTool;
}

const pending = (id: string) => ({
  suggestion_id: id,
  status: 'pending',
  note: 'Saved as a pending suggestion. Nothing changes until the user approves it in the Suggestions inbox.',
});

export function createDraftTools(sink: SuggestionSink): FinanceTool[] {
  return [
    defineDraft({
      name: 'draft_budget',
      title: 'Draft a budget',
      description:
        'Propose a monthly category budget as a pending suggestion for the user to approve. Use a limit grounded in finance_get_budget_status or finance_get_spending_summary results. Category ids come from those tools. Does not create anything.',
      inputSchema: z.object({ category_id: uuid, amount: money.describe('Monthly limit'), rollover: z.boolean().optional(), rationale }),
      async run(ctx, input) {
        await requireCategory(ctx, input.category_id);
        const payload = budgetPayload.parse({ categoryId: input.category_id, amount: input.amount, rollover: input.rollover });
        return pending((await sink.create({ kind: 'budget', payload, rationale: input.rationale })).id);
      },
    }),
    defineDraft({
      name: 'draft_goal',
      title: 'Draft a savings goal',
      description: 'Propose a savings goal (target amount and date, optional linked account from finance_get_accounts) as a pending suggestion. Does not create anything.',
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        target_amount: money,
        target_date: date,
        account_id: uuid.optional(),
        saved_amount: money.optional(),
        rationale,
      }),
      async run(ctx, input) {
        if (input.target_date <= ctx.today) throw new DomainError('VALIDATION', 'INVALID_TARGET_DATE', 'The target date must be in the future');
        if (input.account_id) await ctx.core.accounts.get(ctx.userId, input.account_id);
        const payload = goalPayload.parse({ name: input.name, targetAmount: input.target_amount, targetDate: input.target_date, accountId: input.account_id, savedAmount: input.saved_amount });
        return pending((await sink.create({ kind: 'goal', payload, rationale: input.rationale })).id);
      },
    }),
    defineDraft({
      name: 'draft_categorization_rule',
      title: 'Draft a categorization rule',
      description:
        'Propose a rule that categorizes future and matching transactions: conditions on description, merchant, amount (absolute) or direction (IN/OUT), and actions setting category_id, merchant_name or type. Pending until approved. Does not change any transaction.',
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        conditions: z.array(condition).min(1).max(10),
        category_id: uuid.optional(),
        merchant_name: z.string().min(1).max(120).optional(),
        type: z.enum(TransactionType).optional(),
        rationale,
      }),
      async run(ctx, input) {
        if (input.category_id) await requireCategory(ctx, input.category_id);
        const parsed = rulePayload.safeParse({ name: input.name, conditions: input.conditions, actions: { categoryId: input.category_id, merchantName: input.merchant_name, type: input.type } });
        if (!parsed.success) throw new DomainError('VALIDATION', 'INVALID_RULE', parsed.error.issues[0]?.message ?? 'Invalid rule');
        return pending((await sink.create({ kind: 'rule', payload: parsed.data, rationale: input.rationale })).id);
      },
    }),
    defineDraft({
      name: 'draft_scenario',
      title: 'Draft a saved scenario',
      description:
        'Propose saving a what-if scenario (same adjustments as finance_run_what_if, with snake_case keys) so the user can revisit it in the planner. Pending until approved.',
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        adjustments: z
          .array(
            z.discriminatedUnion('type', [
              z.object({ type: z.literal('category'), category_id: uuid, mode: z.enum(['amount', 'percent']), value: z.string(), from_month: z.string().optional() }),
              z.object({ type: z.literal('income'), mode: z.enum(['amount', 'percent']), value: z.string(), from_month: z.string().optional() }),
              z.object({ type: z.literal('one_off'), month: z.string(), amount: money, label: z.string().max(80).optional() }),
            ]),
          )
          .min(1)
          .max(20),
        rationale,
      }),
      async run(ctx, input) {
        const adjustments = input.adjustments.map((a) =>
          a.type === 'category'
            ? { type: a.type, categoryId: a.category_id, mode: a.mode, value: a.value, ...(a.from_month ? { fromMonth: a.from_month } : {}) }
            : a.type === 'income'
              ? { type: a.type, mode: a.mode, value: a.value, ...(a.from_month ? { fromMonth: a.from_month } : {}) }
              : a,
        );
        normalizeAdjustments(ctx.today, adjustments); // throws a DomainError when invalid
        const payload = scenarioPayload.parse({ name: input.name, description: input.description ?? null, adjustments });
        return pending((await sink.create({ kind: 'scenario', payload, rationale: input.rationale })).id);
      },
    }),
  ];
}

export const DRAFT_TOOL_NAMES = ['draft_budget', 'draft_goal', 'draft_categorization_rule', 'draft_scenario'];

/**
 * Applies an approved suggestion through Finance Core. The payload (possibly edited by the user)
 * is validated again; failures surface as DomainErrors and nothing is saved.
 */
export async function applySuggestion(
  core: FinanceCore,
  userId: string,
  kind: SuggestionKind,
  rawPayload: unknown,
  context: { currency: string; asOf: string },
): Promise<{ entityId: string; payload: Record<string, unknown> }> {
  const parsed = SUGGESTION_PAYLOADS[kind].safeParse(rawPayload);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION',
      'INVALID_SUGGESTION_PAYLOAD',
      'The suggestion is invalid',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  const payload = parsed.data as Record<string, unknown>;
  switch (kind) {
    case 'budget': {
      const p = parsed.data as z.infer<typeof budgetPayload>;
      return { entityId: (await core.budgets.create(userId, { ...p, currency: context.currency })).id, payload };
    }
    case 'goal': {
      const p = parsed.data as z.infer<typeof goalPayload>;
      return { entityId: (await core.goals.create(userId, { ...p, currency: context.currency })).id, payload };
    }
    case 'rule': {
      const p = parsed.data as z.infer<typeof rulePayload>;
      return { entityId: (await core.rules.create(userId, p)).id, payload };
    }
    case 'scenario': {
      const p = parsed.data as z.infer<typeof scenarioPayload>;
      return { entityId: (await core.scenarios.create(userId, { ...p, asOf: context.asOf })).id, payload };
    }
  }
}
