import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import { formatMoney, parseMoney } from '../money';
import { brokerageFor, estimateCharges, gstOn, statutoryCharges } from './charges';
import { reconstructPositions, sessionsBetween } from './positions';
import { classifySegment, instrumentKey, parseTradingSymbol } from './symbols';
import { tradingMetrics } from './metrics';
import { behaviourReport } from './behaviour';
import { tradingTaxSummary, itr3Rows } from './tax';
import { realityCheck } from './reality-check';
import { DEFAULT_TRADING_SETTINGS, type TradeRecord, type TradingSettingsRecord } from './types';

const ASOF = '2026-09-19';
const SETTINGS: TradingSettingsRecord = { userId: USER_A, ...DEFAULT_TRADING_SETTINGS, updatedAt: new Date(0) };

/** A trade record with sensible defaults, for the pure functions that take records directly. */
let sequence = 0;
function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  sequence += 1;
  const quantity = overrides.quantity ?? '1';
  const price = overrides.price ?? '100';
  const base: TradeRecord = {
    id: `t${String(sequence).padStart(3, '0')}`,
    userId: USER_A,
    date: '2025-06-02',
    time: '09:30:00',
    broker: 'Zerodha',
    exchange: 'NSE',
    segment: 'EQUITY_INTRADAY',
    kind: 'TRADE',
    symbol: 'INFY',
    underlying: 'INFY',
    isin: null,
    expiry: null,
    strike: null,
    right: null,
    lotSize: 1,
    side: 'BUY',
    quantity,
    price,
    amount: formatMoney(BigInt(quantity) * parseMoney(price)),
    brokerage: '0',
    stt: '0',
    exchangeCharges: '0',
    sebiCharges: '0',
    stampDuty: '0',
    gst: '0',
    dpCharges: '0',
    otherCharges: '0',
    totalCharges: '0',
    chargesSource: 'ESTIMATED',
    orderId: null,
    tradeRef: null,
    notes: null,
    externalRef: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const merged = { ...base, ...overrides };
  return { ...merged, amount: overrides.amount ?? formatMoney(BigInt(merged.quantity) * parseMoney(merged.price)) };
}

/** Prices a list of trades the way the import pipeline does, so positions carry real charges. */
function priced(trades: TradeRecord[], settings: TradingSettingsRecord | null = SETTINGS): TradeRecord[] {
  const charges = estimateCharges(trades, settings);
  return trades.map((t) => {
    const c = charges.get(t.id)!;
    return {
      ...t,
      brokerage: c.brokerage,
      stt: c.stt,
      exchangeCharges: c.exchangeCharges,
      sebiCharges: c.sebiCharges,
      stampDuty: c.stampDuty,
      gst: c.gst,
      dpCharges: c.dpCharges,
      otherCharges: c.otherCharges,
      totalCharges: c.total,
      chargesSource: c.source,
    };
  });
}

describe('trading symbols', () => {
  it('reads a monthly option symbol into underlying, expiry, strike and right', () => {
    expect(parseTradingSymbol('NIFTY24SEP24500CE')).toEqual({
      underlying: 'NIFTY',
      expiry: '2024-09-26',
      strike: '24500.00',
      right: 'CE',
      recognised: true,
    });
  });

  it('reads a weekly option symbol, where the month is one character', () => {
    // 24 O 03 → 3 October 2024.
    expect(parseTradingSymbol('BANKNIFTY24O0352000PE')).toMatchObject({ underlying: 'BANKNIFTY', expiry: '2024-10-03', strike: '52000.00', right: 'PE' });
    expect(parseTradingSymbol('NIFTY2490524500CE')).toMatchObject({ underlying: 'NIFTY', expiry: '2024-09-05', right: 'CE' });
  });

  it('reads a futures symbol and leaves cash symbols alone', () => {
    expect(parseTradingSymbol('BANKNIFTY24SEPFUT')).toMatchObject({ underlying: 'BANKNIFTY', expiry: '2024-09-26', strike: null, right: null });
    expect(parseTradingSymbol('RELIANCE-EQ')).toMatchObject({ underlying: 'RELIANCE', expiry: null, recognised: false });
  });

  it('classifies segments from exchange and underlying', () => {
    expect(classifySegment({ exchange: 'NFO', underlying: 'NIFTY', right: 'CE', expiry: '2024-09-26' })).toBe('INDEX_OPTIONS');
    expect(classifySegment({ exchange: 'NFO', underlying: 'INFY', right: 'PE', expiry: '2024-09-26' })).toBe('EQUITY_OPTIONS');
    expect(classifySegment({ exchange: 'NFO', underlying: 'INFY', right: null, expiry: '2024-09-26' })).toBe('EQUITY_FUTURES');
    expect(classifySegment({ exchange: 'MCX', underlying: 'CRUDEOIL', right: null, expiry: '2024-09-19' })).toBe('COMMODITY_FUTURES');
    expect(classifySegment({ exchange: 'NSE', underlying: 'INFY', right: null, expiry: null })).toBe('EQUITY_DELIVERY');
    expect(classifySegment({ exchange: 'NSE', underlying: 'INFY', right: null, expiry: null, intraday: true })).toBe('EQUITY_INTRADAY');
  });

  it('gives the same contract the same key', () => {
    const a = { segment: 'INDEX_OPTIONS' as const, underlying: 'NIFTY', expiry: '2024-09-26', strike: '24500.00', right: 'CE' as const };
    expect(instrumentKey(a)).toBe(instrumentKey({ ...a }));
    expect(instrumentKey(a)).not.toBe(instrumentKey({ ...a, right: 'PE' }));
  });
});

