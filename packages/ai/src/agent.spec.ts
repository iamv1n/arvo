import { FINANCE_TOOLS, findTool } from '@arvo/finance-tools';
import { runAgent, MAX_TOOL_RESULT_CHARS, type AgentEvent } from './agent';
import { advisorSystemPrompt } from './prompt';
import { FakeProvider } from './providers/fake';
import { AIProviderError, mapProviderError, type AIProvider } from './types';
import { fixture, USER_B } from './__tests__/fixture';

const system = advisorSystemPrompt({ today: '2026-08-20', currency: 'INR', adviceLevel: 2 });

describe('runAgent', () => {
  it('routes tool calls to the real finance tools and returns results to the model', async () => {
    const { ctx, food } = await fixture();
    await ctx().core.budgets.create(ctx().userId, { categoryId: food.id, amount: '5000', currency: 'INR' });
    const provider = new FakeProvider('fake-1', [
      { text: 'Checking. ', toolCalls: [{ name: 'finance_get_budget_status' }, { name: 'finance_get_goals' }] },
      { text: 'Food is at risk.' },
    ]);
    const events: AgentEvent[] = [];
    const result = await runAgent({ provider, system, messages: [{ role: 'user', content: 'Budgets?' }], tools: FINANCE_TOOLS, context: ctx(), onEvent: (e) => void events.push(e) });

    expect(result).toMatchObject({ content: 'Checking. \n\nFood is at risk.', rounds: 1, stopReason: 'complete' });
    expect(result.toolCalls.map((c) => [c.name, c.ok])).toEqual([
      ['finance_get_budget_status', true],
      ['finance_get_goals', true],
    ]);
    expect(result.toolCalls[0]!.dataUsed).toMatchObject({ as_of: '2026-08-20', month: '2026-08', budgets: 1 });
    expect(result.toolCalls[0]!.summary).toContain('1 budgets');
    expect(events.map((e) => e.type)).toEqual(['delta', 'tool_call', 'tool_result', 'tool_call', 'tool_result', 'delta', 'delta', 'delta', 'delta', 'delta']);

    // The second request carries the assistant tool calls and the real tool output.
    const second = provider.requests[1]!;
    expect(second.tools?.map((t) => t.name)).toContain('finance_get_savings_opportunities');
    const toolMessage = second.messages.find((m) => m.role === 'tool' && m.name === 'finance_get_budget_status');
    expect(JSON.parse((toolMessage as { content: string }).content).budgets[0]).toMatchObject({ categoryName: 'Food', spent: '4500.00' });
  });

  it('scopes tools to the context user', async () => {
    const { ctx } = await fixture();
    const provider = new FakeProvider('fake-1', [{ toolCalls: [{ name: 'finance_get_accounts' }] }, { text: 'none' }]);
    const result = await runAgent({ provider, system, messages: [{ role: 'user', content: 'x' }], tools: FINANCE_TOOLS, context: ctx(USER_B) });
    expect(result.toolCalls[0]!.dataUsed).toMatchObject({ account_count: 0 });
  });

  it('stops after the maximum tool rounds and forces a final answer', async () => {
    const { ctx } = await fixture();
    const provider = new FakeProvider('fake-1', (request) => ({ toolCalls: [{ name: 'finance_get_goals' }], text: request.system.includes('Do not call tools') ? undefined : undefined }));
    const result = await runAgent({ provider, system, messages: [{ role: 'user', content: 'loop' }], tools: [findTool('finance_get_goals')!], context: ctx(), maxToolRounds: 3 });
    expect(result.stopReason).toBe('max_rounds');
    expect(result.rounds).toBe(3);
    expect(result.toolCalls).toHaveLength(3);
    expect(provider.requests).toHaveLength(4);
    expect(provider.requests[3]!.system).toContain('Do not call tools');
    expect(result.content).toMatch(/tool limit/);
  });

  it('maps invalid input, unknown tools and domain errors to tool errors the model can see', async () => {
    const { ctx } = await fixture();
    const provider = new FakeProvider('fake-1', [
      {
        toolCalls: [
          { name: 'finance_check_affordability', input: { amount: 'lots' } },
          { name: 'finance_delete_everything' },
          { name: 'finance_get_account_balance', input: { account_id: '00000000-0000-4000-8000-000000000999' } },
        ],
      },
      { text: 'Sorry.' },
    ]);
    const result = await runAgent({ provider, system, messages: [{ role: 'user', content: 'x' }], tools: FINANCE_TOOLS, context: ctx() });
    expect(result.toolCalls.map((c) => c.error?.code)).toEqual(['INVALID_TOOL_INPUT', 'UNKNOWN_TOOL', 'ACCOUNT_NOT_FOUND']);
    const toolMessages = provider.requests[1]!.messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(3);
    expect(toolMessages[1]).toMatchObject({ content: expect.stringContaining('UNKNOWN_TOOL') });
  });

  it('propagates provider failures as AIProviderError', async () => {
    const { ctx } = await fixture();
    const failing: AIProvider = {
      name: 'fake',
      model: 'x',
      cloud: false,
      // eslint-disable-next-line require-yield
      async *chat() {
        throw mapProviderError('Anthropic', { status: 401 });
      },
    };
    await expect(runAgent({ provider: failing, system, messages: [{ role: 'user', content: 'x' }], tools: [], context: ctx() })).rejects.toMatchObject({ code: 'AI_AUTH' });
    expect(mapProviderError('OpenAI', { status: 429 })).toBeInstanceOf(AIProviderError);
    expect(mapProviderError('OpenAI', { status: 429 }).code).toBe('AI_RATE_LIMITED');
    expect(mapProviderError('OpenAI', new Error('socket')).code).toBe('AI_UNAVAILABLE');
    expect(MAX_TOOL_RESULT_CHARS).toBeGreaterThan(1000);
  });

  it('keeps the guardrails in the system prompt', () => {
    expect(system).toMatch(/must come from a tool result/);
    expect(system).toMatch(/Never recommend buying, selling or holding a specific security/);
    expect(system).toMatch(/Advice level: 2 of 4/);
    expect(advisorSystemPrompt({ today: 'x', currency: 'INR', adviceLevel: 4 })).toMatch(/Advice level: 3 of 4/);
  });
});
