import { DomainError } from '../errors';
import { calendarDaysTo, impliedVolatility, intrinsicValue, lognormalCdf, optionGreeks, optionPrice, yearsBetween, type GreekSet } from './black-scholes';
import {
  LAB_DISCLAIMER,
  MARGIN_DISCLAIMER,
  type Greeks,
  type LegAnalysis,
  type MarginEstimate,
  type MarketAssumptions,
  type PayoffExtreme,
  type PayoffPoint,
  type PayoffReport,
  type ProbabilityEstimate,
  type StrategyLeg,
} from './types';

/*
 * The multi-leg payoff engine.
 *
 * Two curves are produced. "At expiry" is the structure's profit at the *nearest* expiry among
 * its legs: legs expiring then are settled at intrinsic value, and any longer-dated leg is
 * re-priced by Black–Scholes for the time it still has left. That is what makes a calendar
 * spread show its tent shape instead of a straight line. "Today" is the same structure priced
 * at the valuation date.
 *
 * Breakevens and extremes are found numerically on a grid that always includes every strike,
 * so the kinks can never be missed. When every leg shares one expiry the payoff is piecewise
 * linear and the answer at a kink is exact; with mixed expiries the curve is smooth and the
 * extremes are grid approximations, which the report says.
 *
 * The underlying cannot go below zero, so a short put's loss is bounded at S = 0 and is
 * reported as a number rather than as "unlimited". Only the upside is ever truly unbounded.
 */

const GRID_POINTS = 1201;
const SERIES_POINTS = 121;
const BISECTION_STEPS = 60;
export const MAX_LEGS = 12;

type Direction = 1 | -1;

interface Leg {
  input: StrategyLeg;
  index: number;
  direction: Direction;
  quantity: number;
  strike: number;
  premium: number;
  volatility: number;
  /** Expiry of this leg, or null for cash underlying. */
  expiry: string | null;
}

interface Context {
  assumptions: MarketAssumptions;
  spot: number;
  rate: number;
  dividendYield: number;
  defaultVol: number;
  legs: Leg[];
  /** The nearest expiry among the legs; the date the "at expiry" curve is drawn for. */
  terminal: string | null;
  /** True when no leg outlives the terminal date, so the expiry curve is piecewise linear. */
  singleExpiry: boolean;
}

const num = (value: string, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw DomainError.validation('LAB_INVALID_NUMBER', `${field} must be a number`, { value });
  return parsed;
};

/** Two decimals, with −0 normalised away so a flat leg never renders as "-0.00". */
export const fmt = (value: number, dp = 2): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(dp));
  return (rounded === 0 ? 0 : rounded).toFixed(dp);
};

function buildContext(legsInput: StrategyLeg[], assumptions: MarketAssumptions): Context {
  if (legsInput.length === 0) throw DomainError.validation('LAB_NO_LEGS', 'Add at least one leg');
  if (legsInput.length > MAX_LEGS) throw DomainError.validation('LAB_TOO_MANY_LEGS', `A structure is limited to ${MAX_LEGS} legs`);

  const spot = num(assumptions.spot, 'spot');
  if (spot <= 0) throw DomainError.validation('LAB_INVALID_SPOT', 'Spot must be above zero');
  const defaultVol = num(assumptions.impliedVolatilityPercent, 'impliedVolatilityPercent') / 100;
  const rate = num(assumptions.riskFreeRatePercent, 'riskFreeRatePercent') / 100;
  const dividendYield = num(assumptions.dividendYieldPercent, 'dividendYieldPercent') / 100;

  const legs = legsInput.map((input, index): Leg => {
    if (!Number.isInteger(input.lots) || input.lots < 1) throw DomainError.validation('LAB_INVALID_LOTS', 'Lots must be a whole number of at least 1');
    if (!Number.isInteger(input.lotSize) || input.lotSize < 1) throw DomainError.validation('LAB_INVALID_LOT_SIZE', 'Lot size must be a whole number of at least 1');
    const isOption = input.kind === 'CALL' || input.kind === 'PUT';
    if (isOption && (input.strike === null || input.strike === undefined)) {
      throw DomainError.validation('LAB_STRIKE_REQUIRED', 'An option leg needs a strike');
    }
    if (isOption && !input.expiry) throw DomainError.validation('LAB_EXPIRY_REQUIRED', 'An option leg needs an expiry');
    const strike = isOption ? num(input.strike as string, 'strike') : 0;
    if (isOption && strike <= 0) throw DomainError.validation('LAB_INVALID_STRIKE', 'Strike must be above zero');
    const vol = input.impliedVolatilityPercent === null || input.impliedVolatilityPercent === undefined
      ? defaultVol
      : num(input.impliedVolatilityPercent, 'impliedVolatilityPercent') / 100;
    return {
      input,
      index,
      direction: input.action === 'BUY' ? 1 : -1,
      quantity: input.lots * input.lotSize,
      strike,
      premium: num(input.premium, 'premium'),
      volatility: vol,
      expiry: input.kind === 'UNDERLYING' ? null : (input.expiry ?? null),
    };
  });

  const expiries = legs.map((leg) => leg.expiry).filter((value): value is string => value !== null).sort();
  const terminal = expiries[0] ?? null;
  return {
    assumptions,
    spot,
    rate,
    dividendYield,
    defaultVol,
    legs,
    terminal,
    singleExpiry: terminal === null || expiries.every((expiry) => expiry === terminal),
  };
}

