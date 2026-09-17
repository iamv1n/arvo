import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BriefingsService } from '../src/advisor/briefings.service';
import { createTestApp, linkToken, mailbox, registerUser } from './app';

type User = Awaited<ReturnType<typeof registerUser>>;

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((block) => block.startsWith('event:'))
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n');
      return { event: eventLine!.slice(7), data: JSON.parse(dataLine!.slice(6)) as Record<string, unknown> };
    });
}

async function ask(user: User, conversationId: string, content: string) {
  const res = await user.post(`/advisor/conversations/${conversationId}/messages`, { content }).expect(200);
  expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  return parseSse(res.text);
}

async function expenseCategory(user: User): Promise<string> {
  const categories = (await user.get('/categories').expect(200)).body.items as { id: string; type: string }[];
  return categories.find((c) => c.type === 'EXPENSE')!.id;
}

describe('AI advisor (e2e, fake provider)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ AI_PROVIDER: 'fake', ADVICE_LEVEL: '2' });
  });
  afterAll(() => app.close());

  it('reports status and limits overrides to configured providers', async () => {
    const user = await registerUser(app);
    const status = (await user.get('/advisor/status').expect(200)).body;
    expect(status).toMatchObject({ enabled: true, provider: 'fake', model: 'fake-1', cloud: false, adviceLevel: 2, override: { provider: null, model: null } });
    expect(status.available.map((p: { provider: string }) => p.provider)).toContain('fake');
    await user.patch('/advisor/settings', { provider: 'openai' }).expect(422);
    await user.patch('/advisor/settings', { provider: 'skynet' }).expect(400);
    expect((await user.patch('/advisor/settings', { provider: 'fake', model: 'fake-2' }).expect(200)).body).toMatchObject({ model: 'fake-2', override: { provider: 'fake', model: 'fake-2' } });
    expect((await user.patch('/advisor/settings', { provider: null }).expect(200)).body).toMatchObject({ model: 'fake-1', override: { provider: null, model: null } });
  });

  it('streams an answer over SSE and persists the provenance', async () => {
    const user = await registerUser(app);
    const account = (await user.post('/accounts', { name: 'HDFC', type: 'BANK', openingBalance: '5000' }).expect(201)).body;
    await user.post('/transactions', { accountId: account.id, date: new Date().toISOString().slice(0, 10), amount: '-450', type: 'EXPENSE', description: 'SWIGGY' }).expect(201);

    const conversation = (await user.post('/advisor/conversations', {}).expect(201)).body;
    expect(conversation.title).toBe('New conversation');
    const events = await ask(user, conversation.id, 'How am I doing this month?');
    const types = events.map((e) => e.event);
    expect(types[0]).toBe('delta');
    expect(types).toEqual(expect.arrayContaining(['tool_call', 'tool_result', 'done']));
    expect(types.at(-1)).toBe('done');
    const result = events.find((e) => e.event === 'tool_result')!.data;
    expect(result).toMatchObject({ name: 'finance_get_highlights', ok: true, dataUsed: { as_of: expect.any(String) } });
    const done = events.at(-1)!.data as { message: { content: string; toolCalls: unknown[] }; adviceLevel: number };
    expect(done.adviceLevel).toBe(2);
    expect(done.message.content).toContain('finance_get_highlights');

    const stored = (await user.get(`/advisor/conversations/${conversation.id}`).expect(200)).body;
    expect(stored).toMatchObject({ title: 'How am I doing this month?', adviceLevel: 2 });
    expect(stored.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(stored.messages[1]).toMatchObject({ status: 'complete', provider: 'fake', model: 'fake-1' });
    expect(stored.messages[1].toolCalls[0]).toMatchObject({ name: 'finance_get_highlights', ok: true, summary: expect.any(String) });
    expect((await user.get('/advisor/conversations').expect(200)).body.items[0]).toMatchObject({ id: conversation.id });

    // Follow-up turns include history; invalid tool input is recorded, not fatal.
    const second = await ask(user, conversation.id, '[tool:finance_check_affordability {"amount":"lots"}]');
    expect(second.find((e) => e.event === 'tool_result')!.data).toMatchObject({ ok: false, error: { code: 'INVALID_TOOL_INPUT' } });
    expect((await user.get(`/advisor/conversations/${conversation.id}`)).body.messages).toHaveLength(4);

    await user.post(`/advisor/conversations/${conversation.id}/messages`, { content: '' }).expect(400);
    await user.delete(`/advisor/conversations/${conversation.id}`).expect(204);
    await user.get(`/advisor/conversations/${conversation.id}`).expect(404);
  });

  it('drafts suggestions that only persist on approval', async () => {
    const user = await registerUser(app);
    const categoryId = await expenseCategory(user);
    const conversation = (await user.post('/advisor/conversations', { title: 'Plan' }).expect(201)).body;
    const events = await ask(
      user,
      conversation.id,
      [
        '[tool:finance_get_budget_status {}]',
        `[tool:draft_budget {"category_id":"${categoryId}","amount":"4000","rationale":"Food ran high"}]`,
        '[tool:draft_goal {"name":"Phone","target_amount":"70000","target_date":"2099-12-01","rationale":"Planned purchase"}]',
      ].join('\n'),
    );
    const drafted = events.filter((e) => e.event === 'suggestion').map((e) => e.data);
    expect(drafted.map((s) => [s.kind, s.status])).toEqual([
      ['budget', 'pending'],
      ['goal', 'pending'],
    ]);
    expect((drafted[0]!.provenance as { name: string }[]).map((p) => p.name)).toEqual(['finance_get_budget_status']);

    const pending = (await user.get('/advisor/suggestions').expect(200)).body.items;
    expect(pending).toHaveLength(2);
    expect((await user.get('/budgets').expect(200)).body.budgets).toHaveLength(0);
    expect((await user.get('/goals').expect(200)).body.goals).toHaveLength(0);

    const budget = drafted[0]!;
    // Invalid edits are rejected and leave the suggestion pending.
    await user.post(`/advisor/suggestions/${budget.id}/approve`, { payload: { categoryId, amount: '-1' } }).expect(422);
    expect((await user.get('/advisor/suggestions?status=pending')).body.items).toHaveLength(2);

    const approved = (await user.post(`/advisor/suggestions/${budget.id}/approve`, { payload: { categoryId, amount: '4500' } }).expect(200)).body;
    expect(approved).toMatchObject({ status: 'approved', edited: true, approvedAt: expect.any(String), appliedEntityId: expect.any(String), payload: { amount: '4500' } });
    const budgets = (await user.get('/budgets').expect(200)).body.budgets;
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({ id: approved.appliedEntityId, amount: '4500.00' });
    await user.post(`/advisor/suggestions/${budget.id}/approve`, {}).expect(409);

    const dismissed = (await user.post(`/advisor/suggestions/${drafted[1]!.id}/dismiss`).expect(200)).body;
    expect(dismissed).toMatchObject({ status: 'dismissed', dismissedAt: expect.any(String), appliedEntityId: null });
    expect((await user.get('/goals').expect(200)).body.goals).toHaveLength(0);
    await user.post(`/advisor/suggestions/${drafted[1]!.id}/approve`, {}).expect(409);

    expect((await user.get('/advisor/suggestions').expect(200)).body.items).toHaveLength(0);
    expect((await user.get('/advisor/suggestions?status=all').expect(200)).body.items).toHaveLength(2);
    expect((await user.get(`/advisor/conversations/${conversation.id}`)).body.suggestions).toHaveLength(2);
  });

  it('isolates conversations and suggestions between users', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const categoryId = await expenseCategory(owner);
    const conversation = (await owner.post('/advisor/conversations', {}).expect(201)).body;
    const events = await ask(owner, conversation.id, `[tool:draft_budget {"category_id":"${categoryId}","amount":"100","rationale":"x"}]`);
    const suggestion = events.find((e) => e.event === 'suggestion')!.data;

    await other.get(`/advisor/conversations/${conversation.id}`).expect(404);
    await other.post(`/advisor/conversations/${conversation.id}/messages`, { content: 'hi' }).expect(404);
    await other.delete(`/advisor/conversations/${conversation.id}`).expect(404);
    await other.post(`/advisor/suggestions/${suggestion.id}/approve`, {}).expect(404);
    await other.post(`/advisor/suggestions/${suggestion.id}/dismiss`).expect(404);
    expect((await other.get('/advisor/conversations')).body.items).toEqual([]);
    expect((await other.get('/advisor/suggestions?status=all')).body.items).toEqual([]);
    expect((await owner.get('/advisor/suggestions')).body.items).toHaveLength(1);
  });

  it('builds weekly briefings and emails opted-in, verified users once per week', async () => {
    const briefings = app.get(BriefingsService);
    const user = await registerUser(app);
    const token = linkToken(mailbox(app).last(user.email, /Confirm your email/)!.text, '/verify-email');
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token }).expect(200);
    const unverified = await registerUser(app);

    expect((await user.get('/advisor/briefings/latest').expect(200)).body).toEqual({ briefing: null });
    const generated = (await user.post('/advisor/briefings/generate').expect(201)).body.briefing;
    expect(generated).toMatchObject({ narrative: expect.stringContaining('week in brief'), provider: 'fake', data: { version: 1, decision: { kind: expect.any(String) } } });
    expect((await user.get('/advisor/briefings/latest')).body.briefing.id).toBe(generated.id);

    expect((await user.patch('/me/reminders', { weeklyBriefing: true }).expect(200)).body.weeklyBriefing).toBe(true);
    await unverified.patch('/me/reminders', { weeklyBriefing: true }).expect(200);

    // Next Monday: 07:59 IST is too early, 08:30 IST sends, re-runs don't resend.
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7));
    const at = (hh: number, mm: number) => new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), hh, mm));
    const BRIEFING = /weekly money briefing/;
    await briefings.runDueBriefings(at(2, 29));
    expect(mailbox(app).count(user.email, BRIEFING)).toBe(0);
    await briefings.runDueBriefings(at(3, 0));
    await briefings.runDueBriefings(at(4, 0));
    expect(mailbox(app).count(user.email, BRIEFING)).toBe(1);
    expect(mailbox(app).count(unverified.email, BRIEFING)).toBe(0);
    const mail = mailbox(app).last(user.email, BRIEFING)!;
    expect(mail.text).toContain('Decision for this week');
    expect(mail.headers?.['List-Unsubscribe']).toMatch(/\/advisor\/briefings\/unsubscribe\?token=/);
    expect((await user.get('/advisor/briefings/latest')).body.briefing).toMatchObject({ emailedAt: expect.any(String) });

    const unsubscribe = linkToken(mail.text, '/advisor/briefings/unsubscribe');
    await request(app.getHttpServer()).post('/advisor/briefings/unsubscribe').query({ token: 'bad' }).expect(400);
    await request(app.getHttpServer()).get('/advisor/briefings/unsubscribe').query({ token: unsubscribe }).expect(200);
    expect((await user.get('/me/reminders')).body.weeklyBriefing).toBe(false);
  });
});

describe('AI advisor disabled (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ AI_PROVIDER: 'none' });
  });
  afterAll(() => app.close());

  it('returns AI_DISABLED while deterministic features keep working', async () => {
    const user = await registerUser(app);
    expect((await user.get('/advisor/status').expect(200)).body).toMatchObject({ enabled: false, provider: null, cloud: false, adviceLevel: 2, available: [] });
    expect((await user.post('/advisor/conversations', {}).expect(503)).body.error.code).toBe('AI_DISABLED');
    const missing = '00000000-0000-4000-8000-000000000999';
    expect((await user.post(`/advisor/conversations/${missing}/messages`, { content: 'hi' }).expect(503)).body.error.code).toBe('AI_DISABLED');
    expect((await user.get('/advisor/conversations').expect(200)).body.items).toEqual([]);
    expect((await user.get('/advisor/suggestions').expect(200)).body.items).toEqual([]);

    const briefing = (await user.post('/advisor/briefings/generate').expect(201)).body.briefing;
    expect(briefing).toMatchObject({ narrative: null, provider: null, data: { decision: { kind: 'upload' } } });
    await user.get('/planning/savings-opportunities').expect(200);
    await user.get('/budgets').expect(200);
  });
});
