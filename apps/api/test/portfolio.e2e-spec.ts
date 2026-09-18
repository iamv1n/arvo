import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser } from './app';

const ASOF = '2026-09-19';

const ZERODHA_TRADEBOOK = `symbol,isin,trade_date,exchange,trade_type,quantity,price
INFY,INE009A01021,2024-09-19,NSE,buy,100,1000
INFY,INE009A01021,2026-06-20,NSE,sell,40,1600
`;

const NIFTY_CSV = `Index Name,Date,Close
NIFTY 50 TRI,2024-09-19,25000
NIFTY 50 TRI,2026-09-19,30000
`;

const AMFI_NAV = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
122639;INF879O01027;INF879O01035;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;100.0000;18-Sep-2026
`;

describe('Portfolio (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/holdings').expect(401);
    await request(app.getHttpServer()).get('/portfolio/summary').expect(401);
    await request(app.getHttpServer()).post('/portfolio/rebalance').send({ targets: [] }).expect(401);
  });

  it('manages holdings and their transactions', async () => {
    const user = await registerUser(app);
    const created = await user
      .post('/holdings', {
        name: 'Parag Parikh Flexi Cap Direct Growth',
        kind: 'MUTUAL_FUND',
        isin: 'INF879O01027',
        schemeCode: '122639',
        folio: '12345678 / 90',
        amc: 'PPFAS',
        marketCap: 'LARGE',
        plan: 'DIRECT',
        expenseRatio: '0.63',
      })
      .expect(201);
    expect(created.body).toMatchObject({ assetClass: 'EQUITY', currency: 'INR', isin: 'INF879O01027', isActive: true });
    expect(created.body.userId).toBeUndefined();
    const id = created.body.id as string;

    const badIsin = await user.post('/holdings', { name: 'Bad', kind: 'MUTUAL_FUND', isin: 'NOPE' }).expect(422);
    expect(badIsin.body.error.code).toBe('INVALID_ISIN');
    await user.post('/holdings', { name: 'Bad', kind: 'SOMETHING' }).expect(400);

    const sip = await user.post(`/holdings/${id}/transactions`, { date: '2024-09-19', type: 'SIP', units: '1000', price: '50' }).expect(201);
    expect(sip.body).toMatchObject({ amount: '50000.00', units: '1000.00000', price: '50.00', charges: '0.00' });
    await user.post(`/holdings/${id}/transactions`, { date: '2025-09-19', type: 'SIP', units: '500', price: '60' }).expect(201);
    // A mutual fund purchase needs units.
    const noUnits = await user.post(`/holdings/${id}/transactions`, { date: '2025-09-19', type: 'BUY', amount: '1000' }).expect(422);
    expect(noUnits.body.error.code).toBe('UNITS_REQUIRED');

    await user.post(`/holdings/${id}/price`, { price: '100', date: ASOF }).expect(200);

    const detail = await user.get(`/holdings/${id}?asOf=${ASOF}`).expect(200);
    expect(detail.body.position).toMatchObject({
      units: '1500.00000',
      invested: '80000.00',
      value: '150000.00',
      valueSource: 'PRICE',
      unrealisedGain: '70000.00',
    });
    expect(detail.body.position.lots).toHaveLength(2);
    expect(detail.body.transactions).toHaveLength(2);

    const updated = await user.patch(`/holdings/${id}`, { sector: 'Diversified', notes: 'Core holding' }).expect(200);
    expect(updated.body).toMatchObject({ sector: 'Diversified', notes: 'Core holding' });

    const tx = detail.body.transactions[0] as { id: string };
    await user.patch(`/holdings/${id}/transactions/${tx.id}`, { charges: '25' }).expect(200);
    await user.delete(`/holdings/${id}/transactions/${tx.id}`).expect(204);
    expect((await user.get(`/holdings/${id}/transactions`).expect(200)).body.items).toHaveLength(1);

    await user.delete(`/holdings/${id}`).expect(204);
    await user.get(`/holdings/${id}`).expect(404);
  });

  it('reports summary, allocation, returns, gains, rebalance and goal projection', async () => {
    const user = await registerUser(app);
    const equity = (await user.post('/holdings', { name: 'Flexi Cap Direct', kind: 'MUTUAL_FUND', amc: 'PPFAS', marketCap: 'LARGE', expenseRatio: '0.63' }).expect(201)).body;
    await user.post(`/holdings/${equity.id}/transactions`, { date: '2024-09-19', type: 'BUY', units: '1000', price: '50' }).expect(201);
    await user.post(`/holdings/${equity.id}/price`, { price: '100', date: ASOF }).expect(200);

    const debt = (await user.post('/holdings', { name: 'Liquid Fund Regular', kind: 'MUTUAL_FUND', assetClass: 'DEBT', amc: 'SBI', plan: 'REGULAR', expenseRatio: '1.2', directExpenseRatio: '0.35' }).expect(201)).body;
    await user.post(`/holdings/${debt.id}/transactions`, { date: '2024-09-19', type: 'BUY', units: '2500', price: '20' }).expect(201);
    await user.post(`/holdings/${debt.id}/price`, { price: '20', date: ASOF }).expect(200);

    const summary = await user.get(`/portfolio/summary?asOf=${ASOF}`).expect(200);
    expect(summary.body).toMatchObject({
      asOf: ASOF,
      currency: 'INR',
      totalInvested: '100000.00',
      currentValue: '150000.00',
      totalGain: '50000.00',
      holdingCount: 2,
    });
    expect(summary.body.disclaimer).toContain('not advice');
    expect(summary.body.topHoldings[0]).toMatchObject({ name: 'Flexi Cap Direct', percentOfPortfolio: 66.67 });

    const allocation = await user.get(`/portfolio/allocation?asOf=${ASOF}`).expect(200);
    expect(allocation.body.assetClass.map((s: { key: string }) => s.key)).toEqual(['EQUITY', 'DEBT']);
    expect(allocation.body.costDrag).toMatchObject({ annualCost: '1230.00', regularPlanExtraCost: '425.00' });
    expect(allocation.body.concentration.topHoldingPercent).toBe(66.67);

    const returns = await user.get(`/portfolio/returns?asOf=${ASOF}`).expect(200);
    expect(returns.body.xirrPercent).toBeGreaterThan(0);
    expect(returns.body.benchmark).toBeNull();
    expect(returns.body.byHolding).toHaveLength(2);

    const gains = await user.get(`/portfolio/capital-gains?asOf=${ASOF}`).expect(200);
    expect(gains.body).toMatchObject({ financialYear: '2026-27', harvestHeadroom: '125000.00' });
    expect(gains.body.unrealised.longTerm).toBe('50000.00');
    expect(gains.body.disclaimer).toContain('not advice');

    const rebalance = await user
      .post('/portfolio/rebalance', { asOf: ASOF, targets: [{ assetClass: 'EQUITY', percent: '50' }, { assetClass: 'DEBT', percent: '50' }] })
      .expect(200);
    expect(rebalance.body.trades).toHaveLength(2);
    expect(rebalance.body.trades[0]).toMatchObject({ action: 'SELL', amount: '25000.00' });
    expect(rebalance.body.disclaimer).toContain('not a recommendation');
    const badTargets = await user.post('/portfolio/rebalance', { asOf: ASOF, targets: [{ assetClass: 'EQUITY', percent: '70' }] }).expect(422);
    expect(badTargets.body.error.code).toBe('TARGETS_MUST_SUM_TO_100');
    await user.post('/portfolio/rebalance', { targets: [] }).expect(400);

    const goal = (await user.post('/goals', { name: 'House', targetAmount: '2000000', targetDate: '2031-09-19' }).expect(201)).body;
    await user.patch(`/holdings/${equity.id}`, { goalId: goal.id }).expect(200);
    const projection = await user.post('/portfolio/goal-projection', { asOf: ASOF, monthlyContributions: { [goal.id]: '10000' } }).expect(200);
    expect(projection.body.goals[0]).toMatchObject({ goalName: 'House', monthsLeft: 60, currentValue: '100000.00' });
    expect(projection.body.goals[0].probability).toBeGreaterThanOrEqual(0);
    // Same seed, same answer.
    const again = await user.post('/portfolio/goal-projection', { asOf: ASOF, monthlyContributions: { [goal.id]: '10000' } }).expect(200);
    expect(again.body.goals[0]).toEqual(projection.body.goals[0]);

    const overlap = await user.get(`/portfolio/overlap?asOf=${ASOF}`).expect(200);
    expect(overlap.body.pairs).toEqual([]);
    expect(overlap.body.missingDisclosures).toHaveLength(2);
  });

  it('imports a broker tradebook through review and commit, and refuses duplicates the second time', async () => {
    const user = await registerUser(app);
    const uploaded = await user.upload('/portfolio/imports', {}, { name: 'tradebook.csv', content: ZERODHA_TRADEBOOK }).expect(201);
    expect(uploaded.body.batch).toMatchObject({ source: 'BROKER_CSV', status: 'READY' });
    expect(uploaded.body.counts).toMatchObject({ total: 2, new: 2, duplicate: 0 });
    expect(uploaded.body.batch.userId).toBeUndefined();
    const batchId = uploaded.body.batch.id as string;

    const committed = await user.post(`/portfolio/imports/${batchId}/commit`).expect(200);
    expect(committed.body.batch.status).toBe('COMMITTED');
    expect(committed.body.counts.committed).toBe(2);
    await user.post(`/portfolio/imports/${batchId}/commit`).expect(409);

    const holdings = (await user.get('/holdings').expect(200)).body.items as { id: string; name: string; symbol: string }[];
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ name: 'INFY', kind: 'EQUITY', symbol: 'INFY' });
    const detail = await user.get(`/holdings/${holdings[0].id}?asOf=${ASOF}`).expect(200);
    expect(detail.body.position).toMatchObject({ units: '60.00000', invested: '100000.00' });
    expect(detail.body.position.realised).toHaveLength(1);

    // The same file again: every row is a known duplicate, so there is nothing to commit.
    const second = await user.upload('/portfolio/imports', {}, { name: 'tradebook.csv', content: ZERODHA_TRADEBOOK }).expect(201);
    expect(second.body.counts).toMatchObject({ new: 0, duplicate: 2 });
    const nothing = await user.post(`/portfolio/imports/${second.body.batch.id}/commit`).expect(422);
    expect(nothing.body.error.code).toBe('NOTHING_TO_COMMIT');

    // A skipped row stays out of the ledger.
    const third = await user.upload('/portfolio/imports', {}, { name: 'more.csv', content: 'symbol,isin,trade_date,trade_type,quantity,price\nTCS,INE467B01029,2026-01-05,buy,10,3500\n' }).expect(201);
    const rowId = third.body.rows[0].id as string;
    await user.patch(`/portfolio/imports/${third.body.batch.id}/rows/${rowId}`, { status: 'SKIPPED' }).expect(200);
    await user.post(`/portfolio/imports/${third.body.batch.id}/commit`).expect(422);

    await user.delete(`/portfolio/imports/${third.body.batch.id}`).expect(204);
    await user.get(`/portfolio/imports/${third.body.batch.id}`).expect(404);
    expect((await user.get('/portfolio/imports').expect(200)).body.items).toHaveLength(2);
  });

  it('applies NAV and index files straight away and uses them in reports', async () => {
    const user = await registerUser(app);
    const fund = (await user.post('/holdings', { name: 'Flexi Cap', kind: 'MUTUAL_FUND', schemeCode: '122639' }).expect(201)).body;
    await user.post(`/holdings/${fund.id}/transactions`, { date: '2024-09-19', type: 'BUY', units: '1000', price: '50' }).expect(201);

    const nav = await user.upload('/portfolio/imports', {}, { name: 'NAVAll.txt', content: AMFI_NAV }).expect(201);
    expect(nav.body.batch).toMatchObject({ source: 'AMFI_NAV', status: 'COMMITTED' });
    expect(nav.body.applied).toBe(1);
    expect((await user.get(`/holdings/${fund.id}?asOf=${ASOF}`).expect(200)).body.holding).toMatchObject({ latestPrice: '100.00', latestPriceDate: '2026-09-18' });

    const index = await user.upload('/portfolio/imports', {}, { name: 'nifty.csv', content: NIFTY_CSV }).expect(201);
    expect(index.body.batch).toMatchObject({ source: 'BENCHMARK_CSV', status: 'COMMITTED' });

    const returns = await user.get(`/portfolio/returns?asOf=${ASOF}`).expect(200);
    expect(returns.body.availableBenchmarks).toEqual(['NIFTY 50 TRI']);
    // ₹50,000 into the index at 25,000 doubles the units to ₹60,000 at 30,000.
    expect(returns.body.benchmark).toMatchObject({ series: 'NIFTY 50 TRI', value: '60000.00' });
    expect(returns.body.benchmark.differencePercent).toBeGreaterThan(0);

    const unsupported = await user.upload('/portfolio/imports', {}, { name: 'notes.csv', content: 'a,b\n1,2\n' }).expect(422);
    expect(unsupported.body.error.code).toBe('UNSUPPORTED_FILE');
  });

  it('keeps every holding, import and report scoped to its owner', async () => {
    const user = await registerUser(app);
    const other = await registerUser(app);
    const holding = (await user.post('/holdings', { name: 'Private Fund', kind: 'MUTUAL_FUND' }).expect(201)).body;
    await user.post(`/holdings/${holding.id}/transactions`, { date: '2024-09-19', type: 'BUY', units: '100', price: '50' }).expect(201);
    const batch = (await user.upload('/portfolio/imports', {}, { name: 'tradebook.csv', content: ZERODHA_TRADEBOOK }).expect(201)).body.batch;

    expect((await other.get('/holdings').expect(200)).body.items).toEqual([]);
    await other.get(`/holdings/${holding.id}`).expect(404);
    await other.patch(`/holdings/${holding.id}`, { name: 'Stolen' }).expect(404);
    await other.delete(`/holdings/${holding.id}`).expect(404);
    await other.post(`/holdings/${holding.id}/transactions`, { date: '2026-01-01', type: 'BUY', units: '1', price: '1' }).expect(404);
    await other.get(`/portfolio/imports/${batch.id}`).expect(404);
    await other.post(`/portfolio/imports/${batch.id}/commit`).expect(404);

    const summary = await other.get(`/portfolio/summary?asOf=${ASOF}`).expect(200);
    expect(summary.body).toMatchObject({ holdingCount: 0, currentValue: '0.00' });
  });
});
