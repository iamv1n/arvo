import { DomainError } from '../errors';
import { fmt } from './payoff';
import { LAB_DISCLAIMER, type KellyExplainer, type RiskOfRuinInput, type RiskOfRuinResult, type SizingInput, type SizingResult } from './types';

/*
 * Position sizing and ruin arithmetic.
 *
 * All of this is textbook and deterministic: the same inputs give the same answer every time,
 * with no simulation and no randomness. That matters because the whole point of the section is
 * to let someone check a number they half-remember.
 *
 * Level 1, education. It tells you how big a position your own stated risk budget implies; it
 * never tells you which instrument to take it in, or whether to take one at all.
 */

const num = (value: string, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw DomainError.validation('LAB_INVALID_NUMBER', `${field} must be a number`, { value });
  return parsed;
};

/**
 * Fixed-fractional and fixed-risk sizing.
 *
 * Both answer the same question — how many units can I hold such that being stopped out costs
 * no more than my risk budget — and differ only in where the budget comes from: a percentage
 * of capital, or a flat number. Quantity is floored to whole lots, because a part lot cannot
 * be traded, and that rounding is why the risk you actually carry is usually a little under
 * the budget rather than exactly on it.
 */
export function calculateSizing(input: SizingInput): SizingResult {
  const capital = num(input.capital, 'capital');
  if (capital <= 0) throw DomainError.validation('LAB_INVALID_CAPITAL', 'Capital must be above zero');
  const entry = num(input.entryPrice, 'entryPrice');
  const stop = num(input.stopPrice, 'stopPrice');
  if (entry <= 0) throw DomainError.validation('LAB_INVALID_PRICE', 'The entry price must be above zero');
  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) throw DomainError.validation('LAB_STOP_AT_ENTRY', 'The stop has to be away from the entry, or the size is unbounded');
  if (!Number.isInteger(input.lotSize) || input.lotSize < 1) {
    throw DomainError.validation('LAB_INVALID_LOT_SIZE', 'Lot size must be a whole number of at least 1');
  }

  const explicitRisk = input.riskAmount === null || input.riskAmount === '' ? null : num(input.riskAmount, 'riskAmount');
  const method = explicitRisk === null ? 'FIXED_FRACTIONAL' : 'FIXED_RISK';
  const riskPercent = explicitRisk === null ? num(input.riskPercent, 'riskPercent') : (explicitRisk / capital) * 100;
  const riskPerTrade = explicitRisk ?? (capital * num(input.riskPercent, 'riskPercent')) / 100;
  if (riskPerTrade <= 0) throw DomainError.validation('LAB_INVALID_RISK', 'The risk per trade must be above zero');

  const rawUnits = riskPerTrade / stopDistance;
  const lots = Math.floor(rawUnits / input.lotSize);
  const quantity = lots * input.lotSize;
  const positionValue = quantity * entry;
  const riskAtStop = quantity * stopDistance;
  const target = input.targetPrice === null || input.targetPrice === '' ? null : num(input.targetPrice, 'targetPrice');

  const notes: string[] = [];
  if (quantity === 0) {
    notes.push(
      `One lot of ${input.lotSize} would risk ${fmt(input.lotSize * stopDistance)} at this stop, which is more than the ${fmt(riskPerTrade)} budget. The smallest tradeable size is already too big.`,
    );
  }
  if (positionValue > capital) {
    notes.push(`This position is worth ${fmt(positionValue)} against ${fmt(capital)} of capital, so it needs leverage or margin.`);
  }
  if (riskPercent > 5) {
    notes.push(`Risking ${fmt(riskPercent)}% of capital on one trade is far above the 1–2% most position-sizing literature uses. See the risk-of-ruin figure.`);
  }

  return {
    method,
    capital: fmt(capital),
    riskPerTrade: fmt(riskPerTrade),
    riskPercentOfCapital: fmt(riskPercent),
    stopDistance: fmt(stopDistance),
    quantity,
    lots,
    positionValue: fmt(positionValue),
    exposurePercent: fmt((positionValue / capital) * 100),
    riskAtStop: fmt(riskAtStop),
    rewardToRisk: target === null ? null : fmt(Math.abs(target - entry) / stopDistance, 2),
    notes,
    disclaimer: LAB_DISCLAIMER,
  };
}

/**
 * The Kelly fraction for a two-outcome bet: f* = W − (1 − W) / R.
 *
 * Kelly maximises the long-run growth rate of capital, which is not the same as being a
 * sensible amount to bet. It assumes the win rate and payoff ratio are known exactly, and it
 * accepts drawdowns most people cannot sit through — full Kelly spends about half its time
 * more than 50% below its own high-water mark. Overestimating the edge by a little makes the
 * "optimal" size ruinous, and that is why the fractions are shown next to it.
 */