/** Per-unit model value of a leg, for an underlying price at a valuation date. */
function legValue(leg: Leg, ctx: Context, underlying: number, valuationDate: string): number {
  if (leg.input.kind === 'UNDERLYING' || leg.input.kind === 'FUTURE') return underlying;
  const right = leg.input.kind === 'CALL' ? 'CE' : 'PE';
  const timeYears = leg.expiry ? yearsBetween(valuationDate, leg.expiry) : 0;
  if (timeYears <= 0) return intrinsicValue(underlying, leg.strike, right);
  return optionPrice({
    spot: underlying,
    strike: leg.strike,
    timeYears,
    rate: ctx.rate,
    dividendYield: ctx.dividendYield,
    volatility: leg.volatility,
    right,
  });
}

/** Profit of the whole structure at an underlying price, valued on `valuationDate`. */
function profitAt(ctx: Context, underlying: number, valuationDate: string): number {
  let total = 0;
  for (const leg of ctx.legs) total += (legValue(leg, ctx, underlying, valuationDate) - leg.premium) * leg.quantity * leg.direction;
  return total;
}

/** Profit at the nearest expiry. Longer-dated legs keep their remaining time value. */
const profitAtTerminal = (ctx: Context, underlying: number): number =>
  profitAt(ctx, underlying, ctx.terminal ?? ctx.assumptions.asOf);

/**
 * Slope of the expiry payoff as the underlying runs to infinity: every long call and every
 * long future or share adds a lot, every short one subtracts. Puts are worthless up there.
 */
function slopeAtInfinity(ctx: Context): number {
  let slope = 0;
  for (const leg of ctx.legs) {
    if (leg.input.kind === 'CALL' || leg.input.kind === 'FUTURE' || leg.input.kind === 'UNDERLYING') slope += leg.quantity * leg.direction;
  }
  return slope;
}

function chartRange(ctx: Context): { low: number; high: number } {
  const strikes = ctx.legs.filter((leg) => leg.input.kind === 'CALL' || leg.input.kind === 'PUT').map((leg) => leg.strike);
  const years = ctx.terminal ? Math.max(yearsBetween(ctx.assumptions.asOf, ctx.terminal), 1 / 365) : 1 / 365;
  const sigma = ctx.spot * ctx.defaultVol * Math.sqrt(years);
  let low = Math.min(ctx.spot - 3 * sigma, ...strikes, ctx.spot);
  let high = Math.max(ctx.spot + 3 * sigma, ...strikes, ctx.spot);
  const pad = Math.max((high - low) * 0.15, ctx.spot * 0.05);
  low = Math.max(ctx.spot * 0.01, low - pad);
  high = high + pad;
  return { low, high };
}

/** The grid every search runs on: evenly spaced, with every strike and zero folded in. */
function scanGrid(ctx: Context, range: { low: number; high: number }): number[] {
  const points = new Set<number>([0, range.low, range.high]);
  for (let i = 0; i < GRID_POINTS; i += 1) points.add(range.low + ((range.high - range.low) * i) / (GRID_POINTS - 1));
  for (const leg of ctx.legs) {
    if (leg.input.kind === 'CALL' || leg.input.kind === 'PUT') {
      points.add(leg.strike);
      // Just either side of a kink, so a max sitting exactly on a strike is caught cleanly.
      points.add(leg.strike * (1 - 1e-9));
      points.add(leg.strike * (1 + 1e-9));
    }
  }
  return [...points].filter((value) => value >= 0).sort((a, b) => a - b);
}

