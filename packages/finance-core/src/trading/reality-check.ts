import { formatMoney, parseMoney, roundToCents } from '../money';
import { financialYearOf, financialYearRange } from '../portfolio/capital-gains';
import type { BenchmarkPointRecord } from '../portfolio/types';
import type { TradePosition } from './positions';
import { isDerivativeSegment } from './types';

/*
 * The reality check.
 *
 * One question, asked once a year: what did the money actually do, compared with leaving the
 * same amount alone? It exists because active traders rarely compute it, not because the
 * answer is expected to go one way. Some years it will favour the trading.
 *
 * The honest difficulty is "the same amount". A derivatives trader never has the notional
 * deployed; what is committed is margin, which brokers do not put in a tradebook. The proxy
 * used here is the peak capital at risk: the largest total entry value open on any one day of
 * the year. It is stated in the result and labelled as a proxy, because it will usually
 * overstate what an F&O trader had to fund and so understate the trading against the index.
 *
 * The index comparison uses an imported benchmark series when there is one — the same series
 * the portfolio module uses — and a configurable assumed return when there is not. Which of
 * the two produced the number is always said out loud.
 */

export interface RealityCheckInput {
  positions: TradePosition[];
  /** Benchmark points from the portfolio module, when the user has imported a series. */
  benchmark?: { series: string; points: BenchmarkPointRecord[] } | null;
  assumedIndexReturnPercent: string;
  assumedFdRatePercent: string;
  asOf: string;
}

export interface RealityCheckYear {
  financialYear: string;
  from: string;
  to: string;
  trades: number;
  grossPnl: string;
  charges: string;
  /** Net result of the year's F&O and intraday round trips. */
  netPnl: string;
  /** Peak entry value open on any single day of the year. */
  capitalProxy: string;
  returnPercent: number | null;
  index: { source: 'SERIES' | 'ASSUMED'; label: string; returnPercent: number; value: string };
  fd: { ratePercent: string; value: string };
  /** Net P&L less what the index would have produced on the same capital. */
  differenceVsIndex: string;
  differenceVsFd: string;
}

export interface RealityCheck {
  asOf: string;
  years: RealityCheckYear[];
  total: { netPnl: string; index: string; fd: string; differenceVsIndex: string; differenceVsFd: string };
  method: string;
  disclaimer: string;
}

export const REALITY_CHECK_DISCLAIMER =
  'An estimate, and a rough one. Capital is taken as the largest amount you had committed on any single day, which is not the same as the margin you funded, and the alternatives assume the money sat untouched for the whole year. It is here to give a sense of scale, not to settle anything.';

export function realityCheck(input: RealityCheckInput): RealityCheck {
  const eligible = input.positions.filter(
    (p) => p.status === 'CLOSED' && p.closedAt && (isDerivativeSegment(p.segment) || p.segment === 'EQUITY_INTRADAY'),
  );
  const years = new Set(eligible.map((p) => financialYearOf(p.closedAt!)));

  const rows: RealityCheckYear[] = [];
  for (const financialYear of [...years].sort()) {
    const { from, to } = financialYearRange(financialYear);
    const inYear = eligible.filter((p) => p.closedAt! >= from && p.closedAt! <= to);
    const netPnl = inYear.reduce((sum, p) => sum + parseMoney(p.netPnl), 0n);
    const capital = peakCapital(inYear, from, to);

    const index = indexReturnFor(input, from, to);
    const indexValue = percentOf(capital, index.returnPercent);
    const fdValue = percentOf(capital, Number(input.assumedFdRatePercent));

    rows.push({
      financialYear,
      from,
      to,
      trades: inYear.length,
      grossPnl: formatMoney(inYear.reduce((sum, p) => sum + parseMoney(p.grossPnl), 0n)),
      charges: formatMoney(inYear.reduce((sum, p) => sum + parseMoney(p.charges.total), 0n)),
      netPnl: formatMoney(netPnl),
      capitalProxy: formatMoney(capital),
      returnPercent: capital > 0n ? round2((Number(netPnl) / Number(capital)) * 100) : null,
      index: { ...index, value: formatMoney(indexValue) },
      fd: { ratePercent: input.assumedFdRatePercent, value: formatMoney(fdValue) },
      differenceVsIndex: formatMoney(netPnl - indexValue),
      differenceVsFd: formatMoney(netPnl - fdValue),
    });
  }

  const sum = (pick: (row: RealityCheckYear) => string) => rows.reduce((total, row) => total + parseMoney(pick(row)), 0n);
  return {
    asOf: input.asOf,
    years: rows.reverse(),
    total: {
      netPnl: formatMoney(sum((r) => r.netPnl)),
      index: formatMoney(sum((r) => r.index.value)),
      fd: formatMoney(sum((r) => r.fd.value)),
      differenceVsIndex: formatMoney(sum((r) => r.differenceVsIndex)),
      differenceVsFd: formatMoney(sum((r) => r.differenceVsFd)),
    },
    method:
      'Capital is the largest total entry value open on any one day of the financial year. The index and deposit figures apply a full year’s return to that capital; the trading figure is the year’s realised P&L after every charge.',
    disclaimer: REALITY_CHECK_DISCLAIMER,
  };
}

/** The largest total entry value open on any single day inside the window. */
function peakCapital(positions: TradePosition[], from: string, to: string): bigint {
  const events: { date: string; delta: bigint }[] = [];
  for (const position of positions) {
    const open = position.openedAt < from ? from : position.openedAt;
    const close = (position.closedAt ?? to) > to ? to : (position.closedAt ?? to);
    events.push({ date: open, delta: parseMoney(position.entryValue) });
    events.push({ date: nextDay(close), delta: -parseMoney(position.entryValue) });
  }
  events.sort((a, b) => (a.date === b.date ? Number(a.delta - b.delta > 0n) - Number(a.delta - b.delta < 0n) : a.date < b.date ? -1 : 1));
  let running = 0n;
  let peak = 0n;
  for (const event of events) {
    running += event.delta;
    if (running > peak) peak = running;
  }
  return peak;
}

function indexReturnFor(input: RealityCheckInput, from: string, to: string): { source: 'SERIES' | 'ASSUMED'; label: string; returnPercent: number } {
  const points = input.benchmark?.points ?? [];
  const start = lastAtOrBefore(points, from) ?? points.find((p) => p.date >= from) ?? null;
  const end = lastAtOrBefore(points, to);
  if (start && end && start.date < end.date && parseMoney(start.value) > 0n) {
    const growth = (Number(parseMoney(end.value)) / Number(parseMoney(start.value)) - 1) * 100;
    return { source: 'SERIES', label: input.benchmark!.series, returnPercent: round2(growth) };
  }
  return { source: 'ASSUMED', label: `Assumed index return of ${input.assumedIndexReturnPercent}%`, returnPercent: Number(input.assumedIndexReturnPercent) };
}

function lastAtOrBefore(points: BenchmarkPointRecord[], date: string): BenchmarkPointRecord | null {
  let best: BenchmarkPointRecord | null = null;
  for (const point of points) {
    if (point.date <= date && (!best || point.date > best.date)) best = point;
  }
  return best;
}

function percentOf(amount: bigint, percent: number): bigint {
  return roundToCents((amount * BigInt(Math.round(percent * 10_000))) / 1_000_000n);
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

const round2 = (value: number) => Math.round(value * 100) / 100;
