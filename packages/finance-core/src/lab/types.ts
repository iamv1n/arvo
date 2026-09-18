import type { ChargeBreakdown, TradeExchange, TradeSegment } from '../trading/types';

/*
 * Strategy Lab domain — education and simulation only.
 *
 * Advice level 1–2. Nothing in this module looks at a live market, places an order, or says
 * that a particular contract is worth buying. It prices hypothetical structures the user has
 * typed in, and replays imported bars against rules the user has written. Every result is
 * labelled as a model output.
 *
 * Money vs models. The ledger side of Arvo is exact decimal arithmetic (money.ts, bigint at
 * 1/10000). Option pricing is not exact arithmetic: Black–Scholes is a continuous model whose
 * inputs (volatility, the risk-free rate) are themselves estimates, and an implied-volatility
 * solve is iterative. So the pricing layer works in IEEE doubles and formats to two decimals
 * at the boundary. That is deliberate, and it is why a payoff number is never written into the
 * ledger: it is a projection, not a transaction. Anywhere a lab result meets real money —
 * backtest charges, paper-trade fills — the Phase 11 charges engine does the arithmetic in
 * exact units and the lab only passes values through it.
 */

/** Shown wherever a lab figure could be mistaken for a suggestion. */
export const LAB_DISCLAIMER =
  'Educational simulation, not investment advice. These numbers come from a model applied to inputs you chose; they are not a forecast, not a recommendation, and Arvo never places an order.';

/** Shown next to every margin figure. */
export const MARGIN_DISCLAIMER =
  'Rough estimate only. Real margin is set by the exchange SPAN + exposure files, which change every day and cannot be computed offline. Check the actual requirement with your broker before you rely on this.';

/** Shown next to every backtest result. */
export const BACKTEST_DISCLAIMER =
  'A simulation over historical bars you imported. Fills are assumed, not observed: real slippage, liquidity, gaps and rejections are not in here. Past performance says nothing about future results.';

// ---- option structures ----

/** What one leg of a structure is. `UNDERLYING` is cash equity or an index basket. */
export type LegKind = 'CALL' | 'PUT' | 'FUTURE' | 'UNDERLYING';
export type LegAction = 'BUY' | 'SELL';

/**
 * One leg as the user typed it. Quantity is in whole lots so the UI can speak the language the
 * exchange does; the engine multiplies by `lotSize` to get units.
 */
export interface StrategyLeg {
  kind: LegKind;
  action: LegAction;
  /** Whole lots. Must be at least 1. */
  lots: number;
  /** Contract multiplier. 1 for cash equity. */
  lotSize: number;
  /** Required for CALL and PUT; ignored otherwise. */
  strike: string | null;
  /** Premium per unit for options; the entry price for futures and underlying. */
  premium: string;
  /** Required for CALL, PUT and FUTURE. Drives time to expiry. */
  expiry: string | null;
  /** Annual implied volatility in percent for this leg. Falls back to the market default. */
  impliedVolatilityPercent: string | null;
  /** Optional free-text name shown in the UI, e.g. "short wing". */
  label: string | null;
}

/** Everything the model needs that is not a leg. Each field is the user's assumption. */
export interface MarketAssumptions {
  /** Spot price of the underlying. */
  spot: string;
  /** Valuation date, YYYY-MM-DD. Time to expiry is ACT/365 from here. */
  asOf: string;
  /** Annual continuously-compounded risk-free rate, percent. */
  riskFreeRatePercent: string;
  /** Annual continuous dividend yield, percent. Zero for index options in most Indian uses. */
  dividendYieldPercent: string;
  /** Annual volatility in percent used for any leg that has none of its own. */
  impliedVolatilityPercent: string;
}

export const DEFAULT_ASSUMPTIONS: Omit<MarketAssumptions, 'spot' | 'asOf'> = {
  riskFreeRatePercent: '6.5',
  dividendYieldPercent: '0',
  impliedVolatilityPercent: '14',
};

/** Per-unit sensitivities. Theta is per calendar day; vega per 1 volatility point; rho per 1% rate. */
export interface Greeks {
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  rho: string;
}

export const ZERO_GREEKS: Greeks = { delta: '0', gamma: '0', theta: '0', vega: '0', rho: '0' };

export interface LegAnalysis {
  index: number;
  label: string;
  kind: LegKind;
  action: LegAction;
  lots: number;
  lotSize: number;
  /** lots × lotSize, always positive. */
  quantity: number;
  strike: string | null;
  expiry: string | null;
  /** Years to expiry from `asOf`, ACT/365. Zero once the expiry date has arrived. */
  timeToExpiryYears: string;
  impliedVolatilityPercent: string;
  /** Premium the user typed, per unit. */
  premium: string;
  /** What the model says the leg is worth per unit right now. Null for a leg with no model. */
  theoreticalValue: string | null;
  /** (theoretical − premium) × quantity × direction. Null when there is no model value. */
  unrealisedByModel: string | null;
  /** Money paid (negative) or received (positive) to open this leg. */
  cashflow: string;
  /** Position Greeks: per-unit Greeks × quantity × direction. */
  greeks: Greeks;
}

/** One point of the payoff curve. */
export interface PayoffPoint {
  /** Underlying price at that point. */
  spot: string;
  /** Profit or loss for the whole structure held to expiry. */
  atExpiry: string;
  /** Profit or loss right now under the model. Null when no leg can be modelled. */
  today: string | null;
}

export interface PayoffExtreme {
  /** The amount. Null when the direction is unbounded. */
  amount: string | null;
  /** True when profit (or loss) keeps growing as the underlying moves. */
  unlimited: boolean;
  /** Spot at which the extreme occurs, when it is bounded and attained at a single point. */
  atSpot: string | null;
}

