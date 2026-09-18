import type { Bar } from './bars';
import { runBacktest } from './backtest';
import { atr, bollinger, ema, macd, openingRange, previousSessionLevels, rsi, sma, supertrend, trueRange, vwap } from './indicators';
import { countParameters, validateSpec, type Condition, type StrategySpec } from './strategy-spec';

/*
 * Fixtures are generated, not sampled, so every expected number can be worked out by hand.
 * A session is one bar unless the test says otherwise.
 */

const SESSION_DATES = (count: number, start = '2024-01-01'): string[] => {
  const dates: string[] = [];
  const day = new Date(`${start}T00:00:00Z`);
  while (dates.length < count) {
    // Weekdays only, so the series looks like a trading calendar.
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
};

/** Daily bars from a list of closes; each bar's range is the close plus or minus one. */
const dailyBars = (closes: number[]): Bar[] => {
  const dates = SESSION_DATES(closes.length);
  return closes.map((close, i) => ({
    date: dates[i],
    time: null,
    open: i === 0 ? close : closes[i - 1],
    high: Math.max(close, i === 0 ? close : closes[i - 1]) + 1,
    low: Math.min(close, i === 0 ? close : closes[i - 1]) - 1,
    close,
    volume: 1000 + i,
  }));
};

const rising = (count: number, from = 100, step = 1): number[] => Array.from({ length: count }, (_, i) => from + i * step);

const price = (field: 'OPEN' | 'HIGH' | 'LOW' | 'CLOSE'): Condition['type'] extends never ? never : { type: 'PRICE'; field: typeof field } => ({
  type: 'PRICE',
  field,
});

const spec = (over: Partial<StrategySpec> = {}): StrategySpec => ({
  name: 'Test',
  symbol: 'TESTCO',
  timeframe: 'DAY',
  direction: 'LONG',
  startingCapital: '1000000',
  entry: { type: 'COMPARE', left: price('CLOSE'), op: 'GT', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 5 } } },
  exit: { type: 'COMPARE', left: price('CLOSE'), op: 'CROSSES_BELOW', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 5 } } },
  stopLoss: null,
  target: null,
  trailingStop: null,
  maxBarsInTrade: null,
  intradaySquareOffTime: null,
  maxPositions: 1,
  sizing: { method: 'FIXED_QUANTITY', quantity: 100, lotSize: 1 },
  execution: { fill: 'NEXT_BAR_OPEN', slippageType: 'BPS', slippage: 0, segment: 'EQUITY_DELIVERY', exchange: 'NSE', broker: 'estimate' },
  ...over,
});

