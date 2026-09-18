import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, mailbox, registerUser } from './app';

/*
 * Markets & Alerts end to end.
 *
 * Beyond the happy paths, three things matter here and each has its own block below.
 *
 *   1. Nothing reaches a network. The quote driver is `manual` in tests, the news fetcher and
 *      the Telegram sender both refuse, and the refresh endpoint says so rather than hanging.
 *   2. A market-dependent alert on stale data records "skipped" instead of firing. That is the
 *      single most important behaviour in the area: an alert answered from last week's close is
 *      worse than no alert.
 *   3. One user can never see, evaluate or edit another's watchlists, alerts, calendars or
 *      notifications.
 */

const TODAY = new Date().toISOString().slice(0, 10);

const priceAlert = (over: Record<string, unknown> = {}) => ({
  name: 'NIFTY above 25k',
  kind: 'PRICE_LEVEL',
  params: { symbol: 'NIFTY', exchange: 'NSE', direction: 'ABOVE', level: '25000' },
  cooldownMinutes: 60,
  repeats: false,
  channels: ['IN_APP'],
  ...over,
});

describe('markets', () => {
  let app: INestApplication;
  let alice: Awaited<ReturnType<typeof registerUser>>;

  beforeAll(async () => {
    app = await createTestApp();
    alice = await registerUser(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('watchlists', () => {
    it('creates a list, adds rows, reorders them and shows a manual price', async () => {
      const list = (await alice.post('/watchlists', { name: 'Core', notes: 'Things I follow' }).expect(201)).body;
      expect(list).toMatchObject({ name: 'Core', position: 0 });

      const infy = (await alice.post(`/watchlists/${list.id}/items`, { symbol: 'infy', exchange: 'nse', name: 'Infosys' }).expect(201)).body;
      const tcs = (await alice.post(`/watchlists/${list.id}/items`, { symbol: 'TCS' }).expect(201)).body;
      expect(infy).toMatchObject({ symbol: 'INFY', exchange: 'NSE', position: 0 });

      const reordered = (await alice.post(`/watchlists/${list.id}/items/reorder`, { ids: [tcs.id, infy.id] }).expect(200)).body;
      expect(reordered.items.map((item: { symbol: string }) => item.symbol)).toEqual(['TCS', 'INFY']);

      await alice.post('/market/quotes', { symbol: 'INFY', price: '1500', previousClose: '1450', asOf: TODAY }).expect(201);
      const view = (await alice.get(`/watchlists/${list.id}`).expect(200)).body;
      const row = view.rows.find((r: { item: { symbol: string } }) => r.item.symbol === 'INFY');
      expect(row).toMatchObject({ price: '1500.00', dayChange: '50.00', source: 'MANUAL', isStale: false });
      expect(row.holding).toBeNull();
      expect(view.disclaimer).toContain('never recommends');
    });

    it('rejects a symbol that is not one', async () => {
      const list = (await alice.post('/watchlists', { name: 'Junk' }).expect(201)).body;
      await alice.post(`/watchlists/${list.id}/items`, { symbol: 'not a symbol!' }).expect(400);
    });
  });

  describe('quotes', () => {
    it('never calls a provider when none is configured and says why', async () => {
      const result = (await alice.post('/market/quotes/refresh', { asOf: TODAY }).expect(200)).body;
      expect(result).toMatchObject({ driver: 'manual', providerCalled: false });
      expect(result.skippedReason).toContain('No quote provider is configured');
    });

    it('reports the driver and the staleness threshold with the prices', async () => {
      const body = (await alice.get('/market/quotes').expect(200)).body;
      expect(body.driver).toBe('manual');
      expect(body.staleMinutes).toBeGreaterThan(0);
      expect(body.quotes.map((q: { symbol: string }) => q.symbol)).toContain('INFY');
    });
  });

  describe('calendars', () => {
    it('computes expiries deterministically and shifts them around imported holidays', async () => {
      const before = (await alice.get('/market/calendars/expiries').query({ from: '2026-09-20', to: '2026-09-30' }).expect(200)).body;
      const monthly = before.expiries.find((e: { index: string; cadence: string }) => e.index === 'BANKNIFTY' && e.cadence === 'MONTHLY');
      expect(monthly).toMatchObject({ date: '2026-09-29', shiftedFrom: null });

      const csv = 'Date,Description\n2026-09-29,Test holiday\n';
      const imported = (await alice.upload('/market/calendars/holidays/import', { exchange: 'NSE' }, { name: 'holidays.csv', content: csv }).expect(200)).body;
      expect(imported).toMatchObject({ imported: 1, parsed: 1 });

      const after = (await alice.get('/market/calendars/expiries').query({ from: '2026-09-20', to: '2026-09-30' }).expect(200)).body;
      const moved = after.expiries.find((e: { index: string; cadence: string }) => e.index === 'BANKNIFTY' && e.cadence === 'MONTHLY');
      expect(moved).toMatchObject({ date: '2026-09-28', shiftedFrom: '2026-09-29' });
    });

    it('imports corporate actions from an exchange-shaped CSV', async () => {
      const csv = ['Symbol,Company Name,Purpose,Ex Date,Record Date', 'INFY,Infosys,INTERIM DIVIDEND RS 21 PER SHARE,2026-11-02,2026-11-03'].join('\n');
      const result = (await alice.upload('/market/calendars/corporate-actions/import', {}, { name: 'ca.csv', content: csv }).expect(200)).body;
      expect(result).toMatchObject({ imported: 1, parsed: 1, warnings: [] });

      const listed = (await alice.get('/market/calendars/corporate-actions').query({ from: '2026-11-01', to: '2026-11-30' }).expect(200)).body;
      expect(listed.actions[0]).toMatchObject({ symbol: 'INFY', kind: 'DIVIDEND', exDate: '2026-11-02', amount: '21.00', source: 'IMPORT' });
    });

    it('keeps IPOs and merges all three calendars into one dated list', async () => {
      await alice
        .post('/market/calendars/ipos', {
          name: 'Acme Ltd',
          openDate: '2026-11-04',
          closeDate: '2026-11-06',
          priceBandLow: '100',
          priceBandHigh: '110',
          lotSize: 130,
          status: 'UPCOMING',
        })
        .expect(201);

      const events = (await alice.get('/market/calendars/events').query({ from: '2026-11-01', to: '2026-11-10' }).expect(200)).body;
      const kinds = events.events.map((e: { kind: string }) => e.kind);
      expect(kinds).toContain('CORPORATE_ACTION');
      expect(kinds).toContain('IPO');
      expect(kinds).toContain('EXPIRY');
      expect(events.disclaimer).toContain('never recommends');
    });
  });

  describe('alerts', () => {
    it('always keeps the in-app channel and returns the rule in plain language', async () => {
      const alert = (await alice.post('/alerts', priceAlert({ channels: ['EMAIL'] })).expect(201)).body;
      expect(alert.channels).toEqual(['IN_APP', 'EMAIL']);
      expect(alert.rule).toBe('Notify me once if NIFTY trades at or above 25000.00.');
      await alice.delete(`/alerts/${alert.id}`).expect(204);
    });

    it('tests an alert without firing it or notifying anyone', async () => {
      await alice.post('/market/quotes', { symbol: 'NIFTY', price: '24000', previousClose: null, asOf: TODAY }).expect(201);
      const alert = (await alice.post('/alerts', priceAlert()).expect(201)).body;

      const preview = (await alice.post(`/alerts/${alert.id}/test`).expect(200)).body;
      expect(preview).toMatchObject({ fired: false, status: 'OK' });
      expect(preview.preview).toContain('Notify me once');
      expect((await alice.get(`/alerts/${alert.id}`).expect(200)).body.triggers).toEqual([]);
      await alice.delete(`/alerts/${alert.id}`).expect(204);
    });

    it('fires once, records the evidence, notifies in-app and then stays quiet', async () => {
      await alice.post('/market/quotes', { symbol: 'NIFTY', price: '25400', previousClose: '25100', asOf: TODAY }).expect(201);
      const alert = (await alice.post('/alerts', priceAlert({ name: 'One shot' })).expect(201)).body;

      const first = (await alice.post('/alerts/evaluate').expect(200)).body;
      expect(first.fired).toBeGreaterThanOrEqual(1);

      const detail = (await alice.get(`/alerts/${alert.id}`).expect(200)).body;
      expect(detail).toMatchObject({ isEnabled: false, lastStatus: 'TRIGGERED', triggerCount: 1 });
      expect(detail.triggers[0].evidence).toMatchObject({ symbol: 'NIFTY', price: '25400.00', level: '25000.00' });

      const notifications = (await alice.get('/notifications').expect(200)).body;
      expect(notifications.notifications[0]).toMatchObject({ kind: 'ALERT', title: 'One shot' });
      expect(notifications.unread).toBeGreaterThanOrEqual(1);

      // A one-shot alert disabled itself; a second pass changes nothing.
      const second = (await alice.post('/alerts/evaluate').expect(200)).body;
      expect(second.fired).toBe(0);
      await alice.delete(`/alerts/${alert.id}`).expect(204);
    });

    it('records "skipped, stale data" instead of firing on an old price', async () => {
      // A quote typed in today about a session from 2020 was written seconds ago and is years
      // stale. The engine takes the older of the two ages, so this can never fire.
      await alice.post('/market/quotes', { symbol: 'STALECO', price: '900', previousClose: null, asOf: '2020-01-01' }).expect(201);
      const alert = (
        await alice
          .post('/alerts', priceAlert({ name: 'Stale probe', params: { symbol: 'STALECO', exchange: null, direction: 'ABOVE', level: '1' }, repeats: true }))
          .expect(201)
      ).body;

      const before = (await alice.get('/notifications').expect(200)).body.unread;
      const result = (await alice.post('/alerts/evaluate').expect(200)).body;
      const outcome = result.results.find((r: { alertId: string }) => r.alertId === alert.id);
      expect(outcome).toMatchObject({ status: 'SKIPPED_STALE', fired: false });
      expect(outcome.message).toContain('stale');
      expect(outcome.evidence).toMatchObject({ symbol: 'STALECO', asOf: '2020-01-01' });

      // Nothing was delivered and no trigger was recorded: a skip is not a firing.
      expect((await alice.get('/notifications').expect(200)).body.unread).toBe(before);
      const detail = (await alice.get(`/alerts/${alert.id}`).expect(200)).body;
      expect(detail).toMatchObject({ lastStatus: 'SKIPPED_STALE', triggerCount: 0, isEnabled: true });
      expect(detail.triggers).toEqual([]);

      // Re-quoting the same instrument for today lets the same rule answer normally.
      await alice.post('/market/quotes', { symbol: 'STALECO', price: '900', previousClose: null, asOf: TODAY }).expect(201);
      const second = (await alice.post('/alerts/evaluate').expect(200)).body;
      expect(second.results.find((r: { alertId: string }) => r.alertId === alert.id)).toMatchObject({ status: 'TRIGGERED', fired: true });

      await alice.delete(`/alerts/${alert.id}`).expect(204);
    });

    it('refuses an alert kind it does not know', async () => {
      await alice.post('/alerts', priceAlert({ kind: 'MOON_PHASE' })).expect(400);
    });
  });

  describe('notifications and settings', () => {
    it('marks notifications read and keeps the unread count honest', async () => {
      const before = (await alice.get('/notifications/unread-count').expect(200)).body.unread;
      expect(before).toBeGreaterThanOrEqual(1);
      const marked = (await alice.post('/notifications/read', {}).expect(200)).body;
      expect(marked.marked).toBe(before);
      expect(marked.unread).toBe(0);
    });

    it('validates quiet hours and stores delivery preferences', async () => {
      await alice.patch('/me/notification-settings', { quietHoursStart: '25:00' }).expect(400);
      const saved = (
        await alice
          .patch('/me/notification-settings', { quietHoursStart: '22:00', quietHoursEnd: '07:00', emailEnabled: true, telegramChatId: '12345' })
          .expect(200)
      ).body;
      expect(saved).toMatchObject({ quietHoursStart: '22:00', quietHoursEnd: '07:00', emailEnabled: true, telegramChatId: '12345' });
      expect(saved.expiryRules.find((rule: { index: string }) => rule.index === 'NIFTY')).toMatchObject({ weekday: 2, weekly: true });
    });

    it('accepts a per-index expiry weekday override and recomputes the calendar', async () => {
      await alice.patch('/me/notification-settings', { expiryRules: [{ index: 'NIFTY', weekly: true, weekday: 4, monthly: false }] }).expect(200);
      const expiries = (await alice.get('/market/calendars/expiries').query({ from: '2026-09-01', to: '2026-09-10' }).expect(200)).body;
      const nifty = expiries.expiries.filter((e: { index: string }) => e.index === 'NIFTY').map((e: { date: string }) => e.date);
      expect(nifty).toEqual(['2026-09-03', '2026-09-10']);
      await alice.patch('/me/notification-settings', { expiryRules: [] }).expect(200);
    });
  });

  describe('guardrails', () => {
    it('reports the limits the trader set and stays informational', async () => {
      await alice.patch('/trading/settings', { maxLossPerDay: '5000', maxTradesPerDay: 10 }).expect(200);
      const state = (await alice.get('/market/cool-off').expect(200)).body;
      expect(state.active).toBe(false);
      expect(state.statuses.map((s: { kind: string }) => s.kind)).toEqual(['MAX_LOSS_DAY', 'MAX_TRADES_DAY']);
      expect(state.statuses.every((s: { breached: boolean }) => s.breached === false)).toBe(true);
    });
  });

  describe('news', () => {
    it('reports that fetching is off in this environment and refuses to build a digest', async () => {
      const status = (await alice.get('/market/news/status').expect(200)).body;
      expect(status).toMatchObject({ fetchingEnabled: false, aiEnabled: false });

      await alice.post('/market/news/feeds', { url: 'https://example.com/feed.xml', title: 'Example' }).expect(201);
      await alice.post('/market/news/digests', {}).expect(409);
      expect((await alice.get('/market/news/digests').expect(200)).body.digests).toEqual([]);
    });

    it('rejects a feed URL that is not one', async () => {
      await alice.post('/market/news/feeds', { url: 'not-a-url' }).expect(400);
    });
  });

  describe('isolation', () => {
    it('hides one user’s markets data from another entirely', async () => {
      const bob = await registerUser(app);
      const aliceList = (await alice.post('/watchlists', { name: 'Private' }).expect(201)).body;
      const aliceAlert = (await alice.post('/alerts', priceAlert({ name: 'Alice only' })).expect(201)).body;

      expect((await bob.get('/watchlists').expect(200)).body.watchlists).toEqual([]);
      expect((await bob.get('/alerts').expect(200)).body.alerts).toEqual([]);
      expect((await bob.get('/notifications').expect(200)).body.notifications).toEqual([]);
      expect((await bob.get('/market/quotes').expect(200)).body.quotes).toEqual([]);
      expect((await bob.get('/market/calendars/corporate-actions').expect(200)).body.actions).toEqual([]);

      // Another user's records are absent, never forbidden.
      await bob.get(`/watchlists/${aliceList.id}`).expect(404);
      await bob.patch(`/watchlists/${aliceList.id}`, { name: 'Mine now' }).expect(404);
      await bob.delete(`/watchlists/${aliceList.id}`).expect(404);
      await bob.get(`/alerts/${aliceAlert.id}`).expect(404);
      await bob.post(`/alerts/${aliceAlert.id}/test`).expect(404);
      await bob.delete(`/alerts/${aliceAlert.id}`).expect(404);

      // Bob evaluating his own alerts must not touch Alice's.
      await bob.post('/alerts/evaluate').expect(200);
      expect((await alice.get(`/alerts/${aliceAlert.id}`).expect(200)).body.lastEvaluatedAt).toBeNull();

      await alice.delete(`/alerts/${aliceAlert.id}`).expect(204);
    });

    it('needs authentication for everything', async () => {
      const server = app.getHttpServer();
      await request(server).get('/watchlists').expect(401);
      await request(server).get('/alerts').expect(401);
      await request(server).get('/notifications').expect(401);
      await request(server).get('/market/quotes').expect(401);
      await request(server).post('/alerts/evaluate').expect(401);
    });
  });

  describe('delivery', () => {
    it('sends no email while the alert only asks for the in-app channel', async () => {
      const carol = await registerUser(app);
      await carol.post('/market/quotes', { symbol: 'QUIET', price: '100', previousClose: null, asOf: TODAY }).expect(201);
      await carol
        .post('/alerts', priceAlert({ name: 'In-app only', params: { symbol: 'QUIET', exchange: null, direction: 'ABOVE', level: '1' }, channels: ['IN_APP'] }))
        .expect(201);
      await carol.post('/alerts/evaluate').expect(200);
      expect(mailbox(app).count(carol.email, /In-app only/)).toBe(0);
      expect((await carol.get('/notifications').expect(200)).body.unread).toBeGreaterThanOrEqual(1);
    });
  });
});
