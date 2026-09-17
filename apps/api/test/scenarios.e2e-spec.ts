import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser } from './app';

const today = new Date().toISOString().slice(0, 10);
const shift = (months: number) => {
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + months, 1));
  return d.toISOString().slice(0, 7);
};

describe('Planning: savings, affordability and scenarios (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('requires authentication', async () => {
    const server = app.getHttpServer();
    await request(server).get('/planning/savings-opportunities').expect(401);
    await request(server).post('/planning/affordability').send({ amount: '1' }).expect(401);
    await request(server).post('/planning/what-if').send({ adjustments: [] }).expect(401);
    await request(server).get('/scenarios').expect(401);
  });

  it('computes savings opportunities, affordability and what-if from the ledger', async () => {
    const user = await registerUser(app);
    const bank = (await user.post('/accounts', { name: 'HDFC', type: 'BANK', openingBalance: '100000' }).expect(201)).body;
    const categories = (await user.get('/categories').expect(200)).body.items as { id: string; name: string }[];
    const delivery = categories.find((c) => c.name === 'Delivery')!;
    for (const [months, amount] of [[-4, '-2000'], [-3, '-2000'], [-2, '-2000'], [-1, '-5000']] as const) {
      await user
        .post('/transactions', { accountId: bank.id, date: `${shift(months)}-10`, description: `SWIGGY ${months}`, amount, type: 'EXPENSE', categoryId: delivery.id })
        .expect(201);
      await user.post('/transactions', { accountId: bank.id, date: `${shift(months)}-01`, description: 'SALARY', amount: '50000', type: 'INCOME' }).expect(201);
    }

    const savings = (await user.get('/planning/savings-opportunities').expect(200)).body;
    expect(savings).toMatchObject({ asOf: today, month: shift(-1), currency: 'INR' });
    const creep = savings.opportunities.find((o: { kind: string }) => o.kind === 'category_creep');
    expect(creep).toMatchObject({ monthlySaving: '3000.00', rationale: { current: '5000.00', baseline: '2000.00' } });
    expect(creep.evidence.query).toMatchObject({ type: 'EXPENSE,FEE' });
    expect(parseFloat(savings.totalMonthly)).toBeGreaterThanOrEqual(3000);

    // Liquid: 100,000 + 4 × 50,000 − 11,000 = 289,000. Expenses (last 3 months) average 3,000.
    const afford = (await user.post('/planning/affordability', { amount: '70000' }).expect(200)).body;
    expect(afford).toMatchObject({ status: 'affordable', cashBefore: '289000.00', cashAfter: '219000.00', bufferTarget: '9000.00', bufferMonths: 3 });
    expect(afford.series).toHaveLength(13);
    expect((await user.post('/planning/affordability', { amount: '288000', bufferMonths: 6 }).expect(200)).body.status).toBe('tight');
    await user.post('/planning/affordability', { amount: 'lots' }).expect(400);
    await user.post('/planning/affordability', { amount: '10', bufferMonths: 99 }).expect(400);
    expect((await user.post('/planning/affordability', { amount: '10', date: '2000-01-01' }).expect(422)).body.error.code).toBe('INVALID_DATE');

    const whatIf = (
      await user.post('/planning/what-if', { adjustments: [{ type: 'category', categoryId: delivery.id, mode: 'percent', value: '-50' }] }).expect(200)
    ).body;
    expect(whatIf).toMatchObject({ monthlyChange: '1500.00', yearlyImpact: '18000.00' });
    const bad = await user.post('/planning/what-if', { adjustments: [{ type: 'one_off', month: '1999-01', amount: '1' }] }).expect(422);
    expect(bad.body.error.code).toBe('INVALID_ADJUSTMENT');
    await user.post('/planning/what-if', { adjustments: 'x' }).expect(400);
  });

  it('manages saved scenarios, runs and compares them, per user', async () => {
    const user = await registerUser(app);
    const other = await registerUser(app);
    const categories = (await user.get('/categories').expect(200)).body.items as { id: string; name: string }[];
    const rent = categories.find((c) => c.name === 'Rent') ?? categories[0];

    const hike = await user
      .post('/scenarios', { name: 'Rent hike', adjustments: [{ type: 'category', categoryId: rent.id, mode: 'amount', value: '10000' }] })
      .expect(201);
    expect(hike.body).toMatchObject({ name: 'Rent hike', description: null, adjustments: [{ type: 'category', value: '10000.00' }] });
    expect(hike.body.userId).toBeUndefined();
    const trip = await user.post('/scenarios', { name: 'Trip', description: 'Goa', adjustments: [{ type: 'one_off', month: shift(2), amount: '40000' }] }).expect(201);
    await user.post('/scenarios', { name: '', adjustments: [] }).expect(400);

    expect((await user.get('/scenarios').expect(200)).body.items.map((s: { name: string }) => s.name)).toEqual(['Rent hike', 'Trip']);
    expect((await user.get(`/scenarios/${hike.body.id}/run`).expect(200)).body).toMatchObject({ yearlyImpact: '-120000.00', scenario: { name: 'Rent hike' } });

    const compare = (await user.get(`/scenarios/compare?ids=${hike.body.id},${trip.body.id}`).expect(200)).body;
    expect(compare.months).toHaveLength(13);
    expect(compare.scenarios.map((s: { name: string; yearlyImpact: string }) => [s.name, s.yearlyImpact])).toEqual([
      ['Rent hike', '-120000.00'],
      ['Trip', '-40000.00'],
    ]);
    await user.get('/scenarios/compare?ids=nope').expect(400);

    const patched = await user.patch(`/scenarios/${trip.body.id}`, { name: 'Goa trip', description: null }).expect(200);
    expect(patched.body).toMatchObject({ name: 'Goa trip', description: null });

    // Isolation.
    expect((await other.get('/scenarios').expect(200)).body.items).toEqual([]);
    expect((await other.get(`/scenarios/${hike.body.id}/run`).expect(404)).body.error.code).toBe('SCENARIO_NOT_FOUND');
    await other.get(`/scenarios/compare?ids=${hike.body.id}`).expect(404);
    await other.patch(`/scenarios/${hike.body.id}`, { name: 'Mine' }).expect(404);
    await other.delete(`/scenarios/${hike.body.id}`).expect(404);

    await user.delete(`/scenarios/${hike.body.id}`).expect(204);
    await user.get(`/scenarios/${hike.body.id}`).expect(404);
  });
});