describe('indicators', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('computes a simple moving average and leaves the warm-up null', () => {
    const result = sma(values, 3);
    expect(result.slice(0, 2)).toEqual([null, null]);
    expect(result[2]).toBe(2);
    expect(result[9]).toBe(9);
  });

  it('seeds the EMA with a simple average and then smooths', () => {
    const result = ema(values, 3);
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2);
    // k = 0.5: next value is 4 x 0.5 + 2 x 0.5 = 3.
    expect(result[3]).toBe(3);
  });

  it('reports RSI of 100 when nothing has gone down', () => {
    const result = rsi(values, 5);
    expect(result[4]).toBeNull();
    expect(result[5]).toBe(100);
  });

  it('moves RSI off 100 once a down bar arrives', () => {
    const result = rsi([1, 2, 3, 4, 5, 6, 3], 5);
    expect(result[6]).toBeLessThan(100);
    expect(result[6]).toBeGreaterThan(0);
  });

  it('lines up MACD, its signal and the histogram', () => {
    const closes = rising(60);
    const lines = macd(closes, 12, 26, 9);
    expect(lines.macd[24]).toBeNull();
    expect(lines.macd[25]).not.toBeNull();
    expect(lines.signal[25 + 7]).toBeNull();
    expect(lines.signal[25 + 8]).not.toBeNull();
    const last = closes.length - 1;
    expect(lines.histogram[last]).toBeCloseTo((lines.macd[last] as number) - (lines.signal[last] as number), 10);
  });

  it('centres Bollinger bands on the moving average', () => {
    const bands = bollinger(values, 4, 2);
    const i = 9;
    expect(bands.middle[i]).toBe(8.5);
    expect((bands.upper[i] as number) - (bands.middle[i] as number)).toBeCloseTo((bands.middle[i] as number) - (bands.lower[i] as number), 10);
  });

  it('takes the widest of the three true ranges', () => {
    const bars = dailyBars([100, 110]);
    // Bar 2 opens at 100, closes at 110, so its range is 99 to 111 and its true range is 12.
    expect(trueRange(bars)[1]).toBe(12);
  });

  it('smooths ATR the way Wilder does', () => {
    const bars = dailyBars(rising(30));
    const result = atr(bars, 14);
    expect(result[12]).toBeNull();
    expect(result[13]).not.toBeNull();
    // Every bar after the first has the same 3-point range, so Wilder's average converges on
    // it from the seed of (2 + 13 x 3) / 14.
    expect(result[13]).toBeCloseTo(41 / 14, 10);
    expect(result[29]).toBeGreaterThan(result[13] as number);
    expect(result[29]).toBeCloseTo(3, 1);
  });

  it('flips Supertrend with the trend', () => {
    const up = supertrend(dailyBars(rising(40)), 10, 3);
    expect(up.direction[39]).toBe(1);
    const down = supertrend(dailyBars(rising(40).reverse()), 10, 3);
    expect(down.direction[39]).toBe(-1);
  });

  it('anchors VWAP to the session and resets on a new date', () => {
    const bars: Bar[] = [
      { date: '2024-01-01', time: '09:15', open: 100, high: 102, low: 98, close: 100, volume: 100 },
      { date: '2024-01-01', time: '09:16', open: 100, high: 110, low: 100, close: 108, volume: 100 },
      { date: '2024-01-02', time: '09:15', open: 200, high: 202, low: 198, close: 200, volume: 50 },
    ];
    expect(vwap(bars)[0]).toBeCloseTo(100, 10);
    expect(vwap(bars)[1]).toBeCloseTo((100 + 106) / 2, 10);
    // A new date wipes the accumulator; yesterday's prices do not leak in.
    expect(vwap(bars)[2]).toBeCloseTo(200, 10);
  });

  it('carries the previous session high, low and close', () => {
    const bars: Bar[] = [
      { date: '2024-01-01', time: '09:15', open: 100, high: 105, low: 95, close: 100, volume: 1 },
      { date: '2024-01-01', time: '09:16', open: 100, high: 108, low: 99, close: 107, volume: 1 },
      { date: '2024-01-02', time: '09:15', open: 110, high: 112, low: 109, close: 111, volume: 1 },
    ];
    const levels = previousSessionLevels(bars);
    expect(levels.previousHigh[1]).toBeNull();
    expect(levels.previousHigh[2]).toBe(108);
    expect(levels.previousLow[2]).toBe(95);
    expect(levels.previousClose[2]).toBe(107);
  });

  it('publishes the opening range only once it is complete', () => {
    const bars: Bar[] = ['09:15', '09:16', '09:17', '09:18'].map((time, i) => ({
      date: '2024-01-01',
      time,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
      volume: 1,
    }));
    const range = openingRange(bars, 3);
    expect(range.high[1]).toBeNull();
    expect(range.high[2]).toBe(104);
    expect(range.low[2]).toBe(99);
    // The level stays put for the rest of the session.
    expect(range.high[3]).toBe(104);
  });
});

