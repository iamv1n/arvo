/*
 * Black–Scholes–Merton for European options, with a continuous dividend yield.
 *
 * Indian index and stock options are European and cash-settled, so the plain BSM formula is
 * the right model rather than a binomial tree for American exercise. Dividend yield is a
 * parameter because single-stock options do have discrete dividends; entering an annualised
 * yield is the usual approximation and it is the user's assumption, not ours.
 *
 * Day count is ACT/365 — the convention NSE uses for its own option calculators. A contract
 * expiring today has t = 0 and is worth exactly its intrinsic value.
 *
 * Everything here is IEEE double arithmetic. See lab/types.ts for why the lab does not use the
 * exact-decimal money type: these are model outputs, never ledger entries.
 */

import type { OptionRight } from '../trading/types';

export interface PricingInputs {
  /** Underlying price. */
  spot: number;
  strike: number;
  /** Years to expiry, ACT/365. Zero or negative is treated as expired. */
  timeYears: number;
  /** Continuously-compounded annual risk-free rate as a decimal, e.g. 0.065. */
  rate: number;
  /** Continuous annual dividend yield as a decimal. */
  dividendYield: number;
  /** Annual volatility as a decimal, e.g. 0.14. */
  volatility: number;
  right: OptionRight;
}

export interface GreekSet {
  /** ∂price/∂spot. */
  delta: number;
  /** ∂²price/∂spot². */
  gamma: number;
  /** ∂price/∂t per calendar day (negative for a long option, usually). */
  theta: number;
  /** ∂price/∂volatility per 1 volatility point (1%). */
  vega: number;
  /** ∂price/∂rate per 1 percentage point of rate. */
  rho: number;
}

export const DAYS_PER_YEAR = 365;

/** Years between two ISO dates on ACT/365; never negative. */
export function yearsBetween(from: string, to: string): number {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days > 0 ? days / DAYS_PER_YEAR : 0;
}

/** Whole calendar days between two ISO dates; never negative. */
export function calendarDaysTo(from: string, to: string): number {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days > 0 ? Math.round(days) : 0;
}

/**
 * Standard normal CDF, West's refinement of Hart's algorithm. Accurate to roughly 1e-15 across
 * the whole real line, which matters because an implied-volatility solve amplifies CDF error in
 * the deep wings where vega is tiny.
 */
export function normalCdf(x: number): number {
  const z = Math.abs(x);
  let c: number;
  if (z > 37) {
    c = 0;
  } else {
    const e = Math.exp((-z * z) / 2);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-2 * z + 0.700383064443688;
      b = b * z + 6.37396220353165;
      b = b * z + 33.912866078383;
      b = b * z + 112.079291497871;
      b = b * z + 221.213596169931;
      b = b * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = (e * b) / d;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / (b * 2.506628274631);
    }
  }
  return x > 0 ? 1 - c : c;
}