describe('charges engine', () => {
  /*
   * The reference here is a Zerodha contract note for one intraday round trip on 100 shares
   * of a ₹1,000 stock, bought at 1,000 and sold at 1,010 after 1 October 2024. Their own
   * calculator puts the all-in cost at about ₹82.87; the difference is the NSE investor
   * protection fund levy, which is a few paise and is not modelled.
   */
  it('matches a real intraday contract note', () => {
    const trades = priced([
      trade({ id: 'b', side: 'BUY', quantity: '100', price: '1000', date: '2024-11-05' }),
      trade({ id: 's', side: 'SELL', quantity: '100', price: '1010', date: '2024-11-05' }),
    ]);
    const buy = trades[0];
    const sell = trades[1];

    expect(buy.brokerage).toBe('20.00');
    expect(sell.brokerage).toBe('20.00');
    expect(buy.stt).toBe('0.00');
    expect(sell.stt).toBe('25.25');
    expect(buy.exchangeCharges).toBe('2.97');
    expect(sell.exchangeCharges).toBe('3.00');
    expect(buy.stampDuty).toBe('3.00');
    expect(sell.stampDuty).toBe('0.00');
    expect(buy.gst).toBe('4.15');
    expect(sell.gst).toBe('4.16');

    const total = parseMoney(buy.totalCharges) + parseMoney(sell.totalCharges);
    expect(formatMoney(total)).toBe('82.73');
  });

  it('charges delivery on both legs, adds stamp duty on the buy and a DP charge on the sell', () => {
    const [buy, sell] = priced([
      trade({ id: 'b', segment: 'EQUITY_DELIVERY', side: 'BUY', quantity: '100', price: '1000', date: '2025-01-06' }),
      trade({ id: 's', segment: 'EQUITY_DELIVERY', side: 'SELL', quantity: '100', price: '1100', date: '2025-03-10' }),
    ]);
    expect(buy.brokerage).toBe('0.00');
    expect(buy.stt).toBe('100.00');
    expect(buy.stampDuty).toBe('15.00');
    expect(sell.stt).toBe('110.00');
    // ₹13 before GST, which is the ₹15.34 a contract note shows once 18% is added.
    expect(sell.dpCharges).toBe('13.00');
    expect(sell.gst).toBe('2.95');
  });

  it('applies the 1 October 2024 change to option STT and exchange charges', () => {
    const before = statutoryCharges({ date: '2024-09-30', segment: 'INDEX_OPTIONS', exchange: 'NFO', side: 'SELL', turnover: parseMoney('100000') });
    const after = statutoryCharges({ date: '2024-10-01', segment: 'INDEX_OPTIONS', exchange: 'NFO', side: 'SELL', turnover: parseMoney('100000') });
    expect(formatMoney(before.stt)).toBe('62.50');
    expect(formatMoney(after.stt)).toBe('100.00');
    expect(formatMoney(before.exchangeCharges)).toBe('50.00');
    expect(formatMoney(after.exchangeCharges)).toBe('35.03');
  });

  it('charges STT on the sell leg only for futures, and never for currency', () => {
    const futures = statutoryCharges({ date: '2025-06-02', segment: 'INDEX_FUTURES', exchange: 'NFO', side: 'BUY', turnover: parseMoney('1000000') });
    expect(formatMoney(futures.stt)).toBe('0.00');
    const sell = statutoryCharges({ date: '2025-06-02', segment: 'INDEX_FUTURES', exchange: 'NFO', side: 'SELL', turnover: parseMoney('1000000') });
    expect(formatMoney(sell.stt)).toBe('200.00');
    const currency = statutoryCharges({ date: '2025-06-02', segment: 'CURRENCY_FUTURES', exchange: 'CDS', side: 'SELL', turnover: parseMoney('1000000') });
    expect(formatMoney(currency.stt)).toBe('0.00');
  });

  it('charges CTT on commodity sells', () => {
    const mcx = statutoryCharges({ date: '2025-06-02', segment: 'COMMODITY_FUTURES', exchange: 'MCX', side: 'SELL', turnover: parseMoney('1000000') });
    expect(formatMoney(mcx.stt)).toBe('100.00');
    expect(formatMoney(mcx.exchangeCharges)).toBe('21.00');
  });

  it('caps brokerage per order, not per fill', () => {
    // Three fills of one order, each big enough to hit the cap on its own.
    const trades = priced([
      trade({ id: 'f1', orderId: 'O1', side: 'BUY', quantity: '100', price: '1000' }),
      trade({ id: 'f2', orderId: 'O1', side: 'BUY', quantity: '100', price: '1000' }),
      trade({ id: 'f3', orderId: 'O1', side: 'BUY', quantity: '100', price: '1000' }),
    ]);
    const brokerage = trades.reduce((sum, t) => sum + parseMoney(t.brokerage), 0n);
    expect(formatMoney(brokerage)).toBe('20.00');
    // Without an order id each fill is its own order.
    const separate = priced([
      trade({ id: 'g1', side: 'BUY', quantity: '100', price: '1000' }),
      trade({ id: 'g2', side: 'BUY', quantity: '100', price: '1000' }),
    ]);
    expect(formatMoney(separate.reduce((sum, t) => sum + parseMoney(t.brokerage), 0n))).toBe('40.00');
  });

  it('charges a flat fee on options and a capped percentage elsewhere', () => {
    expect(formatMoney(brokerageFor(parseMoney('500000'), { percent: '0', cap: null, flat: '20' }))).toBe('20.00');
    expect(formatMoney(brokerageFor(parseMoney('10000'), { percent: '0.03', cap: '20', flat: '0' }))).toBe('3.00');
    expect(formatMoney(brokerageFor(parseMoney('1000000'), { percent: '0.03', cap: '20', flat: '0' }))).toBe('20.00');
  });

  it('adds GST at 18% on brokerage, exchange charges, the SEBI fee and DP charges', () => {
    expect(formatMoney(gstOn(parseMoney('20'), parseMoney('3'), parseMoney('0.10'), parseMoney('13')))).toBe('6.50');
  });

  it('charges one DP fee per scrip per day however many sells there were', () => {
    const trades = priced([
      trade({ id: 'd1', segment: 'EQUITY_DELIVERY', side: 'SELL', quantity: '10', price: '1000' }),
      trade({ id: 'd2', segment: 'EQUITY_DELIVERY', side: 'SELL', quantity: '10', price: '1000' }),
    ]);
    expect(formatMoney(trades.reduce((sum, t) => sum + parseMoney(t.dpCharges), 0n))).toBe('13.00');
  });
});