describe('strategy spec validation', () => {
  it('accepts a well-formed spec', () => {
    expect(() => validateSpec(spec())).not.toThrow();
  });

  it('refuses a strategy with no way out of a position', () => {
    expect(() => validateSpec(spec({ exit: null }))).toThrow(/no way to close a position/);
  });

  it('refuses risk-based sizing without a stop', () => {
    expect(() => validateSpec(spec({ sizing: { method: 'FIXED_RISK', percent: 1, lotSize: 1 } }))).toThrow(/needs a stop loss/);
  });

  it('caps how deeply a rule may nest', () => {
    let condition: Condition = { type: 'COMPARE', left: price('CLOSE'), op: 'GT', right: { type: 'CONSTANT', value: 1 } };
    for (let i = 0; i < 10; i += 1) condition = { type: 'AND', operands: [condition] };
    expect(() => validateSpec(spec({ entry: condition }))).toThrow(/nest more than/);
  });

  it('caps how many parts a rule may have', () => {
    const operands: Condition[] = Array.from({ length: 40 }, () => ({
      type: 'COMPARE' as const,
      left: price('CLOSE'),
      op: 'GT' as const,
      right: { type: 'CONSTANT' as const, value: 1 },
    }));
    expect(() => validateSpec(spec({ entry: { type: 'AND', operands } }))).toThrow(/more than/);
  });

  it('rejects an indicator period outside the allowed range', () => {
    expect(() =>
      validateSpec(
        spec({ entry: { type: 'COMPARE', left: price('CLOSE'), op: 'GT', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 9999 } } } }),
      ),
    ).toThrow(/between 1 and/);
  });

  it('counts the tunable numbers, which is what the overfitting note is built on', () => {
    expect(countParameters(spec())).toBe(2);
    expect(countParameters(spec({ stopLoss: { type: 'PERCENT', value: 2 }, target: { type: 'PERCENT', value: 4 } }))).toBe(4);
  });
});

