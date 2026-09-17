import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser } from './app';

const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

describe('Budgets and goals (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/budgets').expect(401);
    await request(app.getHttpServer()).get('/goals').expect(401);
  });

  it('manages budgets with pacing and keeps them per user', async () => {
    const user = await registerUser(app);
    const other = await registerUser(app);
    const bank = (await user.post('/accounts', { name: 'HDFC', type: 'BANK', openingBalance: '50000' }).expect(201)).body;
    const categories = (await user.get('/categories').expect(200)).body.items as { id: string; name: string }[];
    const delivery = categories.find((c) => c.name === 'Delivery')!;

    await user
      .post('/transactions', { accountId: bank.id, date: `${month}-01`, description: 'SWIGGY', amount: '-1200', type: 'EXPENSE', categoryId: delivery.id })
      .expect(201);

    const created = await user.post('/budgets', { categoryId: delivery.id, amount: '4000' }).expect(201);
    expect(created.body).toMatchObject({ categoryId: delivery.id, amount: '4000.00', currency: 'INR', rollover: false });
    expect(created.body.userId).toBeUndefined();

    const dup = await user.post('/budgets', { categoryId: delivery.id, amount: '10' }).expect(409);
    expect(dup.body.error.code).toBe('BUDGET_EXISTS');
    const zero = await user.post('/budgets', { categoryId: delivery.id, amount: '0' }).expect(422);
    expect(zero.body.error.code).toBe('INVALID_AMOUNT');
    await user.post('/budgets', { categoryId: 'nope', amount: '10' }).expect(400);

    const status = await user.get('/budgets').expect(200);
    expect(status.body).toMatchObject({ month, asOf: today });
    expect(status.body.budgets).toHaveLength(1);
    expect(status.body.budgets[0]).toMatchObject({ categoryName: 'Delivery', limit: '4000.00', spent: '1200.00', remaining: '2800.00', percentUsed: 30 });
    expect(['on_track', 'at_risk', 'over']).toContain(status.body.budgets[0].status);
    expect(status.body.totals).toEqual([expect.objectContaining({ currency: 'INR', spent: '1200.00' })]);

    const past = await user.get('/budgets?month=2000-01').expect(200);
    expect(past.body.budgets[0]).toMatchObject({ spent: '0.00', percentOfMonthElapsed: 100 });
    await user.get('/budgets?month=2026-13').expect(400);

    const updated = await user.patch(`/budgets/${created.body.id}`, { amount: '5000.5', rollover: true }).expect(200);
    expect(updated.body).toMatchObject({ amount: '5000.50', rollover: true });

    // Another user cannot see, change or delete it.
    expect((await other.get('/budgets').expect(200)).body.budgets).toEqual([]);
    expect((await other.patch(`/budgets/${created.body.id}`, { amount: '1' }).expect(404)).body.error.code).toBe('BUDGET_NOT_FOUND');
    await other.delete(`/budgets/${created.body.id}`).expect(404);

    await user.delete(`/budgets/${created.body.id}`).expect(204);
    expect((await user.get('/budgets').expect(200)).body.budgets).toEqual([]);
  });

  it('manages goals with progress and keeps them per user', async () => {
    const user = await registerUser(app);
    const other = await registerUser(app);
    const savings = (await user.post('/accounts', { name: 'Savings', type: 'BANK', openingBalance: '25000' }).expect(201)).body;
    const otherAccount = (await other.post('/accounts', { name: 'Theirs', type: 'BANK' }).expect(201)).body;

    const manual = await user.post('/goals', { name: 'Laptop', targetAmount: '60000', targetDate: '2099-12-31', savedAmount: '60000' }).expect(201);
    expect(manual.body).toMatchObject({ name: 'Laptop', targetAmount: '60000.00', savedAmount: '60000.00', currency: 'INR', accountId: null });
    const linked = await user.post('/goals', { name: 'Emergency fund', targetAmount: '100000', targetDate: '2099-12-31', accountId: savings.id }).expect(201);

    const invalidDate = await user.post('/goals', { name: 'X', targetAmount: '10', targetDate: '2027-02-30' }).expect(422);
    expect(invalidDate.body.error.code).toBe('INVALID_DATE');
    const foreign = await user.post('/goals', { name: 'X', targetAmount: '10', targetDate: '2099-01-01', accountId: otherAccount.id }).expect(404);
    expect(foreign.body.error.code).toBe('ACCOUNT_NOT_FOUND');

    const list = await user.get('/goals').expect(200);
    const byName = Object.fromEntries((list.body.goals as { name: string }[]).map((g) => [g.name, g]));
    expect(byName['Laptop']).toMatchObject({ status: 'achieved', percent: 100, remaining: '0.00', requiredMonthly: '0.00' });
    expect(byName['Emergency fund']).toMatchObject({ current: '25000.00', remaining: '75000.00', percent: 25, accountName: 'Savings', status: 'on_track' });

    const patched = await user.patch(`/goals/${linked.body.id}`, { accountId: null, savedAmount: '1000' }).expect(200);
    expect(patched.body).toMatchObject({ accountId: null, savedAmount: '1000.00' });

    expect((await other.get('/goals').expect(200)).body.goals).toEqual([]);
    expect((await other.patch(`/goals/${linked.body.id}`, { name: 'Mine' }).expect(404)).body.error.code).toBe('GOAL_NOT_FOUND');
    await other.delete(`/goals/${manual.body.id}`).expect(404);

    await user.delete(`/goals/${manual.body.id}`).expect(204);
    expect((await user.get('/goals').expect(200)).body.goals).toHaveLength(1);
  });
});
