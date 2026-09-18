/*
 * Money-weighted return (XIRR) on dated cashflows.
 *
 * Convention: a cashflow is negative when money leaves the investor (a purchase) and
 * positive when it comes back (a redemption, a dividend, or the closing market value on the
 * valuation date). Days are actual days divided by 365, matching the Excel/LibreOffice XIRR
 * most Indian statements are checked against.
 *
 * Solver: Newton–Raphson from a 10% guess, falling back to bisection over
 * [-0.9999, 100] (that is −99.99% to +10000% a year) when Newton leaves the bracket,
 * stalls on a flat derivative, or fails to converge.
 *
 * Tolerances: the root is accepted when |NPV| < 1e-7 of the gross invested amount, or when
 * two successive rates differ by less than 1e-9. Both solvers stop after MAX_ITERATIONS.
 * The result is rounded to 4 decimal places of a fraction (0.1234 = 12.34%), which is one
 * more digit than anything we display.
 */

export interface Cashflow {
  /** YYYY-MM-DD. */
  date: string;
  /** Exact decimal string, signed: negative out of pocket, positive received. */
  amount: string;
}

const DAY_MS = 86_400_000;
export const XIRR_MAX_ITERATIONS = 120;
export const XIRR_RATE_TOLERANCE = 1e-9;
export const XIRR_RELATIVE_NPV_TOLERANCE = 1e-7;
const RATE_FLOOR = -0.9999;
const RATE_CEILING = 100;

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

interface Flow {
  years: number;
  amount: number;
}

function prepare(cashflows: Cashflow[]): { flows: Flow[]; scale: number } | null {
  if (cashflows.length < 2) return null;
  const sorted = [...cashflows].sort((a, b) => a.date.localeCompare(b.date));
  const start = dayNumber(sorted[0].date);
  let negative = false;
  let positive = false;
  let scale = 0;
  const flows: Flow[] = [];
  for (const flow of sorted) {
    const amount = Number(flow.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (amount < 0) negative = true;
    else positive = true;
    scale += Math.abs(amount);
    flows.push({ years: (dayNumber(flow.date) - start) / 365, amount });
  }
  // A sign change is required; without one the NPV never crosses zero.
  if (!negative || !positive || flows.length < 2) return null;
  return { flows, scale };
}

const npv = (flows: Flow[], rate: number) => flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** f.years, 0);

const dNpv = (flows: Flow[], rate: number) =>
  flows.reduce((sum, f) => sum - (f.years * f.amount) / (1 + rate) ** (f.years + 1), 0);

/**
 * The annualised money-weighted return as a fraction (0.1234 = 12.34%), or null when the
 * cashflows cannot produce one (fewer than two flows, or no sign change) or nothing converges.
 */
export function xirr(cashflows: Cashflow[], guess = 0.1): number | null {
  const prepared = prepare(cashflows);
  if (!prepared) return null;
  const { flows, scale } = prepared;
  const npvTolerance = Math.max(scale * XIRR_RELATIVE_NPV_TOLERANCE, 1e-9);

  let rate = guess;
  for (let i = 0; i < XIRR_MAX_ITERATIONS; i++) {
    const value = npv(flows, rate);
    if (!Number.isFinite(value)) break;
    if (Math.abs(value) < npvTolerance) return round(rate);
    const slope = dNpv(flows, rate);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= RATE_FLOOR || next >= RATE_CEILING) break;
    if (Math.abs(next - rate) < XIRR_RATE_TOLERANCE) return round(next);
    rate = next;
  }
  return bisect(flows, npvTolerance);
}

function bisect(flows: Flow[], npvTolerance: number): number | null {
  let low = RATE_FLOOR;
  let high = RATE_CEILING;
  let lowValue = npv(flows, low);
  let highValue = npv(flows, high);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return null;
  for (let i = 0; i < XIRR_MAX_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const value = npv(flows, mid);
    if (Math.abs(value) < npvTolerance || (high - low) / 2 < XIRR_RATE_TOLERANCE) return round(mid);
    if (lowValue * value <= 0) {
      high = mid;
      highValue = value;
    } else {
      low = mid;
      lowValue = value;
    }
  }
  return round((low + high) / 2);
}

const round = (rate: number) => Math.round(rate * 1e6) / 1e6;

/** XIRR as a percentage with two decimals (12.34), or null. */
export function xirrPercent(cashflows: Cashflow[]): number | null {
  const rate = xirr(cashflows);
  return rate === null ? null : Math.round(rate * 10_000) / 100;
}