describe('backtester', () => {
  it('buys the cross and holds a rising series to the end of the data', () => {
    const result = runBacktest(spec(), dailyBars(rising(60)));
    expect(result.stats.trades).toBe(1);
    expect(result.trades[0].direction).toBe('LONG');
    expect(result.trades[0].reason).toBe('END_OF_DATA');
    expect(Number(result.trades[0].grossPnl)).toBeGreaterThan(0);
    expect(result.stats.bars).toBe(60);
    expect(result.disclaimer).toContain('Fills are assumed');
  });

  it('takes charges off every trade through the statutory engine', () => {
    const result = runBacktest(spec(), dailyBars(rising(60)));
    const trade = result.trades[0];
    expect(Number(trade.charges.stt)).toBeGreaterThan(0);
    expect(Number(trade.charges.total)).toBeGreaterThan(0);
    expect(Number(trade.netPnl)).toBeCloseTo(Number(trade.grossPnl) - Number(trade.charges.total), 2);
    expect(Number(result.stats.totalCharges)).toBeCloseTo(Number(trade.charges.total), 2);
  });

  it('is deterministic', () => {
    const bars = dailyBars(rising(120));
    const a = runBacktest(spec(), bars);
    const b = runBacktest(spec(), bars);
    expect(JSON.stringify({ ...a, elapsedMs: 0 })).toBe(JSON.stringify({ ...b, elapsedMs: 0 }));
  });

  it('fills at the next bar open, not at the signal bar close', () => {
    const closes = rising(30);
    const bars = dailyBars(closes);
    const result = runBacktest(spec(), bars);
    const entry = result.trades[0];
    const entryIndex = bars.findIndex((bar) => bar.date === entry.entryDate);
    expect(Number(entry.entryPrice)).toBeCloseTo(bars[entryIndex].open, 6);
  });

  it('applies slippage against the trader on both legs', () => {
    const bars = dailyBars(rising(60));
    const clean = runBacktest(spec(), bars);
    const slipped = runBacktest(spec({ execution: { ...spec().execution, slippageType: 'POINTS', slippage: 1 } }), bars);
    expect(Number(slipped.trades[0].entryPrice)).toBeGreaterThan(Number(clean.trades[0].entryPrice));
    expect(Number(slipped.trades[0].exitPrice)).toBeLessThan(Number(clean.trades[0].exitPrice));
    expect(Number(slipped.stats.netPnl)).toBeLessThan(Number(clean.stats.netPnl));
  });

  it('takes the stop rather than the target when a bar contains both', () => {
    // A bar wide enough to touch a 1% stop and a 1% target on the same day. Without tick data
    // there is no way to know which came first, so the engine takes the one that hurts.
    const bars: Bar[] = [
      { date: '2024-01-01', time: null, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { date: '2024-01-02', time: null, open: 100, high: 110, low: 90, close: 100, volume: 1 },
      { date: '2024-01-03', time: null, open: 100, high: 101, low: 99, close: 100, volume: 1 },
    ];
    const result = runBacktest(
      spec({ entry: { type: 'ALWAYS' }, exit: null, stopLoss: { type: 'PERCENT', value: 1 }, target: { type: 'PERCENT', value: 1 } }),
      bars,
    );
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades[0].reason).toBe('STOP_LOSS');
    expect(Number(result.trades[0].exitPrice)).toBeCloseTo(99, 6);
  });

  it('fills a gap through the stop at the open, not at the stop price', () => {
    const bars: Bar[] = [
      { date: '2024-01-01', time: null, open: 100, high: 101, low: 99.5, close: 100, volume: 1 },
      { date: '2024-01-02', time: null, open: 100, high: 101, low: 99.5, close: 100, volume: 1 },
      { date: '2024-01-03', time: null, open: 90, high: 91, low: 89, close: 90, volume: 1 },
      { date: '2024-01-04', time: null, open: 90, high: 91, low: 89, close: 90, volume: 1 },
    ];
    const result = runBacktest(spec({ entry: { type: 'ALWAYS' }, exit: null, stopLoss: { type: 'PERCENT', value: 2 } }), bars);
    const stopped = result.trades[0];
    expect(stopped.reason).toBe('STOP_LOSS');
    // The stop was at 98; the bar opened at 90 and that, not 98, is where it filled.
    expect(Number(stopped.exitPrice)).toBeCloseTo(90, 6);
  });

  it('squares off intraday positions at the configured time', () => {
    const bars: Bar[] = [];
    for (const date of ['2024-01-01', '2024-01-02']) {
      ['09:15', '10:00', '12:00', '15:15'].forEach((time, i) => {
        bars.push({ date, time, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 100 });
      });
    }
    const result = runBacktest(
      spec({
        timeframe: 'MINUTE',
        entry: { type: 'ALWAYS' },
        exit: null,
        intradaySquareOffTime: '15:15',
        maxBarsInTrade: null,
        execution: { ...spec().execution, segment: 'EQUITY_INTRADAY' },
      }),
      bars,
    );
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades.every((trade) => trade.reason === 'SQUARE_OFF' || trade.reason === 'END_OF_DATA')).toBe(true);
    expect(result.trades[0].entryDate).toBe(result.trades[0].exitDate);
  });

  it('closes a position after the bar limit', () => {
    const result = runBacktest(spec({ exit: null, maxBarsInTrade: 3 }), dailyBars(rising(40)));
    expect(result.trades[0].reason).toBe('TIME_EXIT');
    expect(result.trades[0].barsHeld).toBe(3);
  });

  it('ratchets a trailing stop and never gives ground back', () => {
    // Up to 130, then straight back down.
    const bars = dailyBars([...rising(20, 100, 2), ...rising(15, 138, -3)]);
    const result = runBacktest(spec({ exit: null, trailingStop: { type: 'PERCENT', value: 5 } }), bars);
    const trade = result.trades[0];
    expect(trade.reason).toBe('TRAILING_STOP');
    // It gave back at most the trail from the high, not the whole move.
    expect(Number(trade.exitPrice)).toBeGreaterThan(120);
  });

  it('sizes by risk against the stop', () => {
    const result = runBacktest(
      spec({ stopLoss: { type: 'PERCENT', value: 2 }, sizing: { method: 'FIXED_RISK', percent: 1, lotSize: 1 } }),
      dailyBars(rising(60)),
    );
    const trade = result.trades[0];
    // 1% of ten lakh is 10,000, risked over a 2% stop on a ~105 entry: about 4,700 shares.
    const risk = Math.abs(Number(trade.entryPrice) * 0.02) * trade.quantity;
    expect(risk).toBeGreaterThan(9_000);
    expect(risk).toBeLessThanOrEqual(10_000);
  });

  it('floors size to whole lots', () => {
    const result = runBacktest(
      spec({ sizing: { method: 'FIXED_FRACTIONAL', percent: 50, lotSize: 75 } }),
      dailyBars(rising(60)),
    );
    expect(result.trades[0].quantity % 75).toBe(0);
  });

  it('shorts when the direction says so', () => {
    const result = runBacktest(spec({ direction: 'SHORT' }), dailyBars(rising(60)));
    expect(result.trades[0].direction).toBe('SHORT');
    // Shorting a series that only goes up loses money, which is the point of the check.
    expect(Number(result.stats.netPnl)).toBeLessThan(0);
  });

  it('builds an equity curve with drawdowns that are never positive', () => {
    const bars = dailyBars([...rising(30, 100, 2), ...rising(30, 158, -2)]);
    const result = runBacktest(spec(), bars);
    expect(result.equityCurve.length).toBe(60);
    expect(result.equityCurve.every((point) => Number(point.drawdownPercent) <= 0)).toBe(true);
    expect(Number(result.stats.maxDrawdownPercent)).toBeLessThanOrEqual(0);
  });

  it('splits walk-forward and re-warms the indicators on each half', () => {
    const bars = dailyBars([...rising(80, 100, 1), ...rising(80, 179, -1)]);
    const result = runBacktest(spec(), bars, { walkForwardSplit: 0.5 });
    expect(result.walkForward).not.toBeNull();
    expect(result.walkForward?.splitPercent).toBe('50.00');
    expect(result.walkForward?.splitDate).toBe(bars[80].date);
    expect(result.walkForward?.inSample.bars).toBe(80);
    expect(result.walkForward?.outOfSample.bars).toBe(80);
    expect(result.walkForward?.verdict).toBeTruthy();
  });

  it('warns about overfitting when there is little to go on', () => {
    const result = runBacktest(spec(), dailyBars(rising(60)));
    expect(result.overfittingWarning).toContain('too few to tell an edge from luck');
  });

  it('warns harder after many runs of the same idea', () => {
    const result = runBacktest(spec(), dailyBars(rising(60)), { runsSoFar: 25 });
    expect(result.overfittingWarning).toContain('25 variations');
  });

  it('breaks results down by year', () => {
    const bars = dailyBars(rising(400));
    const result = runBacktest(spec({ exit: null, maxBarsInTrade: 5 }), bars);
    expect(result.perYear.length).toBeGreaterThanOrEqual(2);
    expect(result.perYear[0].year < result.perYear[1].year).toBe(true);
  });

  it('withholds Sharpe when there is not enough history to mean anything', () => {
    expect(runBacktest(spec(), dailyBars(rising(15))).stats.sharpe).toBeNull();
  });

  it('records what it assumed', () => {
    const result = runBacktest(spec(), dailyBars(rising(60)));
    expect(result.assumptions.join(' ')).toContain('next bar');
    expect(result.assumptions.join(' ')).toContain('stop is taken');
    expect(result.assumptions.join(' ')).toContain('No randomness');
  });

  it('refuses a run that is too big or too small', () => {
    expect(() => runBacktest(spec(), dailyBars(rising(1)))).toThrow(/at least two bars/);
    expect(() => runBacktest(spec(), dailyBars(rising(100)), { maxBars: 50 })).toThrow(/limited to/);
  });

  it('stops a run that outlasts its time budget', () => {
    expect(() => runBacktest(spec(), dailyBars(rising(5_000)), { timeBudgetMs: -1 })).toThrow(/budget/);
  });

  it('never trades on a bar where the indicator has not warmed up', () => {
    const bars = dailyBars(rising(60));
    const result = runBacktest(
      spec({ entry: { type: 'COMPARE', left: price('CLOSE'), op: 'GT', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 50 } } } }),
      bars,
    );
    // The 50-period average does not exist before bar 50, so nothing can fill before bar 51.
    if (result.trades.length > 0) expect(result.trades[0].entryDate >= bars[50].date).toBe(true);
  });
});
