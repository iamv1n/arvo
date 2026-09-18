import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser } from './app';

const ASOF = '2026-09-19';

/** A Zerodha Console tradebook: one delivery round trip and one option round trip. */
const TRADEBOOK = `symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
INFY,INE009A01021,2025-06-02,NSE,EQ,EQ,buy,false,100,1500,101,201,2025-06-02T09:20:31
INFY,INE009A01021,2025-06-20,NSE,EQ,EQ,sell,false,100,1600,102,202,2025-06-20T14:05:02
NIFTY25JUN24500CE,,2025-06-10,NFO,FO,,buy,false,75,200,103,203,2025-06-10T10:15:00
NIFTY25JUN24500CE,,2025-06-11,NFO,FO,,sell,false,75,100,104,204,2025-06-11T11:30:44
`;

/** A one-pixel PNG, for the screenshot attachment test. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function withTradebook(app: INestApplication) {
  const user = await registerUser(app);
  const upload = await user.upload('/trades/imports', {}, { name: 'tradebook.csv', content: TRADEBOOK }).expect(201);
  await user.post(`/trades/imports/${upload.body.batch.id as string}/commit`).expect(200);
  return user;
}

describe('Trading journal (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('requires authentication everywhere', async () => {
    await request(app.getHttpServer()).get('/trades').expect(401);
    await request(app.getHttpServer()).get('/positions').expect(401);
    await request(app.getHttpServer()).get('/trading/metrics').expect(401);
    await request(app.getHttpServer()).get('/trading/tax').expect(401);
    await request(app.getHttpServer()).post('/trades').send({}).expect(401);
  });

  it('records a fill by hand, deriving the contract from the symbol', async () => {
    const user = await registerUser(app);
    const created = await user
      .post('/trades', { date: '2025-06-02', time: '09:20', symbol: 'nifty25jun24500ce', side: 'BUY', quantity: '75', price: '120.25', lotSize: 25 })
      .expect(201);
    expect(created.body).toMatchObject({
      symbol: 'NIFTY25JUN24500CE',
      underlying: 'NIFTY',
      segment: 'INDEX_OPTIONS',
      exchange: 'NFO',
      expiry: '2025-06-26',
      strike: '24500.00',
      right: 'CE',
      time: '09:20:00',
      amount: '9018.75',
      brokerage: '20.00',
      chargesSource: 'ESTIMATED',
    });
    expect(created.body.userId).toBeUndefined();

    const listed = await user.get('/trades').expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.brokers).toEqual(['Manual']);
  });

  it('rejects a fractional quantity and an unknown segment', async () => {
    const user = await registerUser(app);
    const base = { date: '2025-06-02', symbol: 'INFY', side: 'BUY', price: '100' };
    await user.post('/trades', { ...base, quantity: '10.5' }).expect(400);
    await user.post('/trades', { ...base, quantity: '10', segment: 'CRYPTO' }).expect(400);
    await user.post('/trades', { ...base, quantity: '10', time: '99:99' }).expect(400);
  });

  it('imports a tradebook through review and commit, and refuses the same file twice', async () => {
    const user = await registerUser(app);
    const upload = await user.upload('/trades/imports', {}, { name: 'tradebook.csv', content: TRADEBOOK }).expect(201);
    expect(upload.body.batch).toMatchObject({ source: 'TRADEBOOK_CSV', profile: 'zerodha-tradebook', broker: 'Zerodha', status: 'READY' });
    expect(upload.body.counts).toMatchObject({ total: 4, new: 4, duplicate: 0 });
    expect(upload.body.rows[0].parsed).toMatchObject({ symbol: 'INFY', side: 'BUY', quantity: '100' });
    const batchId = upload.body.batch.id as string;

    const committed = await user.post(`/trades/imports/${batchId}/commit`).expect(200);
    expect(committed.body.batch.status).toBe('COMMITTED');
    expect(committed.body.counts.committed).toBe(4);
    await user.post(`/trades/imports/${batchId}/commit`).expect(409);

    const again = await user.upload('/trades/imports', {}, { name: 'tradebook.csv', content: TRADEBOOK }).expect(201);
    expect(again.body.counts).toMatchObject({ total: 4, new: 0, duplicate: 4 });
    await user.post(`/trades/imports/${again.body.batch.id as string}/commit`).expect(422);

    const trades = await user.get('/trades').expect(200);
    expect(trades.body.items).toHaveLength(4);
    expect(trades.body.items[0]).toMatchObject({ broker: 'Zerodha', chargesSource: 'ESTIMATED' });
  });

  it('lets a row be skipped before commit', async () => {
    const user = await registerUser(app);
    const upload = await user.upload('/trades/imports', {}, { name: 'tradebook.csv', content: TRADEBOOK }).expect(201);
    const batchId = upload.body.batch.id as string;
    const rowId = upload.body.rows[3].id as string;
    const skipped = await user.patch(`/trades/imports/${batchId}/rows/${rowId}`, { include: false }).expect(200);
    expect(skipped.body.counts).toMatchObject({ new: 3, skipped: 1 });
    await user.post(`/trades/imports/${batchId}/commit`).expect(200);
    expect((await user.get('/trades').expect(200)).body.items).toHaveLength(3);
  });

  it('refuses a file it cannot read', async () => {
    const user = await registerUser(app);
    const bad = await user.upload('/trades/imports', {}, { name: 'notes.csv', content: 'a,b\n1,2\n' }).expect(422);
    expect(bad.body.error.code).toBe('UNSUPPORTED_FILE');
  });

  it('rebuilds positions with charges netted off', async () => {
    const user = await withTradebook(app);
    const positions = await user.get(`/positions?asOf=${ASOF}`).expect(200);
    expect(positions.body.items).toHaveLength(2);
    expect(positions.body.closedCount).toBe(2);
    expect(positions.body.disclaimer).toContain('not investment advice');

    const option = positions.body.items.find((p: { underlying: string }) => p.underlying === 'NIFTY');
    expect(option).toMatchObject({ segment: 'INDEX_OPTIONS', direction: 'LONG', grossPnl: '-7500.00', style: 'BTST', status: 'CLOSED' });
    expect(Number(option.charges.total)).toBeGreaterThan(0);

    const equity = positions.body.items.find((p: { underlying: string }) => p.underlying === 'INFY');
    expect(equity).toMatchObject({ segment: 'EQUITY_DELIVERY', grossPnl: '10000.00', style: 'POSITIONAL' });
    expect(equity.charges.dpCharges).toBe('13.00');
    expect(Number(equity.netPnl)).toBeLessThan(10000);
    expect(equity.chargesPercentOfGross).toBeGreaterThan(0);

    const detail = await user.get(`/positions/${equity.id as string}?asOf=${ASOF}`).expect(200);
    expect(detail.body.position.entries).toHaveLength(1);
    expect(detail.body.position.exits).toHaveLength(1);
    expect(detail.body.mistakeChecklist.length).toBeGreaterThan(5);
  });

  it('reports metrics, behaviour and the reality check', async () => {
    const user = await withTradebook(app);

    const metrics = await user.get(`/trading/metrics?asOf=${ASOF}`).expect(200);
    expect(metrics.body).toMatchObject({ closedTrades: 2, wins: 1, losses: 1, winRate: 50 });
    expect(metrics.body.equityCurve).toHaveLength(2);
    expect(metrics.body.bySegment.map((row: { key: string }) => row.key).sort()).toEqual(['EQUITY_DELIVERY', 'INDEX_OPTIONS']);
    expect(metrics.body.disclaimer).toBeTruthy();

    const behaviour = await user.get(`/trading/behaviour?asOf=${ASOF}`).expect(200);
    expect(behaviour.body.rules).toMatchObject({ revengeWindowMinutes: 15 });
    expect(Array.isArray(behaviour.body.flags)).toBe(true);

    const reality = await user.get(`/trading/reality-check?asOf=${ASOF}`).expect(200);
    expect(reality.body.years[0]).toMatchObject({ financialYear: '2025-26' });
    expect(reality.body.years[0].index.source).toBe('ASSUMED');
    expect(reality.body.disclaimer).toContain('estimate');
  });

  it('splits the tax year and exports the ITR-3 worksheet', async () => {
    const user = await withTradebook(app);

    const tax = await user.get(`/trading/tax?fy=2025-26&asOf=${ASOF}`).expect(200);
    expect(tax.body).toMatchObject({ financialYear: '2025-26', from: '2025-04-01', to: '2026-03-31' });
    expect(tax.body.nonSpeculative.trades).toBe(1);
    expect(Number(tax.body.nonSpeculative.netPnl)).toBeLessThan(0);
    expect(tax.body.capitalGains.buckets.find((b: { term: string }) => b.term === 'SHORT').trades).toBe(1);
    expect(tax.body.optionSellPremium).toBe('7500.00');
    expect(tax.body.audit.aboveThreshold).toBe(false);
    expect(tax.body.availableYears).toEqual(['2025-26']);
    expect(tax.body.disclaimer).toContain('not tax advice');

    const csv = await user.get(`/trading/exports/itr3?fy=2025-26&asOf=${ASOF}`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('arvo-itr3-2025-26.csv');
    expect(csv.text).toContain('Schedule BP');
    expect(csv.text).toContain('Schedule CG');
    expect(csv.text).toContain('Total charges');
  });

  it('keeps journal notes, tags and a stop, and feeds the R-multiple', async () => {
    const user = await withTradebook(app);
    const positions = await user.get(`/positions?asOf=${ASOF}`).expect(200);
    const equity = positions.body.items.find((p: { underlying: string }) => p.underlying === 'INFY');

    const saved = await user
      .put(`/trading/journal/${equity.id as string}`, {
        notes: 'Bought the retest of the breakout level and held it to the measured move.',
        setupTags: ['Breakout'],
        emotionTags: ['Calm'],
        mistakes: ['Entered late, chasing'],
        stopPrice: '1450',
      })
      .expect(200);
    expect(saved.body).toMatchObject({ setupTags: ['Breakout'], stopPrice: '1450.00' });
    expect(saved.body.userId).toBeUndefined();

    const read = await user.get(`/trading/journal/${equity.id as string}`).expect(200);
    expect(read.body.entry.notes).toContain('retest');

    const metrics = await user.get(`/trading/metrics?asOf=${ASOF}`).expect(200);
    expect(metrics.body.rMultiples).toHaveLength(1);
    expect(metrics.body.bySetup.map((row: { key: string }) => row.key)).toContain('Breakout');
  });

  it('stores a screenshot on local disk and reads it back', async () => {
    const user = await withTradebook(app);
    const positions = await user.get(`/positions?asOf=${ASOF}`).expect(200);
    const id = positions.body.items[0].id as string;

    const uploaded = await user.upload(`/trading/journal/${id}/screenshots`, {}, { name: 'chart.png', content: PNG }).expect(201);
    expect(uploaded.body.screenshots).toHaveLength(1);
    const path = uploaded.body.screenshots[0].path as string;
    expect(uploaded.body.screenshots[0]).toMatchObject({ filename: 'chart.png', mimeType: 'image/png' });

    const name = path.split('/')[1];
    const fetched = await user.get(`/trading/journal/${id}/screenshots/${name}`).expect(200);
    expect(fetched.headers['content-type']).toContain('image/png');

    const removed = await user.delete(`/trading/journal/${id}/screenshots/${name}`).expect(200);
    expect(removed.body.screenshots).toHaveLength(0);
  });

  it('stores per-user settings and uses them in the behaviour rules', async () => {
    const user = await registerUser(app);
    expect((await user.get('/trading/settings').expect(200)).body).toMatchObject({ revengeWindowMinutes: 15, assumedFdRatePercent: '7' });
    const saved = await user.patch('/trading/settings', { revengeWindowMinutes: 45, assumedFdRatePercent: '7.5' }).expect(200);
    expect(saved.body).toMatchObject({ revengeWindowMinutes: 45, assumedFdRatePercent: '7.50' });
    const behaviour = await user.get('/trading/behaviour').expect(200);
    expect(behaviour.body.rules.revengeWindowMinutes).toBe(45);
    await user.patch('/trading/settings', { revengeWindowMinutes: 0 }).expect(400);
  });

  it('keeps one user’s journal out of another’s', async () => {
    const mine = await withTradebook(app);
    const theirs = await registerUser(app);

    const positions = await mine.get(`/positions?asOf=${ASOF}`).expect(200);
    const id = positions.body.items[0].id as string;
    const tradeId = positions.body.items[0].entries[0].tradeId as string;

    expect((await theirs.get(`/positions?asOf=${ASOF}`).expect(200)).body.items).toHaveLength(0);
    await theirs.get(`/positions/${id}?asOf=${ASOF}`).expect(404);
    await theirs.get(`/trades/${tradeId}`).expect(404);
    await theirs.put(`/trading/journal/${id}`, { notes: 'not mine' }).expect(404);
    await theirs.delete(`/trades/${tradeId}`).expect(404);
    expect((await theirs.get('/trading/metrics').expect(200)).body.closedTrades).toBe(0);

    // Still intact for the owner.
    expect((await mine.get('/trades').expect(200)).body.items).toHaveLength(4);
  });

  it('deletes a fill and the journal entry that hung off it', async () => {
    const user = await withTradebook(app);
    const positions = await user.get(`/positions?asOf=${ASOF}`).expect(200);
    const equity = positions.body.items.find((p: { underlying: string }) => p.underlying === 'INFY');
    await user.put(`/trading/journal/${equity.id as string}`, { notes: 'to be removed' }).expect(200);
    await user.delete(`/trades/${equity.id as string}`).expect(204);
    expect((await user.get('/trades').expect(200)).body.items).toHaveLength(3);
    expect((await user.get(`/trading/journal/${equity.id as string}`).expect(200)).body.entry).toBeNull();
  });
});