/** Underlying prices where the expiry profit crosses zero. */
function findBreakevens(ctx: Context, grid: number[]): number[] {
  const found: number[] = [];
  for (let i = 1; i < grid.length; i += 1) {
    const [a, b] = [grid[i - 1], grid[i]];
    const [fa, fb] = [profitAtTerminal(ctx, a), profitAtTerminal(ctx, b)];
    if (fa === 0) found.push(a);
    if (fa === 0 || fb === 0 || fa * fb > 0) continue;
    let lo = a;
    let hi = b;
    let flo = fa;
    for (let step = 0; step < BISECTION_STEPS && hi - lo > 1e-9; step += 1) {
      const mid = (lo + hi) / 2;
      const fm = profitAtTerminal(ctx, mid);
      if (flo * fm <= 0) hi = mid;
      else {
        lo = mid;
        flo = fm;
      }
    }
    found.push((lo + hi) / 2);
  }
  const last = grid[grid.length - 1];
  if (profitAtTerminal(ctx, last) === 0) found.push(last);
  // Round to the paisa before de-duplicating: two legs on one strike can produce two roots a
  // femto-rupee apart, and the user should see one breakeven.
  const unique: number[] = [];
  for (const value of found.sort((a, b) => a - b)) {
    if (unique.length === 0 || Math.abs(value - unique[unique.length - 1]) > 0.005) unique.push(value);
  }
  return unique;
}

function findExtremes(ctx: Context, grid: number[]): { maxProfit: PayoffExtreme; maxLoss: PayoffExtreme } {
  const slope = slopeAtInfinity(ctx);
  let best = { value: Number.NEGATIVE_INFINITY, at: grid[0] };
  let worst = { value: Number.POSITIVE_INFINITY, at: grid[0] };
  for (const point of grid) {
    const value = profitAtTerminal(ctx, point);
    if (value > best.value) best = { value, at: point };
    if (value < worst.value) worst = { value, at: point };
  }
  const profitUnlimited = slope > 0;
  const lossUnlimited = slope < 0;
  return {
    maxProfit: {
      amount: profitUnlimited ? null : fmt(best.value),
      unlimited: profitUnlimited,
      atSpot: profitUnlimited ? null : fmt(best.at),
    },
    maxLoss: {
      amount: lossUnlimited ? null : fmt(worst.value),
      unlimited: lossUnlimited,
      atSpot: lossUnlimited ? null : fmt(worst.at),
    },
  };
}

/**
 * Chance the structure is above water at the nearest expiry, under the same lognormal the
 * pricing model assumes. It is an estimate of a model, not a forecast: it uses the
 * risk-neutral drift (r − q), so it says what the option prices imply rather than what the
 * user believes. A directional view would change it completely.
 */
function probabilityOfProfit(ctx: Context, breakevens: number[], range: { low: number; high: number }): ProbabilityEstimate | null {
  if (!ctx.terminal) return null;
  const years = yearsBetween(ctx.assumptions.asOf, ctx.terminal);
  if (years <= 0 || ctx.defaultVol <= 0) return null;
  const cdf = (level: number) => lognormalCdf(level, ctx.spot, years, ctx.rate, ctx.dividendYield, ctx.defaultVol);
  const bounds = [0, ...breakevens, Number.POSITIVE_INFINITY];
  let probability = 0;
  for (let i = 1; i < bounds.length; i += 1) {
    const lo = bounds[i - 1];
    const hi = bounds[i];
    const probe = Number.isFinite(hi) ? (lo + hi) / 2 : Math.max(lo * 1.25, range.high, lo + 1);
    if (profitAtTerminal(ctx, probe) <= 0) continue;
    probability += (Number.isFinite(hi) ? cdf(hi) : 1) - cdf(lo);
  }
  return {
    percent: fmt(Math.min(Math.max(probability, 0), 1) * 100),
    method: `Lognormal terminal distribution at ${ctx.terminal}: drift r − q = ${fmt((ctx.rate - ctx.dividendYield) * 100)}% a year, volatility ${ctx.assumptions.impliedVolatilityPercent}%, ACT/365.`,
    caveat:
      'An estimate from a model, not a forecast. It assumes the volatility you entered is right, that returns are lognormal (real markets have fatter tails) and that you hold to expiry. It ignores how much you might win or lose — a 90% chance of a small gain can still be a bad trade.',
  };
}