export interface MarginEstimate {
  /** The total the model thinks you need to have. */
  total: string;
  /** Premium paid out to open, counted as cash you must find. */
  premiumDebit: string;
  /** Margin attributed to short legs, before any hedge credit. */
  shortLegMargin: string;
  /** Reduction because the structure has defined risk. */
  hedgeCredit: string;
  /** Sum of |strike or spot| × quantity for the short legs. */
  shortNotional: string;
  method: string;
  disclaimer: string;
}

export interface PayoffReport {
  assumptions: MarketAssumptions;
  legs: LegAnalysis[];
  /** Net cash to open: negative is a debit you pay, positive a credit you receive. */
  netCashflow: string;
  /** Net position Greeks across the legs. */
  netGreeks: Greeks;
  /** Underlying prices where the expiry payoff crosses zero, ascending. */
  breakevens: string[];
  maxProfit: PayoffExtreme;
  maxLoss: PayoffExtreme;
  /** Payoff at expiry and, where modellable, today — for the chart. */
  series: PayoffPoint[];
  /** The spot range the series covers. */
  range: { low: string; high: string };
  probabilityOfProfit: ProbabilityEstimate | null;
  margin: MarginEstimate;
  disclaimer: string;
}

export interface ProbabilityEstimate {
  /** Chance the structure finishes above zero at the nearest expiry, 0–100. */
  percent: string;
  method: string;
  caveat: string;
}

// ---- futures ----

export interface FuturesCalculation {
  underlying: string;
  lots: number;
  lotSize: number;
  quantity: number;
  futuresPrice: string;
  spot: string;
  notional: string;
  /** Money gained or lost for a one-point move in the future. */
  mtmPerPoint: string;
  /** Mark-to-market against the entry price at the given mark. */
  mtm: string | null;
  margin: MarginEstimate;
  /** futures − spot. */
  basis: string;
  basisPercent: string;
  /** Basis annualised over the days to expiry, or null when expiry is not given. */
  annualisedBasisPercent: string | null;
  daysToExpiry: number | null;
  rollover: RolloverEstimate | null;
  /** Charges for opening and closing one round trip at these prices. */
  roundTripCharges: ChargeBreakdown;
  disclaimer: string;
}

export interface RolloverEstimate {
  nearPrice: string;
  farPrice: string;
  /** far − near, per unit. Positive means the roll costs a long holder. */
  spread: string;
  /** spread × quantity for a long; the sign flips for a short. */
  spreadCost: string;
  /** Charges of selling the near leg and buying the far leg. */
  charges: ChargeBreakdown;
  /** spreadCost + charges. */
  total: string;
}

export interface FuturesInput {
  underlying: string;
  segment: TradeSegment;
  exchange: TradeExchange;
  date: string;
  lots: number;
  lotSize: number;
  futuresPrice: string;
  spot: string;
  side: 'BUY' | 'SELL';
  expiry: string | null;
  /** Price to mark against, for the MTM figure. */
  markPrice: string | null;
  marginPercentOfNotional: string;
  rollover: { nearPrice: string; farPrice: string } | null;
}

// ---- position sizing and risk ----

export interface SizingInput {
  /** Trading capital. */
  capital: string;
  /** Percent of capital risked on one trade, for the fixed-fractional method. */
  riskPercent: string;
  /** A flat rupee risk per trade; when given it overrides `riskPercent`. */
  riskAmount: string | null;
  entryPrice: string;
  stopPrice: string;
  /** Contract multiplier; 1 for cash equity. */
  lotSize: number;
  /** Optional target, for the reward:risk figure. */
  targetPrice: string | null;
}

export interface SizingResult {
  method: 'FIXED_FRACTIONAL' | 'FIXED_RISK';
  capital: string;
  riskPerTrade: string;
  riskPercentOfCapital: string;
  /** |entry − stop| per unit. */
  stopDistance: string;
  /** Units the risk budget buys, floored. */
  quantity: number;
  /** Whole lots, floored. Equals quantity when lotSize is 1. */
  lots: number;
  /** quantity × entry. */
  positionValue: string;
  /** positionValue ÷ capital × 100. Above 100 means it needs leverage. */
  exposurePercent: string;
  /** What you actually lose at the stop with this quantity. */
  riskAtStop: string;
  rewardToRisk: string | null;
  notes: string[];
  disclaimer: string;
}

export interface RiskOfRuinInput {
  /** Share of trades that win, 0–100. */
  winRatePercent: string;
  /** Average win ÷ average loss. */
  payoffRatio: string;
  /** Percent of capital risked per trade. */
  riskPercent: string;
  /** Drawdown that counts as ruin, percent of capital. 100 means wiped out. */
  ruinDrawdownPercent: string;
}

export interface RiskOfRuinResult {
  /** Chance of hitting the ruin drawdown eventually, 0–100. */
  percent: string;
  /** Expected R per trade. Negative means ruin is certain over enough trades. */
  expectancyR: string;
  /** How many losing "risk units" of capital there are before ruin. */
  unitsOfRisk: string;
  kelly: KellyExplainer;
  method: string;
  disclaimer: string;
}

export interface KellyExplainer {
  /** The full-Kelly fraction of capital, percent. Negative when the edge is negative. */
  fullKellyPercent: string;
  /** Half Kelly, the fraction most practitioners actually use. */
  halfKellyPercent: string;
  /** Quarter Kelly. */
  quarterKellyPercent: string;
  warning: string;
}