describe('position reconstruction', () => {
  it('matches a simple round trip and nets the charges off the gross', () => {
    const trades = priced([
      trade({ id: 'b', side: 'BUY', quantity: '100', price: '1000', date: '2024-11-05' }),
      trade({ id: 's', side: 'SELL', quantity: '100', price: '1010', date: '2024-11-05', time: '14:30:00' }),
    ]);
    const { closed } = reconstructPositions({ trades, asOf: ASOF });
    expect(closed).toHaveLength(1);
    const position = closed[0];
    expect(position.id).toBe('b');
    expect(position.direction).toBe('LONG');
    expect(position.grossPnl).toBe('1000.00');
    expect(position.charges.total).toBe('82.73');
    expect(position.netPnl).toBe('917.27');
    expect(position.chargesPercentOfGross).toBe(8.27);
    expect(position.style).toBe('INTRADAY');
    expect(position.holdingMinutes).toBe(300);
  });

  it('handles a partial exit, leaving the rest open', () => {
    const trades = priced([
      trade({ id: 'b', side: 'BUY', quantity: '100', price: '100' }),
      trade({ id: 's', side: 'SELL', quantity: '40', price: '110', date: '2025-06-03' }),
    ]);
    const { positions } = reconstructPositions({ trades, asOf: ASOF });
    expect(positions).toHaveLength(1);
    expect(positions[0].status).toBe('OPEN');
    expect(positions[0].openQuantity).toBe('60');
    expect(positions[0].grossPnl).toBe('400.00');
  });

  it('matches pyramided entries first in, first out', () => {
    const trades = priced([
      trade({ id: 'b1', side: 'BUY', quantity: '100', price: '100', date: '2025-06-02' }),
      trade({ id: 'b2', side: 'BUY', quantity: '100', price: '120', date: '2025-06-03' }),
      trade({ id: 's', side: 'SELL', quantity: '150', price: '130', date: '2025-06-04' }),
    ]);
    const { positions } = reconstructPositions({ trades, asOf: ASOF });
    expect(positions[0].entries).toHaveLength(2);
    // 100 @100 and 50 @120 closed at 130 → 3,000 + 500.
    expect(positions[0].grossPnl).toBe('3500.00');
    expect(positions[0].openQuantity).toBe('50');
  });

  it('closes a position and opens the reverse when a sell overshoots', () => {
    const trades = priced([
      trade({ id: 'b', side: 'BUY', quantity: '100', price: '100', date: '2025-06-02' }),
      trade({ id: 's', side: 'SELL', quantity: '150', price: '110', date: '2025-06-02', time: '11:00:00' }),
    ]);
    const { positions } = reconstructPositions({ trades, asOf: ASOF });
    expect(positions).toHaveLength(2);
    const long = positions.find((p) => p.id === 'b')!;
    const short = positions.find((p) => p.id === 's')!;
    expect(long.status).toBe('CLOSED');
    expect(long.grossPnl).toBe('1000.00');
    expect(short.direction).toBe('SHORT');
    expect(short.openQuantity).toBe('50');
    expect(short.warnings[0]).toContain('reversed');
  });

  it('computes a short round trip the right way up', () => {
    const trades = priced([
      trade({ id: 's', side: 'SELL', quantity: '50', price: '200', date: '2025-06-02' }),
      trade({ id: 'b', side: 'BUY', quantity: '50', price: '190', date: '2025-06-02', time: '12:00:00' }),
    ]);
    const { closed } = reconstructPositions({ trades, asOf: ASOF });
    expect(closed[0].direction).toBe('SHORT');
    expect(closed[0].grossPnl).toBe('500.00');
  });

  it('settles an option left open past expiry as worthless, and says it is an estimate', () => {
    const trades = priced([
      trade({
        id: 'o',
        segment: 'INDEX_OPTIONS',
        exchange: 'NFO',
        symbol: 'NIFTY24SEP24500CE',
        underlying: 'NIFTY',
        expiry: '2024-09-26',
        strike: '24500.00',
        right: 'CE',
        lotSize: 25,
        side: 'BUY',
        quantity: '25',
        price: '80',
        date: '2024-09-24',
      }),
    ]);
    const { closed } = reconstructPositions({ trades, asOf: ASOF });
    expect(closed).toHaveLength(1);
    expect(closed[0].settledAtExpiry).toBe(true);
    expect(closed[0].exits[0].kind).toBe('EXPIRY');
    expect(closed[0].grossPnl).toBe('-2000.00');
    expect(closed[0].warnings[0]).toContain('worthless');
  });

  it('exercises an option when a settlement price is supplied', () => {
    const contract = {
      segment: 'INDEX_OPTIONS' as const,
      exchange: 'NFO' as const,
      symbol: 'NIFTY24SEP24500CE',
      underlying: 'NIFTY',
      expiry: '2024-09-26',
      strike: '24500.00',
      right: 'CE' as const,
      lotSize: 25,
    };
    const trades = priced([trade({ id: 'o', ...contract, side: 'BUY', quantity: '25', price: '80', date: '2024-09-24' })]);
    const settlementPrices = new Map([[instrumentKey({ ...contract }), '150']]);
    const { closed } = reconstructPositions({ trades, asOf: ASOF, settlementPrices });
    expect(closed[0].exits[0].kind).toBe('EXERCISE');
    expect(closed[0].grossPnl).toBe('1750.00');
  });

  it('links a futures rollover to the contract it replaced', () => {
    const near = { segment: 'INDEX_FUTURES' as const, exchange: 'NFO' as const, underlying: 'NIFTY', expiry: '2025-06-26', lotSize: 25 };
    const far = { ...near, expiry: '2025-07-31' };
    const trades = priced([
      trade({ id: 'n1', ...near, symbol: 'NIFTY25JUNFUT', side: 'BUY', quantity: '25', price: '24000', date: '2025-06-02' }),
      trade({ id: 'n2', ...near, symbol: 'NIFTY25JUNFUT', side: 'SELL', quantity: '25', price: '24200', date: '2025-06-25' }),
      trade({ id: 'f1', ...far, symbol: 'NIFTY25JULFUT', side: 'BUY', quantity: '25', price: '24250', date: '2025-06-25' }),
    ]);
    const { positions } = reconstructPositions({ trades, asOf: ASOF });
    const nearPosition = positions.find((p) => p.id === 'n1')!;
    const farPosition = positions.find((p) => p.id === 'f1')!;
    expect(nearPosition.rolledTo).toBe('f1');
    expect(farPosition.rolledFrom).toBe('n1');
  });

  it('classifies holding style by sessions, skipping weekends', () => {
    expect(sessionsBetween('2025-06-02', '2025-06-02')).toBe(1);
    expect(sessionsBetween('2025-06-02', '2025-06-03')).toBe(2);
    // Friday to Monday is two sessions, not four days.
    expect(sessionsBetween('2025-06-06', '2025-06-09')).toBe(2);
    const style = (from: string, to: string) =>
      reconstructPositions({
        trades: priced([
          trade({ id: `x${from}`, side: 'BUY', quantity: '10', price: '100', date: from }),
          trade({ id: `y${to}`, side: 'SELL', quantity: '10', price: '110', date: to }),
        ]),
        asOf: ASOF,
      }).closed[0].style;
    expect(style('2025-06-02', '2025-06-02')).toBe('INTRADAY');
    expect(style('2025-06-02', '2025-06-03')).toBe('BTST');
    expect(style('2025-06-02', '2025-06-06')).toBe('SWING');
    expect(style('2025-06-02', '2025-07-02')).toBe('POSITIONAL');
  });

  it('keeps two contracts on one underlying apart', () => {
    const trades = priced([
      trade({ id: 'c', segment: 'INDEX_OPTIONS', exchange: 'NFO', underlying: 'NIFTY', symbol: 'NIFTY25JUN24500CE', expiry: '2025-06-26', strike: '24500.00', right: 'CE', side: 'BUY', quantity: '25', price: '100' }),
      trade({ id: 'p', segment: 'INDEX_OPTIONS', exchange: 'NFO', underlying: 'NIFTY', symbol: 'NIFTY25JUN24500PE', expiry: '2025-06-26', strike: '24500.00', right: 'PE', side: 'SELL', quantity: '25', price: '90' }),
    ]);
    const { positions } = reconstructPositions({ trades, asOf: '2025-06-10' });
    expect(positions).toHaveLength(2);
  });
});