/** Standard normal density. */
export function normalPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/** Intrinsic value per unit; what the contract is worth once time has run out. */
export function intrinsicValue(spot: number, strike: number, right: OptionRight): number {
  return right === 'CE' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

interface D1D2 {
  d1: number;
  d2: number;
  /** e^(−q·t). */
  discountDiv: number;
  /** e^(−r·t). */
  discountRate: number;
  sqrtT: number;
}

function terms(inputs: PricingInputs): D1D2 | null {
  const { spot, strike, timeYears, rate, dividendYield, volatility } = inputs;
  if (!(timeYears > 0) || !(volatility > 0) || !(spot > 0) || !(strike > 0)) return null;
  const sqrtT = Math.sqrt(timeYears);
  const d1 = (Math.log(spot / strike) + (rate - dividendYield + (volatility * volatility) / 2) * timeYears) / (volatility * sqrtT);
  return {
    d1,
    d2: d1 - volatility * sqrtT,
    discountDiv: Math.exp(-dividendYield * timeYears),
    discountRate: Math.exp(-rate * timeYears),
    sqrtT,
  };
}

/** Theoretical premium per unit. Degenerates to intrinsic value at expiry or at zero vol. */
export function optionPrice(inputs: PricingInputs): number {
  const t = terms(inputs);
  if (!t) {
    // No time or no volatility left: the model collapses to discounted intrinsic value. At
    // t = 0 the discounts are 1, which is the payoff the payoff engine also uses.
    const { spot, strike, timeYears, rate, dividendYield, right } = inputs;
    const years = Math.max(timeYears, 0);
    const forward = spot * Math.exp(-dividendYield * years);
    const discounted = strike * Math.exp(-rate * years);
    return right === 'CE' ? Math.max(forward - discounted, 0) : Math.max(discounted - forward, 0);
  }
  const { spot, strike, right } = inputs;
  const { d1, d2, discountDiv, discountRate } = t;
  return right === 'CE'
    ? spot * discountDiv * normalCdf(d1) - strike * discountRate * normalCdf(d2)
    : strike * discountRate * normalCdf(-d2) - spot * discountDiv * normalCdf(-d1);
}

/**
 * Per-unit Greeks in the units a trader reads them in: theta per calendar day, vega per one
 * volatility point, rho per one percentage point of interest rate.
 *
 * At expiry the model has no smooth derivatives, so delta becomes the step function (1, 0 or
 * −1 for a call) and everything else is zero. That is the honest answer rather than a divide
 * by zero, and the UI can say "expired".
 */
export function optionGreeks(inputs: PricingInputs): GreekSet {
  const t = terms(inputs);
  if (!t) {
    const { spot, strike, right } = inputs;
    const itm = right === 'CE' ? spot > strike : spot < strike;
    return { delta: itm ? (right === 'CE' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const { spot, strike, timeYears, rate, dividendYield, volatility, right } = inputs;
  const { d1, d2, discountDiv, discountRate, sqrtT } = t;
  const pdf = normalPdf(d1);
  const delta = right === 'CE' ? discountDiv * normalCdf(d1) : discountDiv * (normalCdf(d1) - 1);
  const gamma = (discountDiv * pdf) / (spot * volatility * sqrtT);
  // Vega and rho are reported per point rather than per unit of decimal, so divide by 100.
  const vega = (spot * discountDiv * pdf * sqrtT) / 100;
  const common = -(spot * discountDiv * pdf * volatility) / (2 * sqrtT);
  const thetaAnnual =
    right === 'CE'
      ? common - rate * strike * discountRate * normalCdf(d2) + dividendYield * spot * discountDiv * normalCdf(d1)
      : common + rate * strike * discountRate * normalCdf(-d2) - dividendYield * spot * discountDiv * normalCdf(-d1);
  const rho =
    right === 'CE' ? (strike * timeYears * discountRate * normalCdf(d2)) / 100 : (-strike * timeYears * discountRate * normalCdf(-d2)) / 100;
  return { delta, gamma, theta: thetaAnnual / DAYS_PER_YEAR, vega, rho };
}

export interface ImpliedVolatilityResult {
  /** Annual volatility as a decimal, or null when no volatility reproduces the price. */
  volatility: number | null;
  /** Iterations used. */
  iterations: number;
  /** |modelPrice − targetPrice| at the answer. */
  residual: number;
  /** Why the solve stopped, in words the UI can show. */
  status: 'SOLVED' | 'BELOW_INTRINSIC' | 'ABOVE_BOUND' | 'NO_CONVERGENCE' | 'EXPIRED';
}

/** The search bracket. 1% to 1000% covers everything an Indian option has ever printed. */
export const IV_MIN = 0.0001;
export const IV_MAX = 10;
/**
 * Sanity epsilon for the no-arbitrage bound checks: a premium this far below intrinsic value
 * is a typo, not a market quote.
 */
export const IV_PRICE_TOLERANCE = 0.005;
/**
 * Convergence is relative, not absolute. Half a paisa is a fine tolerance on a 300-rupee
 * at-the-money premium and a useless one on a 40-paisa far wing, where it would accept any
 * volatility at all — so the solver stops when the model price is within one part in a billion
 * of the target, or the volatility bracket is under 1e-9 wide.
 */
export const IV_RELATIVE_TOLERANCE = 1e-9;
export const IV_ABSOLUTE_FLOOR = 1e-12;
export const IV_VOL_TOLERANCE = 1e-9;
export const IV_MAX_ITERATIONS = 100;

/**
 * Implied volatility from an observed premium.
 *
 * Newton's method converges fast near the money but falls over in the wings, where vega is
 * near zero and a Newton step can jump out of the bracket entirely. So this is a Newton step
 * guarded by bisection: keep a bracket that is known to contain the root, take the Newton step
 * when it lands inside and reduces the interval, and bisect when it does not. That is
 * unconditionally convergent and still quadratic where it can be.
 *
 * Termination: |model − target| ≤ ₹0.005 (half a paisa, below any tradeable tick) or the
 * bracket narrower than 1e-8 in volatility, capped at 100 iterations. A premium below intrinsic
 * value or above the theoretical maximum has no solution and is reported as such rather than
 * silently clamped — a price outside the no-arbitrage bounds means the input is wrong.
 */
export function impliedVolatility(targetPrice: number, inputs: Omit<PricingInputs, 'volatility'>): ImpliedVolatilityResult {
  const { spot, timeYears } = inputs;
  if (!(timeYears > 0)) return { volatility: null, iterations: 0, residual: Number.NaN, status: 'EXPIRED' };

  const price = (volatility: number) => optionPrice({ ...inputs, volatility });
  const lowPrice = price(IV_MIN);
  const highPrice = price(IV_MAX);
  if (targetPrice < lowPrice - IV_PRICE_TOLERANCE) {
    return { volatility: null, iterations: 0, residual: lowPrice - targetPrice, status: 'BELOW_INTRINSIC' };
  }
  if (targetPrice > highPrice + IV_PRICE_TOLERANCE) {
    return { volatility: null, iterations: 0, residual: targetPrice - highPrice, status: 'ABOVE_BOUND' };
  }

  let low = IV_MIN;
  let high = IV_MAX;
  // Start from Brenner–Subrahmanyam, the closed-form at-the-money approximation. It is a good
  // first guess for near-the-money contracts and harmless elsewhere because of the guard.
  let guess = Math.min(Math.max((targetPrice / spot) * Math.sqrt((2 * Math.PI) / timeYears), IV_MIN), IV_MAX);
  const tolerance = Math.max(Math.abs(targetPrice) * IV_RELATIVE_TOLERANCE, IV_ABSOLUTE_FLOOR);

  for (let i = 1; i <= IV_MAX_ITERATIONS; i += 1) {
    const modelled = price(guess);
    const diff = modelled - targetPrice;
    if (Math.abs(diff) <= tolerance) return { volatility: guess, iterations: i, residual: Math.abs(diff), status: 'SOLVED' };
    if (diff > 0) high = guess;
    else low = guess;
    if (high - low <= IV_VOL_TOLERANCE) {
      const mid = (low + high) / 2;
      return { volatility: mid, iterations: i, residual: Math.abs(price(mid) - targetPrice), status: 'SOLVED' };
    }
    // Price is monotonically increasing in volatility, so vega is the derivative we need.
    const vega = optionGreeks({ ...inputs, volatility: guess }).vega * 100;
    const newton = vega > 1e-12 ? guess - diff / vega : Number.NaN;
    guess = Number.isFinite(newton) && newton > low && newton < high ? newton : (low + high) / 2;
  }
  const residual = Math.abs(price(guess) - targetPrice);
  return { volatility: guess, iterations: IV_MAX_ITERATIONS, residual, status: residual <= IV_PRICE_TOLERANCE ? 'SOLVED' : 'NO_CONVERGENCE' };
}

/**
 * P(S_T ≤ level) under the lognormal the model assumes, with drift r − q. This is the
 * risk-neutral measure, not a forecast of where the underlying will actually go: it is what the
 * option prices imply, which is the only distribution the model knows about.
 */
export function lognormalCdf(level: number, spot: number, timeYears: number, rate: number, dividendYield: number, volatility: number): number {
  if (level <= 0) return 0;
  if (!(timeYears > 0) || !(volatility > 0)) return spot <= level ? 1 : 0;
  const sigmaRootT = volatility * Math.sqrt(timeYears);
  const d = (Math.log(level / spot) - (rate - dividendYield - (volatility * volatility) / 2) * timeYears) / sigmaRootT;
  return normalCdf(d);
}
