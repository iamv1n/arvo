import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser } from './app';

/*
 * The Strategy Lab end to end.
 *
 * Two things matter beyond the happy paths: that nothing here can be reached without
 * authentication, and that one user can never see another's strategies, runs, paper accounts or
 * price data. The isolation block at the bottom checks every one of those.
 */

const ASOF = '2026-09-19';
const EXPIRY = '2026-10-29';

const leg = (over: Record<string, unknown> = {}) => ({
  kind: 'CALL',
  action: 'BUY',
  lots: 1,
  lotSize: 75,
  strike: '24000',
  premium: '150',
  expiry: EXPIRY,
  ...over,
});

const ASSUMPTIONS = { spot: '24000', asOf: ASOF, riskFreeRatePercent: '6.5', dividendYieldPercent: '0', impliedVolatilityPercent: '14' };

/** Two years of daily bars that trend up then down, so a crossover strategy actually trades. */
function priceCsv(): string {
  const lines = ['Date,Open,High,Low,Close,Volume'];
  const day = new Date('2024-01-01T00:00:00Z');
  let close = 1000;
  for (let i = 0; i < 300; i += 1) {
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    // A deterministic wave: no randomness, so the whole suite is reproducible.
    const drift = Math.sin(i / 18) * 40 + i * 0.4;
    const open = close;
    close = Number((1000 + drift).toFixed(2));
    const high = Number((Math.max(open, close) + 5).toFixed(2));
    const low = Number((Math.min(open, close) - 5).toFixed(2));
    lines.push(`${day.toISOString().slice(0, 10)},${open},${high},${low},${close},${1000 + i}`);
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return `${lines.join('\n')}\n`;
}

const SPEC = {
  name: 'SMA crossover',
  symbol: 'TESTCO',
  timeframe: 'DAY',
  direction: 'LONG',
  startingCapital: '1000000',
  entry: { type: 'COMPARE', left: { type: 'PRICE', field: 'CLOSE' }, op: 'GT', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 10 } } },
  exit: { type: 'COMPARE', left: { type: 'PRICE', field: 'CLOSE' }, op: 'LT', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 10 } } },
  stopLoss: null,
  target: null,
  trailingStop: null,
  maxBarsInTrade: null,
  intradaySquareOffTime: null,
  maxPositions: 1,
  sizing: { method: 'FIXED_QUANTITY', quantity: 100, lotSize: 1 },
  execution: { fill: 'NEXT_BAR_OPEN', slippageType: 'BPS', slippage: 5, segment: 'EQUITY_DELIVERY', exchange: 'NSE', broker: 'estimate' },
};

type User = Awaited<ReturnType<typeof registerUser>>;

/** Registers a user and loads the price series every backtest test needs. */
async function withPrices(app: INestApplication): Promise<User> {
  const user = await registerUser(app);
  const upload = await user.upload('/lab/market-data/imports', { symbol: 'TESTCO' }, { name: 'testco.csv', content: priceCsv() }).expect(201);
  await user.post(`/lab/market-data/imports/${upload.body.id as string}/commit`).expect(200);
  return user;
}