describe('metrics', () => {
  /** Four closed round trips: +1,000, −500, +2,000, −1,500 before charges. */
  function sample() {
    const legs: TradeRecord[] = [];
    const results: [string, string, string, string][] = [
      ['2025-06-02', '100', '110', 'a'],
      ['2025-06-03', '100', '95', 'b'],
      ['2025-06-04', '100', '120', 'c'],
      ['2025-06-05', '100', '85', 'd'],
    ];
    for (const [date, buy, sell, tag] of results) {
      legs.push(trade({ id: `${tag}1`, side: 'BUY', quantity: '100', price: buy, date, time: '09:30:00' }));
      legs.push(trade({ id: `${tag}2`, side: 'SELL', quantity: '100', price: sell, date, time: '14:30:00' }));
    }
    return reconstructPositions({ trades: priced(legs), asOf: ASOF }).positions;
  }

  it('counts wins and losses and builds the derived ratios', () => {
    const metrics = tradingMetrics({ positions: sample(), asOf: ASOF });
    expect(metrics.closedTrades).toBe(4);
    expect(metrics.wins).toBe(2);
    expect(metrics.losses).toBe(2);
    expect(metrics.winRate).toBe(50);
    expect(parseMoney(metrics.grossPnl)).toBe(parseMoney('1000') - parseMoney('500') + parseMoney('2000') - parseMoney('1500'));
    expect(Number(metrics.profitFactor)).toBeGreaterThan(1);
    expect(parseMoney(metrics.expectancy)).toBe(parseMoney(metrics.netPnl) / 4n);
  });

  it('measures drawdown on the realised equity curve', () => {
    const metrics = tradingMetrics({ positions: sample(), asOf: ASOF });
    expect(metrics.equityCurve).toHaveLength(4);
    // Peak after the third trade, then a losing day.
    expect(parseMoney(metrics.maxDrawdown)).toBeLessThan(0n);
    expect(metrics.maxDrawdownPercent).not.toBeNull();
    expect(metrics.longestLosingStreak).toBe(1);
  });

  it('counts a losing streak across consecutive losses', () => {
    const legs: TradeRecord[] = [];
    for (const [i, date] of ['2025-06-02', '2025-06-03', '2025-06-04'].entries()) {
      legs.push(trade({ id: `l${i}a`, side: 'BUY', quantity: '100', price: '100', date }));
      legs.push(trade({ id: `l${i}b`, side: 'SELL', quantity: '100', price: '95', date, time: '15:00:00' }));
    }
    const positions = reconstructPositions({ trades: priced(legs), asOf: ASOF }).positions;
    expect(tradingMetrics({ positions, asOf: ASOF }).longestLosingStreak).toBe(3);
  });

  it('computes R-multiples only where a stop was recorded', () => {
    const positions = sample();
    const journal = new Map([
      [
        positions.find((p) => p.id === 'a1')!.id,
        {
          id: 'j1',
          userId: USER_A,
          positionId: 'a1',
          notes: null,
          setupTags: ['Breakout'],
          emotionTags: [],
          mistakes: [],
          stopPrice: '95',
          targetPrice: null,
          screenshots: [],
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
    ]);
    const metrics = tradingMetrics({ positions, journal, asOf: ASOF });
    expect(metrics.rMultiples).toHaveLength(1);
    // Risked ₹5 × 100 = ₹500 to make just under ₹1,000 net.
    expect(metrics.rMultiples[0].r).toBeGreaterThan(1.5);
    expect(metrics.bySetup.some((row) => row.key === 'Breakout')).toBe(true);
  });

  it('breaks results down by time of day, weekday and segment', () => {
    const metrics = tradingMetrics({ positions: sample(), asOf: ASOF });
    expect(metrics.byTimeOfDay[0].key).toBe('09');
    expect(metrics.byWeekday.map((row) => row.label)).toContain('Monday');
    expect(metrics.bySegment[0].label).toBe('Equity intraday');
    expect(metrics.holdingTime.find((row) => row.style === 'INTRADAY')!.trades).toBe(4);
  });
});

describe('behaviour analytics', () => {
  it('flags a new position opened soon after a loss', () => {
    const trades = priced([
      trade({ id: 'x1', side: 'BUY', quantity: '100', price: '100', date: '2025-06-02', time: '09:30:00' }),
      trade({ id: 'x2', side: 'SELL', quantity: '100', price: '95', date: '2025-06-02', time: '10:00:00' }),
      trade({ id: 'y1', symbol: 'TCS', underlying: 'TCS', side: 'BUY', quantity: '100', price: '100', date: '2025-06-02', time: '10:05:00' }),
      trade({ id: 'y2', symbol: 'TCS', underlying: 'TCS', side: 'SELL', quantity: '100', price: '105', date: '2025-06-02', time: '11:00:00' }),
    ]);
    const positions = reconstructPositions({ trades, asOf: ASOF }).positions;
    const report = behaviourReport({ trades, positions, settings: SETTINGS, asOf: ASOF });
    const revenge = report.flags.filter((f) => f.kind === 'REVENGE_TRADE');
    expect(revenge).toHaveLength(1);
    expect(revenge[0].positionIds).toContain('y1');
    expect(revenge[0].explanation).toContain('5 minutes later');
  });

  it('flags adding to a long below its average price', () => {
    const trades = priced([
      trade({ id: 'a1', side: 'BUY', quantity: '100', price: '100', date: '2025-06-02' }),
      trade({ id: 'a2', side: 'BUY', quantity: '100', price: '90', date: '2025-06-03' }),
      trade({ id: 'a3', side: 'BUY', quantity: '100', price: '80', date: '2025-06-04' }),
    ]);
    const positions = reconstructPositions({ trades, asOf: ASOF }).positions;
    const report = behaviourReport({ trades, positions, settings: SETTINGS, asOf: ASOF });
    const flag = report.flags.find((f) => f.kind === 'AVERAGING_DOWN')!;
    expect(flag.count).toBe(2);
    expect(flag.tradeIds).toEqual(['a2', 'a3']);
  });

  it('reports the share of derivative activity on expiry day', () => {
    const legs: TradeRecord[] = [];
    for (let i = 0; i < 12; i += 1) {
      legs.push(
        trade({
          id: `e${i}`,
          segment: 'INDEX_OPTIONS',
          exchange: 'NFO',
          underlying: 'NIFTY',
          symbol: 'NIFTY25JUN24500CE',
          expiry: '2025-06-26',
          strike: '24500.00',
          right: 'CE',
          side: i % 2 === 0 ? 'BUY' : 'SELL',
          quantity: '25',
          price: '100',
          date: i < 8 ? '2025-06-26' : '2025-06-20',
        }),
      );
    }
    const trades = priced(legs);
    const positions = reconstructPositions({ trades, asOf: ASOF }).positions;
    const report = behaviourReport({ trades, positions, settings: SETTINGS, asOf: ASOF });
    expect(report.expiryDayRatio).toBeCloseTo(66.67, 1);
    expect(report.flags.some((f) => f.kind === 'EXPIRY_DAY_CONCENTRATION')).toBe(true);
  });

  it('says which thresholds produced the flags', () => {
    const report = behaviourReport({ trades: [], positions: [], settings: SETTINGS, asOf: ASOF });
    expect(report.rules.revengeWindowMinutes).toBe(15);
    expect(report.flags).toHaveLength(0);
  });
});

describe('tax', () => {
  function mixed() {
    const legs = priced([
      // Intraday equity: speculative, +1,000 gross.
      trade({ id: 'i1', side: 'BUY', quantity: '100', price: '100', date: '2025-06-02' }),
      trade({ id: 'i2', side: 'SELL', quantity: '100', price: '110', date: '2025-06-02', time: '14:00:00' }),
      // Index options: non-speculative, −2,500 gross.
      trade({ id: 'o1', segment: 'INDEX_OPTIONS', exchange: 'NFO', underlying: 'NIFTY', symbol: 'NIFTY25JUN24500CE', expiry: '2025-06-26', strike: '24500.00', right: 'CE', side: 'BUY', quantity: '25', price: '200', date: '2025-06-10' }),
      trade({ id: 'o2', segment: 'INDEX_OPTIONS', exchange: 'NFO', underlying: 'NIFTY', symbol: 'NIFTY25JUN24500CE', expiry: '2025-06-26', strike: '24500.00', right: 'CE', side: 'SELL', quantity: '25', price: '100', date: '2025-06-11' }),
      // Delivery: capital gains, +5,000 gross, held under a year.
      trade({ id: 'd1', segment: 'EQUITY_DELIVERY', symbol: 'TCS', underlying: 'TCS', side: 'BUY', quantity: '50', price: '3000', date: '2025-05-02' }),
      trade({ id: 'd2', segment: 'EQUITY_DELIVERY', symbol: 'TCS', underlying: 'TCS', side: 'SELL', quantity: '50', price: '3100', date: '2025-08-02' }),
    ]);
    return { trades: legs, positions: reconstructPositions({ trades: legs, asOf: ASOF }).positions };
  }

  it('splits the year into speculative, non-speculative and capital gains', () => {
    const { trades, positions } = mixed();
    const summary = tradingTaxSummary({ trades, positions, financialYear: '2025-26' });
    expect(summary.from).toBe('2025-04-01');
    expect(summary.to).toBe('2026-03-31');
    expect(summary.speculative.trades).toBe(1);
    expect(summary.nonSpeculative.trades).toBe(1);
    expect(parseMoney(summary.speculative.netPnl)).toBeGreaterThan(0n);
    expect(parseMoney(summary.nonSpeculative.netPnl)).toBeLessThan(0n);
    expect(summary.capitalGains.buckets.find((b) => b.term === 'SHORT')!.trades).toBe(1);
    expect(summary.capitalGains.buckets.find((b) => b.term === 'LONG')!.trades).toBe(0);
  });

  it('computes turnover by the absolute-profit method', () => {
    const { trades, positions } = mixed();
    const summary = tradingTaxSummary({ trades, positions, financialYear: '2025-26' });
    const speculative = positions.find((p) => p.segment === 'EQUITY_INTRADAY')!;
    const derivative = positions.find((p) => p.segment === 'INDEX_OPTIONS')!;
    expect(summary.speculative.turnover).toBe(speculative.netPnl);
    expect(parseMoney(summary.nonSpeculative.turnover)).toBe(-parseMoney(derivative.netPnl));
    // Premium received on the option sale is reported, not folded into turnover.
    expect(summary.optionSellPremium).toBe('2500.00');
    expect(summary.audit.aboveThreshold).toBe(false);
    expect(summary.audit.presumptiveAvailable).toBe(true);
  });

  it('exports ITR-3 helper rows covering both schedules', () => {
    const { trades, positions } = mixed();
    const rows = itr3Rows(tradingTaxSummary({ trades, positions, financialYear: '2025-26' }));
    expect(rows.some((row) => row.section === 'Schedule BP' && row.item.includes('Speculative'))).toBe(true);
    expect(rows.some((row) => row.section === 'Schedule CG')).toBe(true);
    expect(rows.some((row) => row.section === 'Audit')).toBe(true);
  });

  it('keeps charges on delivery trades out of the business deduction', () => {
    const { trades, positions } = mixed();
    const summary = tradingTaxSummary({ trades, positions, financialYear: '2025-26' });
    expect(parseMoney(summary.chargesSummary.deductibleAgainstBusiness)).toBeLessThan(parseMoney(summary.chargesSummary.total));
  });
});

describe('reality check', () => {
  it('compares the year against an assumed index return and an FD', () => {
    const trades = priced([
      trade({ id: 'r1', side: 'BUY', quantity: '1000', price: '100', date: '2025-06-02' }),
      trade({ id: 'r2', side: 'SELL', quantity: '1000', price: '102', date: '2025-06-02', time: '15:00:00' }),
    ]);
    const positions = reconstructPositions({ trades, asOf: ASOF }).positions;
    const check = realityCheck({ positions, assumedIndexReturnPercent: '12', assumedFdRatePercent: '7', asOf: ASOF });
    expect(check.years).toHaveLength(1);
    const year = check.years[0];
    expect(year.financialYear).toBe('2025-26');
    expect(year.capitalProxy).toBe('100000.00');
    expect(year.index.source).toBe('ASSUMED');
    expect(year.index.value).toBe('12000.00');
    expect(year.fd.value).toBe('7000.00');
    expect(parseMoney(year.differenceVsIndex)).toBeLessThan(0n);
  });

  it('uses an imported benchmark series when one is available', () => {
    const trades = priced([
      trade({ id: 's1', side: 'BUY', quantity: '1000', price: '100', date: '2025-06-02' }),
      trade({ id: 's2', side: 'SELL', quantity: '1000', price: '102', date: '2025-06-02', time: '15:00:00' }),
    ]);
    const positions = reconstructPositions({ trades, asOf: ASOF }).positions;
    const check = realityCheck({
      positions,
      benchmark: {
        series: 'NIFTY 50 TRI',
        points: [
          { userId: USER_A, series: 'NIFTY 50 TRI', date: '2025-04-01', value: '10000' },
          { userId: USER_A, series: 'NIFTY 50 TRI', date: '2026-03-31', value: '11000' },
        ],
      },
      assumedIndexReturnPercent: '12',
      assumedFdRatePercent: '7',
      asOf: ASOF,
    });
    expect(check.years[0].index.source).toBe('SERIES');
    expect(check.years[0].index.returnPercent).toBe(10);
    expect(check.years[0].index.value).toBe('10000.00');
  });
});

describe('trading service', () => {
  it('derives everything it can from a manual trade and prices its charges', async () => {
    const { core } = setup();
    const created = await core.trading.createTrade(USER_A, {
      date: '2025-06-02',
      time: '09:20',
      symbol: 'nifty25jun24500ce',
      side: 'BUY',
      quantity: '75',
      price: '120',
      lotSize: 25,
    });
    expect(created.symbol).toBe('NIFTY25JUN24500CE');
    expect(created.underlying).toBe('NIFTY');
    expect(created.segment).toBe('INDEX_OPTIONS');
    expect(created.exchange).toBe('NFO');
    expect(created.right).toBe('CE');
    expect(created.strike).toBe('24500.00');
    expect(created.time).toBe('09:20:00');
    expect(created.amount).toBe('9000.00');
    expect(created.brokerage).toBe('20.00');
    expect(parseMoney(created.totalCharges)).toBeGreaterThan(0n);
  });

  it('refuses a fractional quantity and an unreadable time', async () => {
    const { core } = setup();
    const base = { date: '2025-06-02', symbol: 'INFY', side: 'BUY' as const, price: '100' };
    await expectDomainError(core.trading.createTrade(USER_A, { ...base, quantity: '10.5' }), 'INVALID_QUANTITY');
    await expectDomainError(core.trading.createTrade(USER_A, { ...base, quantity: '10', time: '25:00' }), 'INVALID_TIME');
  });

  it('keeps one user\u2019s trades out of another\u2019s reports', async () => {
    const { core } = setup();
    for (const [user, symbol] of [
      [USER_A, 'INFY'],
      [USER_B, 'TCS'],
    ] as const) {
      await core.trading.createTrade(user, { date: '2025-06-02', time: '09:30', symbol, side: 'BUY', quantity: '10', price: '100', segment: 'EQUITY_INTRADAY' });
      await core.trading.createTrade(user, { date: '2025-06-02', time: '15:00', symbol, side: 'SELL', quantity: '10', price: '110', segment: 'EQUITY_INTRADAY' });
    }
    const mine = await core.trading.positions(USER_A, ASOF);
    expect(mine.positions).toHaveLength(1);
    expect(mine.positions[0].symbol).toBe('INFY');
    const theirs = await core.trading.positions(USER_B, ASOF);
    expect(theirs.positions[0].symbol).toBe('TCS');
    await expectDomainError(core.trading.position(USER_B, ASOF, mine.positions[0].id), 'POSITION_NOT_FOUND');
  });

  it('stores journal notes and tags against the round trip', async () => {
    const { core } = setup();
    const open = await core.trading.createTrade(USER_A, { date: '2025-06-02', time: '09:30', symbol: 'INFY', side: 'BUY', quantity: '10', price: '100', segment: 'EQUITY_INTRADAY' });
    await core.trading.createTrade(USER_A, { date: '2025-06-02', time: '15:00', symbol: 'INFY', side: 'SELL', quantity: '10', price: '110', segment: 'EQUITY_INTRADAY' });
    const entry = await core.trading.saveJournal(USER_A, open.id, {
      notes: 'Broke out of the morning range and held it.',
      setupTags: ['Breakout', 'Breakout'],
      emotionTags: ['Calm'],
      mistakes: ['Entered late, chasing'],
      stopPrice: '98',
    });
    expect(entry.setupTags).toEqual(['Breakout']);
    expect(entry.stopPrice).toBe('98.00');
    const metrics = await core.trading.metrics(USER_A, ASOF);
    expect(metrics.rMultiples).toHaveLength(1);
    expect(metrics.bySetup.map((row) => row.key)).toContain('Breakout');
    await expectDomainError(core.trading.saveJournal(USER_B, open.id, { notes: 'not mine' }), 'TRADE_NOT_FOUND');
  });

  it('falls back to default settings and saves an override', async () => {
    const { core } = setup();
    expect((await core.trading.settings(USER_A)).revengeWindowMinutes).toBe(15);
    await core.trading.saveSettings(USER_A, { revengeWindowMinutes: 30 });
    expect((await core.trading.settings(USER_A)).revengeWindowMinutes).toBe(30);
    await expectDomainError(core.trading.saveSettings(USER_A, { revengeWindowMinutes: 0 }), 'INVALID_WINDOW');
  });

  it('lists the financial years with closed trades', async () => {
    const { core } = setup();
    await core.trading.createTrade(USER_A, { date: '2025-06-02', time: '09:30', symbol: 'INFY', side: 'BUY', quantity: '10', price: '100', segment: 'EQUITY_INTRADAY' });
    await core.trading.createTrade(USER_A, { date: '2025-06-02', time: '15:00', symbol: 'INFY', side: 'SELL', quantity: '10', price: '110', segment: 'EQUITY_INTRADAY' });
    expect(await core.trading.financialYears(USER_A, ASOF)).toEqual(['2025-26']);
  });
});