// ---- margin ----

export interface MarginOptions {
  /** Percent of notional held against a naked short leg. */
  nakedPercentOfNotional: string;
  /** Percent of notional still held when the risk is defined by a long leg. */
  hedgedPercentOfNotional: string;
}

export const DEFAULT_MARGIN_OPTIONS: MarginOptions = { nakedPercentOfNotional: '15', hedgedPercentOfNotional: '3' };

/**
 * A deliberately transparent stand-in for SPAN + exposure.
 *
 * The real number comes from the exchange's own risk arrays, published intraday, and there is
 * no way to reproduce them offline — so rather than pretend, this uses a rule anyone can check
 * by hand: a flat percentage of the short legs' notional, reduced to a much smaller percentage
 * when the structure's loss is bounded (a long leg caps it), plus any premium you actually pay
 * out. It will be in the right order of magnitude for an index spread and can be well out for
 * a stock option or a far-dated leg.
 */
function estimateMargin(ctx: Context, maxLoss: PayoffExtreme, options: MarginOptions): MarginEstimate {
  const nakedPercent = num(options.nakedPercentOfNotional, 'nakedPercentOfNotional') / 100;
  const hedgedPercent = num(options.hedgedPercentOfNotional, 'hedgedPercentOfNotional') / 100;
  let shortNotional = 0;
  let premiumDebit = 0;
  let premiumCredit = 0;
  for (const leg of ctx.legs) {
    const reference = leg.input.kind === 'CALL' || leg.input.kind === 'PUT' ? leg.strike : num(leg.input.premium, 'premium');
    if (leg.direction === -1) shortNotional += reference * leg.quantity;
    const cash = leg.premium * leg.quantity;
    if (leg.input.kind === 'CALL' || leg.input.kind === 'PUT') {
      if (leg.direction === 1) premiumDebit += cash;
      else premiumCredit += cash;
    }
  }

  const gross = shortNotional * nakedPercent;
  const defined = !maxLoss.unlimited && maxLoss.amount !== null;
  // With defined risk the margin cannot sensibly exceed the most you can lose, but the
  // exchange still holds something against the short leg, so keep a floor.
  const hedged = defined ? Math.max(Math.abs(Number(maxLoss.amount)), shortNotional * hedgedPercent) : gross;
  const shortLegMargin = gross;
  const hedgeCredit = Math.max(gross - hedged, 0);
  const total = Math.max(gross - hedgeCredit, 0) + premiumDebit;

  return {
    total: fmt(total),
    premiumDebit: fmt(premiumDebit),
    shortLegMargin: fmt(shortLegMargin),
    hedgeCredit: fmt(hedgeCredit),
    shortNotional: fmt(shortNotional),
    method: defined
      ? `Defined-risk structure: the larger of the worst-case loss and ${options.hedgedPercentOfNotional}% of short notional, plus the ${fmt(premiumDebit)} premium you pay out. Premium received of ${fmt(premiumCredit)} is not netted off.`
      : `Undefined risk: ${options.nakedPercentOfNotional}% of the ${fmt(shortNotional)} short notional, plus the ${fmt(premiumDebit)} premium you pay out.`,
    disclaimer: MARGIN_DISCLAIMER,
  };
}

// ---- Greeks ----

