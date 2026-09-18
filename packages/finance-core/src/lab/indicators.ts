import type { Bar } from './bars';

/*
 * Technical indicators for the backtester.
 *
 * Every function returns an array the same length as its input, with `null` for the bars where
 * the indicator has not warmed up yet. That matters more than it looks: a strategy that starts
 * trading on bar 1 of a 14-period RSI is testing a number that does not exist, and returning
 * null rather than a partial average forces the engine to skip those bars instead of quietly
 * comparing against garbage.
 *
 * Wilder's smoothing (RSI, ATR) is seeded with a simple average of the first `period` values,
 * which is what Wilder's own tables do and what charting platforms show. An EMA is seeded the
 * same way rather than with the first close, so two runs over different slices of the same
 * series agree sooner.
 *
 * Session handling: VWAP, previous-day levels and the opening range are all session-aware.
 * They key off the bar's `date`, so the same code works for daily bars (where each bar is its
 * own session) and minute bars.
 */

export type Series = (number | null)[];

const warm = (length: number): Series => new Array<number | null>(length).fill(null);

/** Simple moving average. */
export function sma(values: number[], period: number): Series {
  const out = warm(values.length);
  if (period < 1) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the simple average of the first `period` values. */
export function ema(values: number[], period: number): Series {
  const out = warm(values.length);
  if (period < 1 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];
  let previous = seed / period;
  out[period - 1] = previous;
  for (let i = period; i < values.length; i += 1) {
    previous = values[i] * k + previous * (1 - k);
    out[i] = previous;
  }
  return out;
}

/** Wilder's RSI. 100 when there has not been a single down move in the window. */
export function rsi(values: number[], period: number): Series {
  const out = warm(values.length);
  if (period < 1 || values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  out[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    out[i] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return out;
}

export interface MacdSeries {
  macd: Series;
  signal: Series;
  histogram: Series;
}

/** MACD: the gap between two EMAs, and an EMA of that gap. */
export function macd(values: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdSeries {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const line = values.map((_, i) => (fast[i] === null || slow[i] === null ? null : (fast[i] as number) - (slow[i] as number)));
  // The signal EMA only sees the bars where the MACD line exists, then is padded back out.
  const defined = line.filter((value): value is number => value !== null);
  const offset = line.findIndex((value) => value !== null);
  const signalDefined = offset < 0 ? [] : ema(defined, signalPeriod);
  const signal = warm(values.length);
  if (offset >= 0) for (let i = 0; i < signalDefined.length; i += 1) signal[offset + i] = signalDefined[i];
  return {
    macd: line,
    signal,
    histogram: line.map((value, i) => (value === null || signal[i] === null ? null : value - (signal[i] as number))),
  };
}

/** Bollinger bands from a simple moving average and the population standard deviation. */
export function bollinger(values: number[], period = 20, deviations = 2): { middle: Series; upper: Series; lower: Series } {
  const middle = sma(values, period);
  const upper = warm(values.length);
  const lower = warm(values.length);
  for (let i = period - 1; i < values.length; i += 1) {
    const mean = middle[i];
    if (mean === null) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (values[j] - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + deviations * sd;
    lower[i] = mean - deviations * sd;
  }
  return { middle, upper, lower };
}

/** True range: the widest of today's range, the gap up from yesterday and the gap down. */
export function trueRange(bars: Bar[]): number[] {
  return bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const previousClose = bars[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
}

/** Wilder's ATR. */
export function atr(bars: Bar[], period = 14): Series {
  const ranges = trueRange(bars);
  const out = warm(bars.length);
  if (bars.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += ranges[i];
  let previous = sum / period;
  out[period - 1] = previous;
  for (let i = period; i < bars.length; i += 1) {
    previous = (previous * (period - 1) + ranges[i]) / period;
    out[i] = previous;
  }
  return out;
}

export interface SupertrendSeries {
  value: Series;
  /** 1 while the trend is up (price above the band), −1 while it is down. */
  direction: Series;
}

/**
 * Supertrend: an ATR band that only ever ratchets in the direction of the trend, flipping when
 * the close crosses it. The ratchet is what makes it a trailing stop rather than a channel.
 */
export function supertrend(bars: Bar[], period = 10, multiplier = 3): SupertrendSeries {
  const ranges = atr(bars, period);
  const value = warm(bars.length);
  const direction = warm(bars.length);
  let upperBand = Number.NaN;
  let lowerBand = Number.NaN;
  let trend = 1;
  for (let i = 0; i < bars.length; i += 1) {
    const range = ranges[i];
    if (range === null) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    const rawUpper = mid + multiplier * range;
    const rawLower = mid - multiplier * range;
    const previousClose = i > 0 ? bars[i - 1].close : bars[i].close;
    upperBand = Number.isNaN(upperBand) || rawUpper < upperBand || previousClose > upperBand ? rawUpper : upperBand;
    lowerBand = Number.isNaN(lowerBand) || rawLower > lowerBand || previousClose < lowerBand ? rawLower : lowerBand;
    if (bars[i].close > upperBand) trend = 1;
    else if (bars[i].close < lowerBand) trend = -1;
    value[i] = trend === 1 ? lowerBand : upperBand;
    direction[i] = trend;
  }
  return { value, direction };
}

/**
 * Session-anchored VWAP: the volume-weighted average price since the session opened, reset on
 * every new trading date. On daily bars every bar is its own session, so it degenerates to the
 * bar's own typical price — correct, and a sign that VWAP is an intraday tool.
 */
export function vwap(bars: Bar[]): Series {
  const out = warm(bars.length);
  let session: string | null = null;
  let priceVolume = 0;
  let volume = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].date !== session) {
      session = bars[i].date;
      priceVolume = 0;
      volume = 0;
    }
    const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
    priceVolume += typical * bars[i].volume;
    volume += bars[i].volume;
    out[i] = volume > 0 ? priceVolume / volume : typical;
  }
  return out;
}

export interface SessionLevels {
  previousHigh: Series;
  previousLow: Series;
  previousClose: Series;
}

/** The prior session's high, low and close, carried across every bar of the current one. */
export function previousSessionLevels(bars: Bar[]): SessionLevels {
  const previousHigh = warm(bars.length);
  const previousLow = warm(bars.length);
  const previousClose = warm(bars.length);
  let session: string | null = null;
  let priorHigh: number | null = null;
  let priorLow: number | null = null;
  let priorClose: number | null = null;
  let runningHigh = Number.NEGATIVE_INFINITY;
  let runningLow = Number.POSITIVE_INFINITY;
  let runningClose = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].date !== session) {
      if (session !== null) {
        priorHigh = runningHigh;
        priorLow = runningLow;
        priorClose = runningClose;
      }
      session = bars[i].date;
      runningHigh = Number.NEGATIVE_INFINITY;
      runningLow = Number.POSITIVE_INFINITY;
    }
    runningHigh = Math.max(runningHigh, bars[i].high);
    runningLow = Math.min(runningLow, bars[i].low);
    runningClose = bars[i].close;
    previousHigh[i] = priorHigh;
    previousLow[i] = priorLow;
    previousClose[i] = priorClose;
  }
  return { previousHigh, previousLow, previousClose };
}

/**
 * The opening range: the high and low of the first `bars` bars of each session, available from
 * the moment the range completes and not a bar before. On daily data the range is the first
 * bar's own high and low, which is only meaningful if that is what you meant.
 */
export function openingRange(bars: Bar[], barsInRange = 3): { high: Series; low: Series } {
  const high = warm(bars.length);
  const low = warm(bars.length);
  let session: string | null = null;
  let index = 0;
  let rangeHigh = Number.NEGATIVE_INFINITY;
  let rangeLow = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].date !== session) {
      session = bars[i].date;
      index = 0;
      rangeHigh = Number.NEGATIVE_INFINITY;
      rangeLow = Number.POSITIVE_INFINITY;
    }
    index += 1;
    if (index <= barsInRange) {
      rangeHigh = Math.max(rangeHigh, bars[i].high);
      rangeLow = Math.min(rangeLow, bars[i].low);
    }
    if (index >= barsInRange) {
      high[i] = rangeHigh;
      low[i] = rangeLow;
    }
  }
  return { high, low };
}