export function kellyExplainer(winRatePercent: number, payoffRatio: number): KellyExplainer {
  const win = winRatePercent / 100;
  const full = payoffRatio > 0 ? win - (1 - win) / payoffRatio : -1;
  return {
    fullKellyPercent: fmt(full * 100),
    halfKellyPercent: fmt(Math.max(full, 0) * 50),
    quarterKellyPercent: fmt(Math.max(full, 0) * 25),
    warning:
      full <= 0
        ? 'Kelly is negative here, which is the formula’s way of saying this edge loses money. No position size fixes a negative expectancy.'
        : 'Kelly assumes you know your win rate and payoff ratio exactly. You do not — they are estimates from a finite sample. Betting full Kelly on an edge you have overestimated is how accounts die, so practitioners who use it at all use a half or a quarter. It is an explainer, not a size to trade.',
  };
}

const ROR_BISECTION_STEPS = 200;

/**
 * Risk of ruin for a fixed-fractional trader.
 *
 * The classical gambler's-ruin result generalises to unequal payoffs through the Lundberg
 * equation: find the z > 1 that solves W·z^(−R) + (1 − W)·z = 1, where R is the payoff ratio
 * in units of the amount risked. The probability of ever falling to the ruin level is then
 * z^(−N), with N the number of whole risk units between the starting capital and that level.
 *
 * Read it as an order of magnitude, not a probability you can act on. It assumes every trade
 * risks the same fraction, that trades are independent (they are not — losses cluster), and
 * that the win rate and payoff ratio hold forever. A positive expectancy gives a number below
 * 100%; a negative one gives certainty, because a losing edge repeated long enough always ends
 * the same way.
 */
export function riskOfRuin(input: RiskOfRuinInput): RiskOfRuinResult {
  const winRate = num(input.winRatePercent, 'winRatePercent');
  const payoffRatio = num(input.payoffRatio, 'payoffRatio');
  const riskPercent = num(input.riskPercent, 'riskPercent');
  const ruinPercent = num(input.ruinDrawdownPercent, 'ruinDrawdownPercent');
  if (winRate < 0 || winRate > 100) throw DomainError.validation('LAB_INVALID_WIN_RATE', 'The win rate must be between 0 and 100');
  if (payoffRatio <= 0) throw DomainError.validation('LAB_INVALID_PAYOFF_RATIO', 'The payoff ratio must be above zero');
  if (riskPercent <= 0 || riskPercent > 100) throw DomainError.validation('LAB_INVALID_RISK', 'Risk per trade must be between 0 and 100 percent');
  if (ruinPercent <= 0 || ruinPercent > 100) throw DomainError.validation('LAB_INVALID_RUIN_LEVEL', 'The ruin drawdown must be between 0 and 100 percent');

  const win = winRate / 100;
  const expectancy = win * payoffRatio - (1 - win);
  const units = ruinPercent / riskPercent;
  const kelly = kellyExplainer(winRate, payoffRatio);

  let percent: number;
  if (expectancy <= 0) {
    percent = 100;
  } else {
    // f(z) = W·z^(−R) + (1 − W)·z − 1 is zero at z = 1 and, with positive expectancy, has one
    // more root above 1. Bisect for it between just above 1 and a generous ceiling.
    const f = (z: number) => win * Math.pow(z, -payoffRatio) + (1 - win) * z - 1;
    let lo = 1 + 1e-12;
    let hi = 2;
    while (f(hi) < 0 && hi < 1e6) hi *= 2;
    for (let i = 0; i < ROR_BISECTION_STEPS && hi - lo > 1e-14; i += 1) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid;
      else lo = mid;
    }
    const z = (lo + hi) / 2;
    percent = z > 1 ? Math.min(Math.pow(z, -units), 1) * 100 : 100;
  }

  return {
    percent: fmt(Math.max(percent, 0), 6),
    expectancyR: fmt(expectancy, 4),
    unitsOfRisk: fmt(units, 2),
    kelly,
    method:
      'Lundberg equation for a fixed-fractional bettor: solve W·z^(−R) + (1−W)·z = 1 for z > 1, then ruin probability = z^(−N) where N is the ruin drawdown divided by the risk per trade. Bisection to 1e-14.',
    disclaimer:
      'An idealised model. It assumes a constant edge, identical risk on every trade and independent outcomes — none of which hold in real trading, where losing runs cluster and edges decay. Treat it as an argument for smaller size, not as a forecast.',
  };
}