function legGreeks(leg: Leg, ctx: Context): GreekSet {
  if (leg.input.kind === 'UNDERLYING' || leg.input.kind === 'FUTURE') {
    // A future or a share has a delta of one per unit and no other sensitivity worth modelling
    // here; the small rate sensitivity of a futures position is left out on purpose.
    return { delta: 1, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  return optionGreeks({
    spot: ctx.spot,
    strike: leg.strike,
    timeYears: leg.expiry ? yearsBetween(ctx.assumptions.asOf, leg.expiry) : 0,
    rate: ctx.rate,
    dividendYield: ctx.dividendYield,
    volatility: leg.volatility,
    right: leg.input.kind === 'CALL' ? 'CE' : 'PE',
  });
}

const scaleGreeks = (greeks: GreekSet, factor: number): Greeks => ({
  delta: fmt(greeks.delta * factor, 4),
  gamma: fmt(greeks.gamma * factor, 6),
  theta: fmt(greeks.theta * factor),
  vega: fmt(greeks.vega * factor),
  rho: fmt(greeks.rho * factor),
});

const addGreeks = (a: GreekSet, b: GreekSet): GreekSet => ({
  delta: a.delta + b.delta,
  gamma: a.gamma + b.gamma,
  theta: a.theta + b.theta,
  vega: a.vega + b.vega,
  rho: a.rho + b.rho,
});

function analyseLeg(leg: Leg, ctx: Context): LegAnalysis {
  const signedQuantity = leg.quantity * leg.direction;
  const perUnit = legGreeks(leg, ctx);
  const timeYears = leg.expiry ? yearsBetween(ctx.assumptions.asOf, leg.expiry) : 0;
  const modelled = leg.input.kind === 'UNDERLYING' || leg.input.kind === 'FUTURE' ? ctx.spot : legValue(leg, ctx, ctx.spot, ctx.assumptions.asOf);
  return {
    index: leg.index,
    label: leg.input.label ?? defaultLabel(leg),
    kind: leg.input.kind,
    action: leg.input.action,
    lots: leg.input.lots,
    lotSize: leg.input.lotSize,
    quantity: leg.quantity,
    strike: leg.input.kind === 'CALL' || leg.input.kind === 'PUT' ? fmt(leg.strike) : null,
    expiry: leg.expiry,
    timeToExpiryYears: fmt(timeYears, 6),
    impliedVolatilityPercent: fmt(leg.volatility * 100),
    premium: fmt(leg.premium),
    theoreticalValue: fmt(modelled),
    unrealisedByModel: fmt((modelled - leg.premium) * signedQuantity),
    cashflow: fmt(-leg.premium * signedQuantity),
    greeks: scaleGreeks(perUnit, signedQuantity),
  };
}

function defaultLabel(leg: Leg): string {
  const verb = leg.input.action === 'BUY' ? 'Long' : 'Short';
  if (leg.input.kind === 'UNDERLYING') return `${verb} underlying`;
  if (leg.input.kind === 'FUTURE') return `${verb} future`;
  return `${verb} ${fmt(leg.strike, 0)} ${leg.input.kind === 'CALL' ? 'CE' : 'PE'}`;
}

// ---- entry point ----

export interface PayoffOptions {
  margin?: MarginOptions;
}

/** The whole report for a structure: legs, Greeks, breakevens, extremes, curve and margin. */
export function analyseStrategy(legs: StrategyLeg[], assumptions: MarketAssumptions, options: PayoffOptions = {}): PayoffReport {
  const ctx = buildContext(legs, assumptions);
  const range = chartRange(ctx);
  const grid = scanGrid(ctx, range);
  const breakevens = findBreakevens(ctx, grid);
  const { maxProfit, maxLoss } = findExtremes(ctx, grid);
  const analyses = ctx.legs.map((leg) => analyseLeg(leg, ctx));

  const netGreeksRaw = ctx.legs.reduce<GreekSet>(
    (total, leg) => addGreeks(total, scaleRaw(legGreeks(leg, ctx), leg.quantity * leg.direction)),
    { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
  );

  const series: PayoffPoint[] = [];
  for (let i = 0; i < SERIES_POINTS; i += 1) {
    const underlying = range.low + ((range.high - range.low) * i) / (SERIES_POINTS - 1);
    series.push({
      spot: fmt(underlying),
      atExpiry: fmt(profitAtTerminal(ctx, underlying)),
      today: fmt(profitAt(ctx, underlying, assumptions.asOf)),
    });
  }

  return {
    assumptions,
    legs: analyses,
    netCashflow: fmt(analyses.reduce((total, leg) => total + Number(leg.cashflow), 0)),
    netGreeks: scaleGreeks(netGreeksRaw, 1),
    breakevens: breakevens.map((value) => fmt(value)),
    maxProfit,
    maxLoss,
    series,
    range: { low: fmt(range.low), high: fmt(range.high) },
    probabilityOfProfit: probabilityOfProfit(ctx, breakevens, range),
    margin: estimateMargin(ctx, maxLoss, options.margin ?? DEFAULT_MARGIN_OPTIONS),
    disclaimer: LAB_DISCLAIMER,
  };
}

const scaleRaw = (greeks: GreekSet, factor: number): GreekSet => ({
  delta: greeks.delta * factor,
  gamma: greeks.gamma * factor,
  theta: greeks.theta * factor,
  vega: greeks.vega * factor,
  rho: greeks.rho * factor,
});

/** Just the Greeks, for the panel that updates as a leg is edited. */
export function strategyGreeks(legs: StrategyLeg[], assumptions: MarketAssumptions): { legs: LegAnalysis[]; net: Greeks; disclaimer: string } {
  const ctx = buildContext(legs, assumptions);
  const analyses = ctx.legs.map((leg) => analyseLeg(leg, ctx));
  const net = ctx.legs.reduce<GreekSet>((total, leg) => addGreeks(total, scaleRaw(legGreeks(leg, ctx), leg.quantity * leg.direction)), {
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0,
  });
  return { legs: analyses, net: scaleGreeks(net, 1), disclaimer: LAB_DISCLAIMER };
}

export interface ImpliedVolatilityRequest {
  spot: string;
  strike: string;
  expiry: string;
  asOf: string;
  right: 'CE' | 'PE';
  /** The premium actually observed in the market. */
  premium: string;
  riskFreeRatePercent: string;
  dividendYieldPercent: string;
}

export interface ImpliedVolatilityReport {
  impliedVolatilityPercent: string | null;
  status: string;
  message: string;
  iterations: number;
  /** How far the model price is from the premium at the answer. */
  residual: string;
  daysToExpiry: number;
  intrinsicValue: string;
  timeValue: string;
  greeks: Greeks | null;
  method: string;
  disclaimer: string;
}

const IV_MESSAGES: Record<string, string> = {
  SOLVED: 'Solved.',
  BELOW_INTRINSIC: 'That premium is below the option’s intrinsic value, so no volatility can produce it. Check the spot, the strike or the price.',
  ABOVE_BOUND: 'That premium is above what the model can produce even at 1000% volatility. Check the inputs.',
  NO_CONVERGENCE: 'The solver ran out of iterations without getting inside the tolerance. The answer shown is the closest it reached.',
  EXPIRED: 'The contract has no time left, so it has no implied volatility — only intrinsic value.',
};

/** Backs out the volatility a quoted premium implies. */
export function solveImpliedVolatility(request: ImpliedVolatilityRequest): ImpliedVolatilityReport {
  const spot = num(request.spot, 'spot');
  const strike = num(request.strike, 'strike');
  const premium = num(request.premium, 'premium');
  const timeYears = yearsBetween(request.asOf, request.expiry);
  const rate = num(request.riskFreeRatePercent, 'riskFreeRatePercent') / 100;
  const dividendYield = num(request.dividendYieldPercent, 'dividendYieldPercent') / 100;
  const inputs = { spot, strike, timeYears, rate, dividendYield, right: request.right };
  const solved = impliedVolatility(premium, inputs);
  const intrinsic = intrinsicValue(spot, strike, request.right);
  return {
    impliedVolatilityPercent: solved.volatility === null ? null : fmt(solved.volatility * 100),
    status: solved.status,
    message: IV_MESSAGES[solved.status] ?? 'Unknown solver state.',
    iterations: solved.iterations,
    residual: Number.isFinite(solved.residual) ? fmt(solved.residual, 4) : '0',
    daysToExpiry: calendarDaysTo(request.asOf, request.expiry),
    intrinsicValue: fmt(intrinsic),
    timeValue: fmt(premium - intrinsic),
    greeks:
      solved.volatility === null
        ? null
        : scaleGreeks(optionGreeks({ ...inputs, volatility: solved.volatility }), 1),
    method:
      'Black–Scholes–Merton, European, ACT/365, continuous dividend yield. Newton–Raphson guarded by bisection on [0.01%, 1000%], stopping when the model price is within ₹0.005 of the premium or the bracket is under 1e-8, capped at 100 iterations.',
    disclaimer: LAB_DISCLAIMER,
  };
}
