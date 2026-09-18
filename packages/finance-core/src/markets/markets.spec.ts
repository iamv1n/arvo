import { InMemoryStore } from '../testing/in-memory-store';
import { MarketsService, inQuietHours } from './markets.service';
import { computeExpiries, lastWeekdayOfMonth, previousTradingDay, weekStart } from './expiries';
import { describeAlert, evaluateAlert, type AlertContext } from './alerts';
import type { AlertRecord } from './types';

/*
 * Fixtures, not a database. The engine is a pure function of a snapshot, so every case here is
 * "given these numbers, does it fire and does the evidence say why" — which is exactly the
 * question anyone asks of an alert six months after it fired.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const alert = (over: Partial<AlertRecord>): AlertRecord => ({
  id: 'alert-1',
  userId: USER,
  name: 'Test alert',
  kind: 'PRICE_LEVEL',
  params: { kind: 'PRICE_LEVEL', symbol: 'NIFTY', exchange: 'NSE', direction: 'ABOVE', level: '25000.0000' },
  isEnabled: true,
  cooldownMinutes: 1440,
  repeats: false,
  channels: ['IN_APP'],
  lastTriggeredAt: null,
  lastEvaluatedAt: null,
  lastStatus: null,
  lastMessage: null,
  triggerCount: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const context = (over: Partial<AlertContext> = {}): AlertContext => ({
  now: new Date('2026-09-15T10:00:00Z'),
  today: '2026-09-15',
  currency: 'INR',
  staleQuoteMinutes: 1440,
  quotes: new Map(),
  portfolio: null,
  holdings: new Map(),
  recurring: [],
  optionPositions: [],
  realisedByDay: new Map(),
  tradeCountByDay: new Map(),
  openExpiries: [],
  expiries: [],
  corporateActions: [],
  followed: new Set(),
  ...over,
});

describe('expiry calendar', () => {
  it('puts the monthly expiry on the last configured weekday of the month', () => {
    // September 2026: the last Tuesday is the 29th.
    expect(lastWeekdayOfMonth(2026, 9, 2)).toBe('2026-09-29');
    expect(lastWeekdayOfMonth(2026, 12, 4)).toBe('2026-12-31');
  });

  it('pulls an expiry back to the previous trading day when the exchange is shut', () => {
    expect(previousTradingDay('2026-09-29', new Set(['2026-09-29']))).toBe('2026-09-28');
    // A holiday on the Monday too walks all the way back to the Friday.
    expect(previousTradingDay('2026-09-29', new Set(['2026-09-29', '2026-09-28']))).toBe('2026-09-25');
    // A Sunday is never an expiry.
    expect(previousTradingDay('2026-09-27', new Set())).toBe('2026-09-25');
  });

  it('produces weekly and monthly expiries and marks the month-end one as monthly', () => {
    const events = computeExpiries({ from: '2026-09-01', to: '2026-09-30', indices: ['NIFTY'] });
    expect(events.map((e) => e.date)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
    expect(events.at(-1)).toMatchObject({ cadence: 'MONTHLY', index: 'NIFTY' });
    expect(events[0]).toMatchObject({ cadence: 'WEEKLY' });
  });

  it('records where a shifted expiry came from', () => {
    const [shifted] = computeExpiries({ from: '2026-09-29', to: '2026-09-29', indices: ['BANKNIFTY'], holidays: [] });
    expect(shifted).toMatchObject({ date: '2026-09-29', shiftedFrom: null });
    const moved = computeExpiries({ from: '2026-09-20', to: '2026-09-30', indices: ['BANKNIFTY'], holidays: ['2026-09-29'] });
    expect(moved).toEqual([{ index: 'BANKNIFTY', date: '2026-09-28', cadence: 'MONTHLY', shiftedFrom: '2026-09-29' }]);
  });

  it('respects a user override of the expiry weekday', () => {
    const events = computeExpiries({
      from: '2026-09-01',
      to: '2026-09-10',
      indices: ['NIFTY'],
      rules: [{ index: 'NIFTY', weekly: true, weekday: 4, monthly: false }],
    });
    expect(events.map((e) => e.date)).toEqual(['2026-09-03', '2026-09-10']);
  });

  it('starts the week on Monday', () => {
    expect(weekStart('2026-09-15')).toBe('2026-09-14');
    expect(weekStart('2026-09-14')).toBe('2026-09-14');
    expect(weekStart('2026-09-20')).toBe('2026-09-14');
  });
});

describe('alert engine', () => {
  it('fires a price alert when the level is crossed and explains itself', () => {
    const ctx = context({ quotes: new Map([['NIFTY', { symbol: 'NIFTY', price: '25100.0000', previousClose: '24900.0000', asOf: '2026-09-15', ageMinutes: 30 }]]) });
    const result = evaluateAlert(alert({}), ctx);
    expect(result.fired).toBe(true);
    expect(result.message).toContain('25100.0000');
    expect(result.evidence).toMatchObject({ symbol: 'NIFTY', level: '25000.0000', price: '25100.0000' });
  });

  it('does not fire below the level', () => {
    const ctx = context({ quotes: new Map([['NIFTY', { symbol: 'NIFTY', price: '24800.0000', previousClose: null, asOf: '2026-09-15', ageMinutes: 5 }]]) });
    expect(evaluateAlert(alert({}), ctx)).toMatchObject({ fired: false, status: 'OK' });
  });

  it('refuses to answer a market alert from stale data and records why', () => {
    const ctx = context({
      staleQuoteMinutes: 60,
      quotes: new Map([['NIFTY', { symbol: 'NIFTY', price: '25100.0000', previousClose: null, asOf: '2026-09-10', ageMinutes: 7200 }]]),
    });
    const result = evaluateAlert(alert({}), ctx);
    expect(result).toMatchObject({ fired: false, status: 'SKIPPED_STALE' });
    expect(result.message).toContain('stale');
    expect(result.evidence).toMatchObject({ ageMinutes: 7200, staleAfterMinutes: 60 });
  });

  it('stays quiet inside its cooldown', () => {
    const ctx = context({ quotes: new Map([['NIFTY', { symbol: 'NIFTY', price: '25100.0000', previousClose: null, asOf: '2026-09-15', ageMinutes: 1 }]]) });
    const cooling = alert({ lastTriggeredAt: new Date('2026-09-15T09:30:00Z'), cooldownMinutes: 120 });
    expect(evaluateAlert(cooling, ctx)).toMatchObject({ fired: false, status: 'COOLING_DOWN' });
    const elapsed = alert({ lastTriggeredAt: new Date('2026-09-15T07:30:00Z'), cooldownMinutes: 120 });
    expect(evaluateAlert(elapsed, ctx).fired).toBe(true);
  });

  it('measures portfolio drawdown against the high-water mark', () => {
    const params = { kind: 'PORTFOLIO_DRAWDOWN', percent: '10' } as const;
    const ctx = context({ portfolio: { value: '850000.0000', peak: '1000000.0000', peakOn: '2026-08-01', isStale: false } });
    const result = evaluateAlert(alert({ kind: 'PORTFOLIO_DRAWDOWN', params }), ctx);
    expect(result.fired).toBe(true);
    expect(result.evidence).toMatchObject({ drawdownPercent: '15.00', limitPercent: '10' });

    const shallow = context({ portfolio: { value: '950000.0000', peak: '1000000.0000', peakOn: '2026-08-01', isStale: false } });
    expect(evaluateAlert(alert({ kind: 'PORTFOLIO_DRAWDOWN', params }), shallow).fired).toBe(false);
  });

  it('skips a drawdown alert when the portfolio rests on stale prices', () => {
    const ctx = context({ portfolio: { value: '850000.0000', peak: '1000000.0000', peakOn: '2026-08-01', isStale: true } });
    expect(evaluateAlert(alert({ kind: 'PORTFOLIO_DRAWDOWN', params: { kind: 'PORTFOLIO_DRAWDOWN', percent: '10' } }), ctx)).toMatchObject({
      status: 'SKIPPED_STALE',
      fired: false,
    });
  });

  it('checks a holding against a percentage or an amount', () => {
    const holdings = new Map([
      ['h1', { id: 'h1', name: 'Infosys', value: '90000.0000', costBasis: '100000.0000', unrealisedGain: '-10000.0000', gainPercent: '-10.0000', isStale: false }],
    ]);
    const byPercent = evaluateAlert(
      alert({ kind: 'HOLDING_PNL', params: { kind: 'HOLDING_PNL', holdingId: 'h1', mode: 'PERCENT', direction: 'BELOW', value: '-8' } }),
      context({ holdings }),
    );
    expect(byPercent.fired).toBe(true);
    const byAmount = evaluateAlert(
      alert({ kind: 'HOLDING_PNL', params: { kind: 'HOLDING_PNL', holdingId: 'h1', mode: 'AMOUNT', direction: 'BELOW', value: '-25000' } }),
      context({ holdings }),
    );
    expect(byAmount.fired).toBe(false);
  });

  it('flags a recurring debit that has not been seen past its grace period', () => {
    const ctx = context({ recurring: [{ id: 'r1', label: 'Axis Bluechip SIP', expectedOn: '2026-09-05', lastSeenOn: '2026-08-05' }] });
    const result = evaluateAlert(alert({ kind: 'SIP_MISSED', params: { kind: 'SIP_MISSED', seriesId: null, label: null, graceDays: 5 } }), ctx);
    expect(result.fired).toBe(true);
    expect(result.message).toContain('Axis Bluechip SIP');

    const withinGrace = context({ recurring: [{ id: 'r1', label: 'SIP', expectedOn: '2026-09-13', lastSeenOn: '2026-08-13' }] });
    expect(evaluateAlert(alert({ kind: 'SIP_MISSED', params: { kind: 'SIP_MISSED', seriesId: null, label: null, graceDays: 5 } }), withinGrace).fired).toBe(false);
  });

  it('adds up realised losses over the chosen window', () => {
    const realised = new Map([
      ['2026-09-14', '-4000.0000'],
      ['2026-09-15', '-3000.0000'],
    ]);
    const params = { kind: 'REALISED_LOSS_LIMIT', window: 'WEEK', amount: '5000' } as const;
    expect(evaluateAlert(alert({ kind: 'REALISED_LOSS_LIMIT', params }), context({ realisedByDay: realised })).fired).toBe(true);
    const dayOnly = { kind: 'REALISED_LOSS_LIMIT', window: 'DAY', amount: '5000' } as const;
    expect(evaluateAlert(alert({ kind: 'REALISED_LOSS_LIMIT', params: dayOnly }), context({ realisedByDay: realised })).fired).toBe(false);
  });

  it('counts today’s trades only', () => {
    const counts = new Map([
      ['2026-09-15', 12],
      ['2026-09-14', 40],
    ]);
    expect(evaluateAlert(alert({ kind: 'TRADE_COUNT', params: { kind: 'TRADE_COUNT', count: 10 } }), context({ tradeCountByDay: counts })).fired).toBe(true);
    expect(evaluateAlert(alert({ kind: 'TRADE_COUNT', params: { kind: 'TRADE_COUNT', count: 15 } }), context({ tradeCountByDay: counts })).fired).toBe(false);
  });

  it('warns about an expiry inside the notice period but not beyond it', () => {
    const openExpiries = [{ underlying: 'NIFTY', expiry: '2026-09-17', label: 'NIFTY 25000 CE' }];
    expect(evaluateAlert(alert({ kind: 'EXPIRY_UPCOMING', params: { kind: 'EXPIRY_UPCOMING', daysBefore: 3 } }), context({ openExpiries })).fired).toBe(true);
    expect(evaluateAlert(alert({ kind: 'EXPIRY_UPCOMING', params: { kind: 'EXPIRY_UPCOMING', daysBefore: 1 } }), context({ openExpiries })).fired).toBe(false);
  });

  it('only reports corporate actions for instruments the user follows', () => {
    const actions = [
      {
        id: 'ca1',
        userId: USER,
        symbol: 'TCS',
        name: 'TCS',
        kind: 'DIVIDEND' as const,
        exDate: '2026-09-18',
        recordDate: null,
        payDate: null,
        amount: '10.0000',
        ratio: null,
        notes: null,
        source: 'MANUAL' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const params = { kind: 'CORPORATE_ACTION', daysBefore: 7 } as const;
    expect(evaluateAlert(alert({ kind: 'CORPORATE_ACTION', params }), context({ corporateActions: actions, followed: new Set(['TCS']) })).fired).toBe(true);
    expect(evaluateAlert(alert({ kind: 'CORPORATE_ACTION', params }), context({ corporateActions: actions, followed: new Set(['INFY']) })).fired).toBe(false);
  });

  it('describes a rule in plain language without ever telling the user what to do', () => {
    const sentence = describeAlert('NIFTY 25k', { kind: 'PRICE_LEVEL', symbol: 'NIFTY', exchange: 'NSE', direction: 'ABOVE', level: '25000' }, false);
    expect(sentence).toBe('Notify me once if NIFTY trades at or above 25000.');
    expect(sentence).not.toMatch(/buy|sell|should/i);
  });
});

describe('quiet hours', () => {
  const settings = { quietHoursStart: '22:00', quietHoursEnd: '07:00', timezone: 'UTC' };

  it('handles a window that wraps midnight', () => {
    expect(inQuietHours(settings, new Date('2026-09-15T23:30:00Z'))).toBe(true);
    expect(inQuietHours(settings, new Date('2026-09-15T03:00:00Z'))).toBe(true);
    expect(inQuietHours(settings, new Date('2026-09-15T12:00:00Z'))).toBe(false);
  });

  it('is off when either end is missing', () => {
    expect(inQuietHours({ ...settings, quietHoursStart: null }, new Date('2026-09-15T23:30:00Z'))).toBe(false);
  });
});

describe('markets service', () => {
  const service = () => new MarketsService(new InMemoryStore());

  it('keeps one user’s watchlists away from another', async () => {
    const store = new InMemoryStore();
    const markets = new MarketsService(store);
    const mine = await markets.createWatchlist(USER, { name: 'Core' });
    expect(await markets.listWatchlists(OTHER)).toEqual([]);
    await expect(markets.watchlistView(OTHER, mine.id, { asOf: '2026-09-15', currency: 'INR' })).rejects.toThrow(/does not exist/);
  });

  it('upper-cases symbols and rejects nonsense ones', async () => {
    const markets = service();
    const list = await markets.createWatchlist(USER, { name: 'Core' });
    const item = await markets.addItem(USER, list.id, { symbol: ' infy ', exchange: 'nse' });
    expect(item).toMatchObject({ symbol: 'INFY', exchange: 'NSE' });
    await expect(markets.addItem(USER, list.id, { symbol: '???' })).rejects.toThrow(/not a usable instrument symbol/);
  });

  it('computes the day change only when two closes are known', async () => {
    const markets = service();
    const list = await markets.createWatchlist(USER, { name: 'Core' });
    await markets.addItem(USER, list.id, { symbol: 'INFY' });
    await markets.setQuote(USER, { symbol: 'INFY', price: '1500', previousClose: '1450', asOf: '2026-09-15' });
    const view = await markets.watchlistView(USER, list.id, { asOf: '2026-09-15', currency: 'INR' });
    expect(view.rows[0]).toMatchObject({ price: '1500.00', dayChange: '50.00', dayChangePercent: '3.4482' });
    expect(view.driver).toBe('manual');
  });

  it('never calls out when no provider is configured', async () => {
    const markets = service();
    const list = await markets.createWatchlist(USER, { name: 'Core' });
    await markets.addItem(USER, list.id, { symbol: 'INFY' });
    const result = await markets.refreshQuotes(USER, { asOf: '2026-09-15' });
    expect(result).toMatchObject({ driver: 'manual', providerCalled: false });
    expect(result.skippedReason).toContain('No quote provider is configured');
  });

  it('keeps the last known price when the configured provider fails', async () => {
    const store = new InMemoryStore();
    const markets = new MarketsService(store, {
      quotes: {
        driver: 'http',
        quotes: async () => {
          throw new Error('upstream 503');
        },
      },
    });
    const list = await markets.createWatchlist(USER, { name: 'Core' });
    await markets.addItem(USER, list.id, { symbol: 'INFY' });
    await markets.setQuote(USER, { symbol: 'INFY', price: '1500', previousClose: null, asOf: '2026-09-15' });
    const result = await markets.refreshQuotes(USER, { asOf: '2026-09-15', force: true });
    expect(result.providerCalled).toBe(true);
    expect(result.skippedReason).toContain('last known prices');
    expect((await markets.listQuotes(USER))[0]).toMatchObject({ price: '1500.00' });
  });

  it('always keeps the in-app channel on an alert', async () => {
    const markets = service();
    const created = await markets.createAlert(USER, {
      name: 'NIFTY 25k',
      kind: 'PRICE_LEVEL',
      params: { kind: 'PRICE_LEVEL', symbol: 'nifty', exchange: null, direction: 'ABOVE', level: '25000' },
      isEnabled: true,
      cooldownMinutes: 60,
      repeats: false,
      channels: ['EMAIL'],
    });
    expect(created.channels).toEqual(['IN_APP', 'EMAIL']);
    expect(created.params).toMatchObject({ symbol: 'NIFTY', level: '25000.00' });
  });

  it('turns a one-shot alert off after it fires and writes the evidence', async () => {
    const store = new InMemoryStore();
    const markets = new MarketsService(store);
    const list = await markets.createWatchlist(USER, { name: 'Core' });
    await markets.addItem(USER, list.id, { symbol: 'NIFTY' });
    const now = new Date('2026-09-15T10:00:00Z');
    await markets.setQuote(USER, { symbol: 'NIFTY', price: '25100', previousClose: null, asOf: '2026-09-15' });
    const created = await markets.createAlert(USER, {
      name: 'NIFTY 25k',
      kind: 'PRICE_LEVEL',
      params: { kind: 'PRICE_LEVEL', symbol: 'NIFTY', exchange: null, direction: 'ABOVE', level: '25000' },
      isEnabled: true,
      cooldownMinutes: 60,
      repeats: false,
      channels: ['IN_APP'],
    });

    const first = await markets.runDueAlerts(now);
    expect(first).toMatchObject({ fired: 1 });
    // The second run over the same window changes nothing: the alert turned itself off.
    expect(await markets.runDueAlerts(now)).toMatchObject({ fired: 0 });

    const triggers = await markets.listTriggers(USER, created.id);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].evidence).toMatchObject({ price: '25100.00', kind: 'PRICE_LEVEL' });
    expect((await markets.listNotifications(USER))[0]).toMatchObject({ kind: 'ALERT', title: 'NIFTY 25k' });
    expect(await markets.unreadCount(USER)).toBe(1);
  });

  it('records a stale skip instead of firing', async () => {
    const store = new InMemoryStore();
    const markets = new MarketsService(store);
    await markets.saveSettings(USER, { staleQuoteMinutes: 5 });
    const list = await markets.createWatchlist(USER, { name: 'Core' });
    await markets.addItem(USER, list.id, { symbol: 'NIFTY' });
    await markets.setQuote(USER, { symbol: 'NIFTY', price: '25100', previousClose: null, asOf: '2026-09-15' });
    await markets.createAlert(USER, {
      name: 'NIFTY 25k',
      kind: 'PRICE_LEVEL',
      params: { kind: 'PRICE_LEVEL', symbol: 'NIFTY', exchange: null, direction: 'ABOVE', level: '25000' },
      isEnabled: true,
      cooldownMinutes: 60,
      repeats: true,
      channels: ['IN_APP'],
    });
    // A day after the quote was written, it is far past the five-minute staleness threshold.
    const results = await markets.evaluateUser(USER, new Date(Date.now() + 86_400_000));
    expect(results[0]).toMatchObject({ status: 'SKIPPED_STALE', fired: false });
    expect(await markets.listNotifications(USER)).toEqual([]);
  });

  it('reports cool-off only once per period and never blocks', async () => {
    const store = new InMemoryStore();
    const markets = new MarketsService(store);
    await store.tradingSettings.save(USER, { maxTradesPerDay: 5 });
    const idle = await markets.coolOff(USER, '2026-09-15');
    expect(idle.active).toBe(false);
    expect(idle.statuses.map((s) => s.kind)).toEqual(['MAX_TRADES_DAY']);
  });

  it('merges the three calendars into one dated list', async () => {
    const markets = service();
    await markets.createCorporateAction(USER, {
      symbol: 'TCS',
      name: 'TCS',
      kind: 'DIVIDEND',
      exDate: '2026-09-18',
      recordDate: null,
      payDate: null,
      amount: '10',
      ratio: null,
      notes: null,
    });
    await markets.createIpo(USER, {
      name: 'Acme Ltd',
      symbol: null,
      openDate: '2026-09-16',
      closeDate: '2026-09-19',
      priceBandLow: '100',
      priceBandHigh: '110',
      lotSize: 130,
      listingDate: null,
      status: 'UPCOMING',
      notes: null,
    });
    const events = await markets.upcomingEvents(USER, { from: '2026-09-15', to: '2026-09-20' });
    expect(events.map((e) => `${e.date} ${e.kind}`)).toEqual([
      '2026-09-15 EXPIRY',
      '2026-09-16 IPO',
      '2026-09-17 EXPIRY',
      '2026-09-18 CORPORATE_ACTION',
    ]);
  });
});