describe('Strategy Lab (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('requires authentication everywhere', async () => {
    const server = app.getHttpServer();
    await request(server).post('/lab/payoff').send({}).expect(401);
    await request(server).post('/lab/greeks').send({}).expect(401);
    await request(server).post('/lab/iv').send({}).expect(401);
    await request(server).post('/lab/futures').send({}).expect(401);
    await request(server).post('/lab/sizing').send({}).expect(401);
    await request(server).get('/lab/strategies').expect(401);
    await request(server).post('/lab/backtests').send({}).expect(401);
    await request(server).get('/lab/backtests').expect(401);
    await request(server).get('/lab/paper').expect(401);
    await request(server).get('/lab/market-data').expect(401);
    await request(server).get('/lab/library').expect(401);
  });

  // ---- payoff, Greeks, implied volatility ----

  describe('payoff builder', () => {
    it('prices a long call and labels everything as education', async () => {
      const user = await registerUser(app);
      const res = await user.post('/lab/payoff', { legs: [leg()], assumptions: ASSUMPTIONS }).expect(200);
      expect(res.body.maxLoss).toMatchObject({ amount: '-11250.00', unlimited: false });
      expect(res.body.maxProfit.unlimited).toBe(true);
      expect(res.body.breakevens).toHaveLength(1);
      expect(Number(res.body.breakevens[0])).toBeCloseTo(24150, 0);
      expect(res.body.series.length).toBeGreaterThan(50);
      expect(res.body.margin.disclaimer).toContain('SPAN');
      expect(res.body.disclaimer).toContain('not investment advice');
      expect(res.body.probabilityOfProfit.caveat).toContain('not a forecast');
    });

    it('caps both ends of a spread and credits the margin for defined risk', async () => {
      const user = await registerUser(app);
      const res = await user
        .post('/lab/payoff', {
          legs: [leg({ action: 'SELL', premium: '300' }), leg({ strike: '24200', premium: '180' })],
          assumptions: ASSUMPTIONS,
        })
        .expect(200);
      expect(res.body.maxLoss.unlimited).toBe(false);
      expect(res.body.maxProfit.unlimited).toBe(false);
      expect(Number(res.body.margin.hedgeCredit)).toBeGreaterThan(0);
    });

    it('honours a custom margin assumption', async () => {
      const user = await registerUser(app);
      const cheap = await user
        .post('/lab/payoff', { legs: [leg({ action: 'SELL' })], assumptions: ASSUMPTIONS, margin: { nakedPercentOfNotional: '5' } })
        .expect(200);
      expect(cheap.body.margin.total).toBe('90000.00');
    });

    it('returns per-leg and net Greeks in trader units', async () => {
      const user = await registerUser(app);
      const res = await user
        .post('/lab/greeks', { legs: [leg(), leg({ kind: 'PUT' })], assumptions: ASSUMPTIONS })
        .expect(200);
      expect(res.body.legs).toHaveLength(2);
      expect(Number(res.body.net.gamma)).toBeGreaterThan(0);
      expect(Number(res.body.net.theta)).toBeLessThan(0);
      expect(res.body.legs[0].greeks.delta).toBeDefined();
    });

    it('rejects a leg it cannot price', async () => {
      const user = await registerUser(app);
      await user.post('/lab/payoff', { legs: [], assumptions: ASSUMPTIONS }).expect(400);
      await user.post('/lab/payoff', { legs: [leg({ lots: 0 })], assumptions: ASSUMPTIONS }).expect(400);
      await user.post('/lab/payoff', { legs: [leg({ premium: 'abc' })], assumptions: ASSUMPTIONS }).expect(400);
      // A null strike passes the DTO (futures legs have none) and is refused by the engine.
      await user.post('/lab/payoff', { legs: [leg({ strike: null })], assumptions: ASSUMPTIONS }).expect(422);
    });

    it('solves implied volatility and splits out the time value', async () => {
      const user = await registerUser(app);
      const res = await user
        .post('/lab/iv', { spot: '24000', strike: '23800', expiry: EXPIRY, asOf: ASOF, right: 'CE', premium: '420' })
        .expect(200);
      expect(res.body.status).toBe('SOLVED');
      expect(res.body.intrinsicValue).toBe('200.00');
      expect(res.body.timeValue).toBe('220.00');
      expect(res.body.daysToExpiry).toBe(40);
      expect(Number(res.body.impliedVolatilityPercent)).toBeGreaterThan(0);
    });

    it('says so when a premium is outside the no-arbitrage bounds instead of guessing', async () => {
      const user = await registerUser(app);
      const res = await user
        .post('/lab/iv', { spot: '24000', strike: '20000', expiry: EXPIRY, asOf: ASOF, right: 'CE', premium: '10' })
        .expect(200);
      expect(res.body.status).toBe('BELOW_INTRINSIC');
      expect(res.body.impliedVolatilityPercent).toBeNull();
    });

    it('lists and builds the prebuilt structures', async () => {
      const user = await registerUser(app);
      const listed = await user.get('/lab/templates').expect(200);
      expect(listed.body.templates.length).toBeGreaterThanOrEqual(13);
      expect(listed.body.templates[0]).toHaveProperty('libraryslug');

      const built = await user
        .post('/lab/templates', { template: 'IRON_CONDOR', spot: '24000', strikeStep: '50', lotSize: 75, expiry: EXPIRY, asOf: ASOF })
        .expect(200);
      expect(built.body.legs).toHaveLength(4);
      expect(built.body.note).toContain('not quotes');

      const priced = await user.post('/lab/payoff', { legs: built.body.legs, assumptions: built.body.assumptions }).expect(200);
      expect(priced.body.maxLoss.unlimited).toBe(false);
    });

    it('refuses a calendar without its second expiry', async () => {
      const user = await registerUser(app);
      await user
        .post('/lab/templates', { template: 'CALENDAR_CALL', spot: '24000', strikeStep: '50', lotSize: 75, expiry: EXPIRY, asOf: ASOF })
        .expect(422);
    });
  });

  // ---- calculators ----

  describe('calculators', () => {
    it('works out a futures position, its basis and the cost of rolling', async () => {
      const user = await registerUser(app);
      const res = await user
        .post('/lab/futures', {
          underlying: 'NIFTY',
          date: ASOF,
          lots: 2,
          lotSize: 75,
          futuresPrice: '24100',
          spot: '24000',
          expiry: EXPIRY,
          markPrice: '24150',
          rollover: { nearPrice: '24100', farPrice: '24160' },
        })
        .expect(200);
      expect(res.body.notional).toBe('3615000.00');
      expect(res.body.mtm).toBe('7500.00');
      expect(res.body.basis).toBe('100.00');
      expect(res.body.daysToExpiry).toBe(40);
      expect(Number(res.body.rollover.charges.total)).toBeGreaterThan(0);
      expect(res.body.margin.disclaimer).toContain('broker');
    });

    it('sizes a position from the stop distance', async () => {
      const user = await registerUser(app);
      const res = await user
        .post('/lab/sizing', { capital: '500000', riskPercent: '1', entryPrice: '1000', stopPrice: '980', targetPrice: '1060' })
        .expect(200);
      expect(res.body).toMatchObject({ method: 'FIXED_FRACTIONAL', riskPerTrade: '5000.00', quantity: 250, rewardToRisk: '3.00' });
    });

    it('refuses a stop sitting on the entry', async () => {
      const user = await registerUser(app);
      await user.post('/lab/sizing', { capital: '500000', riskPercent: '1', entryPrice: '1000', stopPrice: '1000' }).expect(422);
    });

    it('computes risk of ruin and explains Kelly with a warning', async () => {
      const user = await registerUser(app);
      const res = await user.post('/lab/risk-of-ruin', { winRatePercent: '50', payoffRatio: '2', riskPercent: '2' }).expect(200);
      expect(Number(res.body.percent)).toBeLessThan(1);
      expect(res.body.kelly.fullKellyPercent).toBe('25.00');
      expect(res.body.kelly.warning).toContain('not a size to trade');

      const doomed = await user.post('/lab/risk-of-ruin', { winRatePercent: '30', payoffRatio: '1', riskPercent: '2' }).expect(200);
      expect(Number(doomed.body.percent)).toBe(100);
    });
  });

  // ---- library ----

  describe('library', () => {
    it('lists the explainers without their bodies', async () => {
      const user = await registerUser(app);
      const res = await user.get('/lab/library').expect(200);
      expect(res.body.entries.length).toBeGreaterThanOrEqual(15);
      expect(res.body.entries[0].markdown).toBeUndefined();
      expect(res.body.disclaimer).toContain('not investment advice');
    });

    it('serves one explainer as markdown', async () => {
      const user = await registerUser(app);
      const res = await user.get('/lab/library/iron-condor').expect(200);
      expect(res.body.entry.title).toBe('Iron condor');
      expect(res.body.entry.markdown).toContain('## When it fails');
      await user.get('/lab/library/no-such-thing').expect(404);
    });
  });

  // ---- market data ----

  describe('market data imports', () => {
    it('parses, reviews and commits a price file, then lists the series', async () => {
      const user = await registerUser(app);
      const upload = await user
        .upload('/lab/market-data/imports', { symbol: 'TESTCO' }, { name: 'testco.csv', content: priceCsv() })
        .expect(201);
      expect(upload.body).toMatchObject({ symbol: 'TESTCO', timeframe: 'DAY', status: 'READY', rowCount: 300 });
      // The parsed blob never crosses the wire; it can be megabytes.
      expect(upload.body.parsed).toEqual([]);

      const preview = await user.get(`/lab/market-data/imports/${upload.body.id as string}`).expect(200);
      expect(preview.body.head).toHaveLength(20);
      expect(preview.body.tail).toHaveLength(20);

      const committed = await user.post(`/lab/market-data/imports/${upload.body.id as string}/commit`).expect(200);
      expect(committed.body.inserted).toBe(300);
      expect(committed.body.batch.status).toBe('COMMITTED');

      const series = await user.get('/lab/market-data').expect(200);
      expect(series.body.series).toHaveLength(1);
      expect(series.body.series[0]).toMatchObject({ symbol: 'TESTCO', timeframe: 'DAY', bars: 300 });
    });

    it('is idempotent: re-importing an overlapping file adds nothing', async () => {
      const user = await withPrices(app);
      const again = await user.upload('/lab/market-data/imports', { symbol: 'TESTCO' }, { name: 'again.csv', content: priceCsv() }).expect(201);
      const committed = await user.post(`/lab/market-data/imports/${again.body.id as string}/commit`).expect(200);
      expect(committed.body.inserted).toBe(0);
      expect((await user.get('/lab/market-data').expect(200)).body.series[0].bars).toBe(300);
    });

    it('refuses a file that is not price data, and will not commit twice', async () => {
      const user = await registerUser(app);
      await user.upload('/lab/market-data/imports', {}, { name: 'contacts.csv', content: 'name,email\nalice,a@example.com\n' }).expect(422);

      const upload = await user.upload('/lab/market-data/imports', { symbol: 'X' }, { name: 'x.csv', content: priceCsv() }).expect(201);
      await user.post(`/lab/market-data/imports/${upload.body.id as string}/commit`).expect(200);
      await user.post(`/lab/market-data/imports/${upload.body.id as string}/commit`).expect(409);
    });

    it('deletes a series', async () => {
      const user = await withPrices(app);
      await user.delete('/lab/market-data?symbol=TESTCO&timeframe=DAY').expect(204);
      expect((await user.get('/lab/market-data').expect(200)).body.series).toEqual([]);
    });
  });

  // ---- strategies and backtests ----

  describe('strategies', () => {
    it('saves, reads, edits and deletes a strategy', async () => {
      const user = await registerUser(app);
      const created = await user.post('/lab/strategies', { name: 'Crossover', spec: SPEC }).expect(201);
      expect(created.body.spec.symbol).toBe('TESTCO');
      expect(created.body.runCount).toBe(0);
      expect(created.body.userId).toBeUndefined();

      const id = created.body.id as string;
      await user.patch(`/lab/strategies/${id}`, { name: 'Crossover v2' }).expect(200);
      expect((await user.get(`/lab/strategies/${id}`).expect(200)).body.name).toBe('Crossover v2');
      expect((await user.get('/lab/strategies').expect(200)).body.items).toHaveLength(1);

      await user.delete(`/lab/strategies/${id}`).expect(204);
      await user.get(`/lab/strategies/${id}`).expect(404);
    });

    it('rejects a rule tree the schema does not recognise', async () => {
      const user = await registerUser(app);
      await user.post('/lab/strategies', { name: 'Bad', spec: { ...SPEC, entry: { type: 'EXEC', code: 'process.exit()' } } }).expect(400);
      await user.post('/lab/strategies', { name: 'Bad', spec: { ...SPEC, entry: { type: 'ALWAYS', extra: 1 } } }).expect(400);
      await user.post('/lab/strategies', { name: 'Bad', spec: { ...SPEC, maxPositions: 999 } }).expect(400);
      await user
        .post('/lab/strategies', {
          name: 'Bad',
          spec: { ...SPEC, entry: { type: 'COMPARE', left: { type: 'PRICE', field: 'CLOSE' }, op: 'GT', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 9999 } } } },
        })
        .expect(400);
    });

    it('refuses a strategy with no way to close a position', async () => {
      const user = await registerUser(app);
      await user.post('/lab/strategies', { name: 'Stuck', spec: { ...SPEC, exit: null } }).expect(422);
    });
  });

  describe('backtests', () => {
    it('runs a saved strategy and stores the result', async () => {
      const user = await withPrices(app);
      const strategy = await user.post('/lab/strategies', { name: 'Crossover', spec: SPEC }).expect(201);
      const run = await user.post('/lab/backtests', { strategyId: strategy.body.id }).expect(200);

      expect(run.body.id).toBeTruthy();
      expect(run.body.result.stats.bars).toBe(300);
      expect(run.body.result.stats.trades).toBeGreaterThan(0);
      expect(run.body.result.trades[0]).toHaveProperty('charges');
      expect(Number(run.body.result.stats.totalCharges)).toBeGreaterThan(0);
      expect(run.body.result.equityCurve.length).toBe(300);
      expect(run.body.result.assumptions.join(' ')).toContain('next bar');
      expect(run.body.result.disclaimer).toContain('Past performance');

      const listed = await user.get('/lab/backtests').expect(200);
      expect(listed.body.items).toHaveLength(1);
      // The list view carries the headline stats but not the trades or the curve.
      expect(listed.body.items[0].stats.trades).toBe(run.body.result.stats.trades);
      expect(listed.body.items[0].result).toBeUndefined();

      const detail = await user.get(`/lab/backtests/${run.body.id as string}`).expect(200);
      expect(detail.body.result.trades).toHaveLength(run.body.result.trades.length);

      // Running bumps the strategy's run count, which feeds the overfitting note.
      expect((await user.get(`/lab/strategies/${strategy.body.id as string}`).expect(200)).body.runCount).toBe(1);

      await user.delete(`/lab/backtests/${run.body.id as string}`).expect(204);
      await user.get(`/lab/backtests/${run.body.id as string}`).expect(404);
    });

    it('is deterministic', async () => {
      const user = await withPrices(app);
      const first = await user.post('/lab/backtests', { spec: SPEC, save: false }).expect(200);
      const second = await user.post('/lab/backtests', { spec: SPEC, save: false }).expect(200);
      expect(first.body.id).toBeNull();
      expect(JSON.stringify({ ...first.body.result, elapsedMs: 0 })).toBe(JSON.stringify({ ...second.body.result, elapsedMs: 0 }));
    });

    it('splits walk-forward and gives a verdict in words', async () => {
      const user = await withPrices(app);
      const run = await user.post('/lab/backtests', { spec: SPEC, walkForwardSplit: 0.7, save: false }).expect(200);
      expect(run.body.result.walkForward.splitPercent).toBe('70.00');
      expect(run.body.result.walkForward.inSample.bars).toBe(210);
      expect(run.body.result.walkForward.outOfSample.bars).toBe(90);
      expect(run.body.result.walkForward.verdict).toBeTruthy();
    });

    it('narrows the run to a date range', async () => {
      const user = await withPrices(app);
      const run = await user.post('/lab/backtests', { spec: SPEC, from: '2024-06-01', to: '2024-12-31', save: false }).expect(200);
      expect(run.body.result.stats.bars).toBeLessThan(300);
      expect(run.body.result.stats.from >= '2024-06-01').toBe(true);
    });

    it('says so when there are no bars for the symbol', async () => {
      const user = await registerUser(app);
      const res = await user.post('/lab/backtests', { spec: SPEC, save: false }).expect(422);
      expect(res.body.error.code).toBe('LAB_NO_BARS');
      expect(res.body.error.message).toContain('Import a price file');
    });

    it('needs either a saved strategy or a spec', async () => {
      const user = await withPrices(app);
      await user.post('/lab/backtests', {}).expect(400);
    });
  });

  // ---- paper trading ----

  describe('paper trading', () => {
    it('opens an account, fills a market order at the next bar open and marks the journal entry as paper', async () => {
      const user = await withPrices(app);
      const account = await user.post('/lab/paper', { name: 'Practice', startingCapital: '500000' }).expect(201);
      const id = account.body.id as string;
      expect(account.body).toMatchObject({ startingCapital: '500000.00', cash: '500000.00' });

      const order = await user
        .post(`/lab/paper/${id}/orders`, { symbol: 'TESTCO', side: 'BUY', quantity: '100', orderType: 'MARKET', placedDate: '2024-03-01' })
        .expect(201);
      expect(order.body.status).toBe('FILLED');
      expect(order.body.fillPrice).toBeTruthy();
      expect(order.body.tradeId).toBeTruthy();
      expect(order.body.message).toContain('next bar');

      const view = await user.get(`/lab/paper/${id}`).expect(200);
      expect(view.body.positions).toHaveLength(1);
      expect(view.body.positions[0]).toMatchObject({ symbol: 'TESTCO', quantity: 100 });
      expect(Number(view.body.charges)).toBeGreaterThan(0);
      expect(view.body.disclaimer).toContain('never places an order');

      // The fill is in the journal, but the journal leaves it out by default so real metrics
      // stay clean.
      expect((await user.get('/trades').expect(200)).body.items).toHaveLength(0);
      const metrics = await user.get(`/trading/metrics?asOf=${ASOF}`).expect(200);
      expect(metrics.body.closedTrades).toBe(0);
    });

    it('closes a position and books the realised P&L after charges', async () => {
      const user = await withPrices(app);
      const account = await user.post('/lab/paper', { name: 'Practice', startingCapital: '500000' }).expect(201);
      const id = account.body.id as string;
      await user
        .post(`/lab/paper/${id}/orders`, { symbol: 'TESTCO', side: 'BUY', quantity: '100', orderType: 'MARKET', placedDate: '2024-03-01' })
        .expect(201);
      await user
        .post(`/lab/paper/${id}/orders`, { symbol: 'TESTCO', side: 'SELL', quantity: '100', orderType: 'MARKET', placedDate: '2024-06-03' })
        .expect(201);

      const view = await user.get(`/lab/paper/${id}`).expect(200);
      expect(view.body.positions).toHaveLength(0);
      expect(view.body.orders).toHaveLength(2);
      expect(view.body.realisedPnl).toBeDefined();
      expect(Number(view.body.charges)).toBeGreaterThan(0);
    });

    it('leaves an unreachable limit order working rather than inventing a fill', async () => {
      const user = await withPrices(app);
      const account = await user.post('/lab/paper', { name: 'Practice', startingCapital: '500000' }).expect(201);
      const order = await user
        .post(`/lab/paper/${account.body.id as string}/orders`, {
          symbol: 'TESTCO',
          side: 'BUY',
          quantity: '10',
          orderType: 'LIMIT',
          limitPrice: '1',
          placedDate: '2024-03-01',
        })
        .expect(201);
      expect(order.body.status).toBe('PENDING');
      expect(order.body.fillPrice).toBeNull();
      expect(order.body.message).toContain('still working');

      const cancelled = await user.delete(`/lab/paper/orders/${order.body.id as string}`).expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
    });

    it('needs a limit price for a limit order', async () => {
      const user = await withPrices(app);
      const account = await user.post('/lab/paper', { name: 'Practice', startingCapital: '500000' }).expect(201);
      await user
        .post(`/lab/paper/${account.body.id as string}/orders`, { symbol: 'TESTCO', side: 'BUY', quantity: '10', orderType: 'LIMIT', placedDate: '2024-03-01' })
        .expect(422);
    });

    it('renames and deletes an account, taking its simulated fills with it', async () => {
      const user = await withPrices(app);
      const account = await user.post('/lab/paper', { name: 'Practice', startingCapital: '500000' }).expect(201);
      const id = account.body.id as string;
      await user
        .post(`/lab/paper/${id}/orders`, { symbol: 'TESTCO', side: 'BUY', quantity: '100', orderType: 'MARKET', placedDate: '2024-03-01' })
        .expect(201);
      expect((await user.patch(`/lab/paper/${id}`, { name: 'Renamed' }).expect(200)).body.name).toBe('Renamed');

      await user.delete(`/lab/paper/${id}`).expect(204);
      await user.get(`/lab/paper/${id}`).expect(404);
      expect((await user.get('/lab/paper').expect(200)).body.items).toEqual([]);
    });
  });

  // ---- isolation ----

  describe('cross-user isolation', () => {
    it('never shows one user another user’s lab data', async () => {
      const alice = await withPrices(app);
      const bob = await registerUser(app);

      const strategy = await alice.post('/lab/strategies', { name: 'Mine', spec: SPEC }).expect(201);
      const run = await alice.post('/lab/backtests', { strategyId: strategy.body.id }).expect(200);
      const account = await alice.post('/lab/paper', { name: 'Mine', startingCapital: '500000' }).expect(201);
      const order = await alice
        .post(`/lab/paper/${account.body.id as string}/orders`, { symbol: 'TESTCO', side: 'BUY', quantity: '100', orderType: 'MARKET', placedDate: '2024-03-01' })
        .expect(201);

      // Bob sees nothing of Alice's.
      expect((await bob.get('/lab/strategies').expect(200)).body.items).toEqual([]);
      expect((await bob.get('/lab/backtests').expect(200)).body.items).toEqual([]);
      expect((await bob.get('/lab/paper').expect(200)).body.items).toEqual([]);
      expect((await bob.get('/lab/market-data').expect(200)).body.series).toEqual([]);

      // And cannot reach them by id. Absent, never forbidden.
      await bob.get(`/lab/strategies/${strategy.body.id as string}`).expect(404);
      await bob.patch(`/lab/strategies/${strategy.body.id as string}`, { name: 'Stolen' }).expect(404);
      await bob.delete(`/lab/strategies/${strategy.body.id as string}`).expect(404);
      await bob.get(`/lab/backtests/${run.body.id as string}`).expect(404);
      await bob.delete(`/lab/backtests/${run.body.id as string}`).expect(404);
      await bob.get(`/lab/paper/${account.body.id as string}`).expect(404);
      await bob.patch(`/lab/paper/${account.body.id as string}`, { name: 'Stolen' }).expect(404);
      await bob.delete(`/lab/paper/${account.body.id as string}`).expect(404);
      await bob.delete(`/lab/paper/orders/${order.body.id as string}`).expect(404);
      await bob
        .post(`/lab/paper/${account.body.id as string}/orders`, { symbol: 'TESTCO', side: 'BUY', quantity: '1', orderType: 'MARKET', placedDate: '2024-03-01' })
        .expect(404);

      // Bob's own backtest cannot read Alice's bars, so it has nothing to run against.
      await bob.post('/lab/backtests', { spec: SPEC, save: false }).expect(422);

      // Alice still has everything.
      expect((await alice.get('/lab/strategies').expect(200)).body.items).toHaveLength(1);
      expect((await alice.get('/lab/backtests').expect(200)).body.items).toHaveLength(1);
    });

    it('keeps bar imports private too', async () => {
      const alice = await registerUser(app);
      const bob = await registerUser(app);
      const upload = await alice.upload('/lab/market-data/imports', { symbol: 'TESTCO' }, { name: 'x.csv', content: priceCsv() }).expect(201);

      expect((await bob.get('/lab/market-data/imports').expect(200)).body.items).toEqual([]);
      await bob.get(`/lab/market-data/imports/${upload.body.id as string}`).expect(404);
      await bob.post(`/lab/market-data/imports/${upload.body.id as string}/commit`).expect(404);
      await bob.delete(`/lab/market-data/imports/${upload.body.id as string}`).expect(404);
    });
  });
});
