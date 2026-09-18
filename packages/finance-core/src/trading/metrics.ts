import { formatMoney, parseMoney } from '../money';
import type { TradePosition } from './positions';
import type { JournalEntryRecord, TradeStyle } from './types';

/*
 * Trading metrics.
 *
 * Every figure is derived from closed round trips only: an open position has no result yet,
 * and counting it either way would make the numbers move on their own. The equity curve is
 * cumulative net P&L ordered by close date, so drawdown means "peak-to-trough of realised
 * money", not a mark-to-market swing.
 *
 * Deliberately descriptive. None of this says what to trade next.
 */

export interface MetricsInput {
  positions: TradePosition[];
  journal?: Map<string, JournalEntryRecord>;
  asOf: string;
}

export interface EquityPoint {
  date: string;
  /** Net P&L realised on that date. */
  change: string;
  /** Running total. */
  equity: string;
  /** Distance below the running peak, zero or negative. */
  drawdown: string;
}

export interface BreakdownRow {
  key: string;
  label: string;
  trades: number;
  wins: number;
  winRate: number | null;
  grossPnl: string;
  charges: string;
  netPnl: string;
  /** Average net P&L per trade in this bucket. */
  average: string;
}

export interface TradingMetrics {
  asOf: string;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number | null;
  grossPnl: string;
  totalCharges: string;
  netPnl: string;
  /** Charges as a percentage of gross profit made; null when nothing was made. */
  chargesPercentOfGross: number | null;
  grossProfit: string;
  grossLoss: string;
  averageWin: string;
  averageLoss: string;
  /** Average net result per trade: winRate × averageWin − lossRate × averageLoss. */
  expectancy: string;
  /** Gross profit ÷ gross loss; null when there were no losses. */
  profitFactor: number | null;
  largestWin: string;
  largestLoss: string;
  maxDrawdown: string;
  maxDrawdownPercent: number | null;
  longestLosingStreak: number;
  longestWinningStreak: number;
  equityCurve: EquityPoint[];
  /** R-multiples for the positions where a stop was recorded in the journal. */
  rMultiples: { positionId: string; label: string; r: number; netPnl: string }[];
  averageR: number | null;
  holdingTime: { style: TradeStyle; trades: number; netPnl: string; averageSessions: number }[];
  byTimeOfDay: BreakdownRow[];
  byWeekday: BreakdownRow[];
  bySegment: BreakdownRow[];
  byInstrument: BreakdownRow[];
  bySetup: BreakdownRow[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function tradingMetrics(input: MetricsInput): TradingMetrics {
  const closed = input.positions.filter((p) => p.status === 'CLOSED').sort(byCloseDate);
  const open = input.positions.filter((p) => p.status === 'OPEN');
  const journal = input.journal ?? new Map<string, JournalEntryRecord>();

  const net = (p: TradePosition) => parseMoney(p.netPnl);
  const wins = closed.filter((p) => net(p) > 0n);
  const losses = closed.filter((p) => net(p) < 0n);
  const scratches = closed.length - wins.length - losses.length;

  const grossProfit = wins.reduce((sum, p) => sum + net(p), 0n);
  const grossLoss = losses.reduce((sum, p) => sum - net(p), 0n);
  const grossPnl = closed.reduce((sum, p) => sum + parseMoney(p.grossPnl), 0n);
  const charges = closed.reduce((sum, p) => sum + parseMoney(p.charges.total), 0n);
  const netPnl = grossProfit - grossLoss;

  const averageWin = wins.length > 0 ? grossProfit / BigInt(wins.length) : 0n;
  const averageLoss = losses.length > 0 ? grossLoss / BigInt(losses.length) : 0n;
  const winRate = closed.length > 0 ? round2((wins.length / closed.length) * 100) : null;
  const expectancy = closed.length > 0 ? netPnl / BigInt(closed.length) : 0n;

  const equityCurve = buildEquityCurve(closed);
  const { maxDrawdown, maxDrawdownPercent } = drawdownOf(equityCurve);

  return {
    asOf: input.asOf,
    closedTrades: closed.length,
    openTrades: open.length,
    wins: wins.length,
    losses: losses.length,
    scratches,
    winRate,
    grossPnl: formatMoney(grossPnl),
    totalCharges: formatMoney(charges),
    netPnl: formatMoney(netPnl),
    chargesPercentOfGross: grossPnl > 0n ? round2((Number(charges) / Number(grossPnl)) * 100) : null,
    grossProfit: formatMoney(grossProfit),
    grossLoss: formatMoney(grossLoss),
    averageWin: formatMoney(averageWin),
    averageLoss: formatMoney(averageLoss),
    expectancy: formatMoney(expectancy),
    profitFactor: grossLoss > 0n ? round2(Number(grossProfit) / Number(grossLoss)) : null,
    largestWin: formatMoney(wins.reduce((best, p) => (net(p) > best ? net(p) : best), 0n)),
    largestLoss: formatMoney(losses.reduce((worst, p) => (net(p) < worst ? net(p) : worst), 0n)),
    maxDrawdown: formatMoney(maxDrawdown),
    maxDrawdownPercent,
    longestLosingStreak: longestStreak(closed, (p) => net(p) < 0n),
    longestWinningStreak: longestStreak(closed, (p) => net(p) > 0n),
    equityCurve,
    ...rMultiples(closed, journal),
    holdingTime: holdingTime(closed),
    byTimeOfDay: breakdown(closed, timeOfDayBucket),
    byWeekday: breakdown(closed, (p) => {
      const day = new Date(`${p.openedAt}T00:00:00Z`).getUTCDay();
      return { key: String(day), label: WEEKDAYS[day] };
    }),
    bySegment: breakdown(closed, (p) => ({ key: p.segment, label: SEGMENT_LABELS[p.segment] ?? p.segment })),
    byInstrument: breakdown(closed, (p) => ({ key: p.underlying, label: p.underlying })),
    bySetup: setupBreakdown(closed, journal),
  };
}

export const SEGMENT_LABELS: Record<string, string> = {
  EQUITY_DELIVERY: 'Equity delivery',
  EQUITY_INTRADAY: 'Equity intraday',
  EQUITY_FUTURES: 'Stock futures',
  EQUITY_OPTIONS: 'Stock options',
  INDEX_FUTURES: 'Index futures',
  INDEX_OPTIONS: 'Index options',
  CURRENCY_FUTURES: 'Currency futures',
  CURRENCY_OPTIONS: 'Currency options',
  COMMODITY_FUTURES: 'Commodity futures',
  COMMODITY_OPTIONS: 'Commodity options',
};

const byCloseDate = (a: TradePosition, b: TradePosition) => {
  const ad = a.closedAt ?? a.openedAt;
  const bd = b.closedAt ?? b.openedAt;
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.closedTime ?? '';
  const bt = b.closedTime ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

function buildEquityCurve(closed: TradePosition[]): EquityPoint[] {
  const byDate = new Map<string, bigint>();
  for (const position of closed) {
    const date = position.closedAt ?? position.openedAt;
    byDate.set(date, (byDate.get(date) ?? 0n) + parseMoney(position.netPnl));
  }
  const points: EquityPoint[] = [];
  let equity = 0n;
  let peak = 0n;
  for (const date of [...byDate.keys()].sort()) {
    const change = byDate.get(date)!;
    equity += change;
    if (equity > peak) peak = equity;
    points.push({ date, change: formatMoney(change), equity: formatMoney(equity), drawdown: formatMoney(equity - peak) });
  }
  return points;
}

function drawdownOf(curve: EquityPoint[]): { maxDrawdown: bigint; maxDrawdownPercent: number | null } {
  let peak = 0n;
  let worst = 0n;
  let worstPeak = 0n;
  for (const point of curve) {
    const equity = parseMoney(point.equity);
    if (equity > peak) peak = equity;
    const drop = equity - peak;
    if (drop < worst) {
      worst = drop;
      worstPeak = peak;
    }
  }
  return { maxDrawdown: worst, maxDrawdownPercent: worstPeak > 0n ? round2((Number(-worst) / Number(worstPeak)) * 100) : null };
}

function longestStreak(closed: TradePosition[], predicate: (p: TradePosition) => boolean): number {
  let best = 0;
  let run = 0;
  for (const position of closed) {
    if (predicate(position)) {
      run += 1;
      if (run > best) best = run;
    } else if (parseMoney(position.netPnl) !== 0n) {
      run = 0;
    }
  }
  return best;
}

/**
 * R-multiples: the result divided by what the position was risking. Risk comes from the stop
 * the user wrote in the journal, never from a stop we invent, so positions without one are
 * simply left out of the average.
 */
function rMultiples(closed: TradePosition[], journal: Map<string, JournalEntryRecord>) {
  const rows: TradingMetrics['rMultiples'] = [];
  for (const position of closed) {
    const stop = journal.get(position.id)?.stopPrice;
    if (!stop) continue;
    const entry = parseMoney(position.averageEntryPrice);
    const risk = entry - parseMoney(stop);
    const perUnit = risk < 0n ? -risk : risk;
    const quantity = BigInt(position.quantity || '0');
    const riskAmount = perUnit * quantity;
    if (riskAmount === 0n) continue;
    rows.push({
      positionId: position.id,
      label: position.label,
      r: round2(Number(parseMoney(position.netPnl)) / Number(riskAmount)),
      netPnl: position.netPnl,
    });
  }
  const averageR = rows.length > 0 ? round2(rows.reduce((sum, row) => sum + row.r, 0) / rows.length) : null;
  return { rMultiples: rows, averageR };
}

function holdingTime(closed: TradePosition[]): TradingMetrics['holdingTime'] {
  const styles: TradeStyle[] = ['INTRADAY', 'BTST', 'SWING', 'POSITIONAL'];
  return styles.map((style) => {
    const rows = closed.filter((p) => p.style === style);
    return {
      style,
      trades: rows.length,
      netPnl: formatMoney(rows.reduce((sum, p) => sum + parseMoney(p.netPnl), 0n)),
      averageSessions: rows.length > 0 ? round2(rows.reduce((sum, p) => sum + p.sessionsHeld, 0) / rows.length) : 0,
    };
  });
}

/** Entry-time buckets, by the hour the position was opened. Fills with no time go to "Unknown". */
function timeOfDayBucket(position: TradePosition): { key: string; label: string } {
  if (!position.openedTime) return { key: 'unknown', label: 'No time recorded' };
  const hour = Number(position.openedTime.slice(0, 2));
  const next = String(hour + 1).padStart(2, '0');
  return { key: String(hour).padStart(2, '0'), label: `${String(hour).padStart(2, '0')}:00–${next}:00` };
}

function breakdown(closed: TradePosition[], bucket: (p: TradePosition) => { key: string; label: string }): BreakdownRow[] {
  const groups = new Map<string, { label: string; rows: TradePosition[] }>();
  for (const position of closed) {
    const { key, label } = bucket(position);
    const group = groups.get(key);
    if (group) group.rows.push(position);
    else groups.set(key, { label, rows: [position] });
  }
  return [...groups.entries()].map(([key, group]) => summarise(key, group.label, group.rows)).sort((a, b) => a.key.localeCompare(b.key));
}

function setupBreakdown(closed: TradePosition[], journal: Map<string, JournalEntryRecord>): BreakdownRow[] {
  const groups = new Map<string, TradePosition[]>();
  for (const position of closed) {
    const tags = journal.get(position.id)?.setupTags ?? [];
    for (const tag of tags.length > 0 ? tags : ['Untagged']) {
      const group = groups.get(tag);
      if (group) group.push(position);
      else groups.set(tag, [position]);
    }
  }
  return [...groups.entries()].map(([tag, rows]) => summarise(tag, tag, rows)).sort((a, b) => parseMoney(b.netPnl) - parseMoney(a.netPnl) > 0n ? 1 : -1);
}

function summarise(key: string, label: string, rows: TradePosition[]): BreakdownRow {
  const wins = rows.filter((p) => parseMoney(p.netPnl) > 0n).length;
  const netPnl = rows.reduce((sum, p) => sum + parseMoney(p.netPnl), 0n);
  return {
    key,
    label,
    trades: rows.length,
    wins,
    winRate: rows.length > 0 ? round2((wins / rows.length) * 100) : null,
    grossPnl: formatMoney(rows.reduce((sum, p) => sum + parseMoney(p.grossPnl), 0n)),
    charges: formatMoney(rows.reduce((sum, p) => sum + parseMoney(p.charges.total), 0n)),
    netPnl: formatMoney(netPnl),
    average: formatMoney(rows.length > 0 ? netPnl / BigInt(rows.length) : 0n),
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
