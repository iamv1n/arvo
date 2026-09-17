import { runTool, type ToolContext } from '@arvo/finance-tools';
import { TransactionType } from '@arvo/types';
import { applySuggestion, createDraftTools, type SuggestionKind } from './drafts';
import { fixture, USER_A } from './__tests__/fixture';

function sinkStore() {
  const items: { id: string; kind: SuggestionKind; payload: Record<string, unknown>; rationale: string }[] = [];
  return { items, sink: { create: async (s: Omit<(typeof items)[number], 'id'>) => (items.push({ ...s, id: `s${items.length + 1}` }), { id: `s${items.length}` }) } };
}

async function draft(ctx: ToolContext, sink: ReturnType<typeof sinkStore>['sink'], name: string, input: unknown) {
  return runTool(createDraftTools(sink).find((t) => t.name === name)!, ctx, input);
}

describe('draft tools and approval', () => {
  it('drafts never persist; approval applies through Finance Core', async () => {
    const { core, ctx, food, bank } = await fixture();
    const { items, sink } = sinkStore();

    expect(await draft(ctx(), sink, 'draft_budget', { category_id: food.id, amount: '4000', rationale: 'Food ran 6,000 in July' })).toMatchObject({ ok: true, data: { suggestion_id: 's1', status: 'pending' } });
    expect(await draft(ctx(), sink, 'draft_goal', { name: 'Phone', target_amount: '70000', target_date: '2026-12-01', account_id: bank.id, rationale: 'Planned purchase' })).toMatchObject({ ok: true });
    expect(await draft(ctx(), sink, 'draft_categorization_rule', { name: 'Swiggy', conditions: [{ field: 'merchant', operator: 'contains', value: 'swiggy' }], category_id: food.id, rationale: 'Uncategorized' })).toMatchObject({ ok: true });
    expect(await draft(ctx(), sink, 'draft_scenario', { name: 'Halve delivery', adjustments: [{ type: 'category', category_id: food.id, mode: 'percent', value: '-50' }], rationale: 'Try it' })).toMatchObject({ ok: true });
    expect(items.map((i) => i.kind)).toEqual(['budget', 'goal', 'rule', 'scenario']);

    // Nothing was written.
    expect((await core.budgets.status(USER_A, { asOf: '2026-08-20' })).budgets).toHaveLength(0);
    expect((await core.goals.status(USER_A, { asOf: '2026-08-20' })).goals).toHaveLength(0);
    expect(await core.rules.list(USER_A)).toHaveLength(0);
    expect(await core.scenarios.list(USER_A)).toHaveLength(0);

    const context = { currency: 'INR', asOf: '2026-08-20' };
    const budget = await applySuggestion(core, USER_A, 'budget', { ...items[0]!.payload, amount: '4500' }, context);
    expect((await core.budgets.status(USER_A, { asOf: '2026-08-20' })).budgets[0]).toMatchObject({ id: budget.entityId, amount: '4500.00' });
    await applySuggestion(core, USER_A, 'goal', items[1]!.payload, context);
    await applySuggestion(core, USER_A, 'rule', items[2]!.payload, context);
    await applySuggestion(core, USER_A, 'scenario', items[3]!.payload, context);
    expect((await core.goals.status(USER_A, { asOf: '2026-08-20' })).goals[0]).toMatchObject({ name: 'Phone', accountId: bank.id });
    expect((await core.rules.list(USER_A))[0]).toMatchObject({ name: 'Swiggy', actions: { categoryId: food.id } });
    expect((await core.scenarios.list(USER_A))[0]).toMatchObject({ name: 'Halve delivery' });
  });

  it('rejects invalid drafts and invalid edited payloads', async () => {
    const { core, ctx, food } = await fixture();
    const { items, sink } = sinkStore();
    const missing = '00000000-0000-4000-8000-000000000999';
    expect(await draft(ctx(), sink, 'draft_budget', { category_id: missing, amount: '10', rationale: 'x' })).toMatchObject({ ok: false, error: { code: 'CATEGORY_NOT_FOUND' } });
    expect(await draft(ctx(), sink, 'draft_goal', { name: 'Past', target_amount: '10', target_date: '2020-01-01', rationale: 'x' })).toMatchObject({ ok: false, error: { code: 'INVALID_TARGET_DATE' } });
    expect(await draft(ctx(), sink, 'draft_categorization_rule', { name: 'No action', conditions: [{ field: 'merchant', operator: 'contains', value: 'x' }], rationale: 'x' })).toMatchObject({ ok: false });
    expect(await draft(ctx(), sink, 'draft_scenario', { name: 'Bad', adjustments: [{ type: 'one_off', month: '2030-01', amount: '10' }], rationale: 'x' })).toMatchObject({ ok: false });
    expect(await draft(ctx(), sink, 'draft_categorization_rule', { name: 'Type', conditions: [{ field: 'direction', operator: 'equals', value: 'IN' }], type: TransactionType.INCOME, rationale: 'x' })).toMatchObject({ ok: true });
    expect(items).toHaveLength(1);

    const context = { currency: 'INR', asOf: '2026-08-20' };
    await expect(applySuggestion(core, USER_A, 'budget', { categoryId: food.id, amount: '-5' }, context)).rejects.toMatchObject({ code: 'INVALID_SUGGESTION_PAYLOAD' });
    await expect(applySuggestion(core, USER_A, 'budget', { categoryId: missing, amount: '5' }, context)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    expect((await core.budgets.status(USER_A, { asOf: '2026-08-20' })).budgets).toHaveLength(0);
  });
});
