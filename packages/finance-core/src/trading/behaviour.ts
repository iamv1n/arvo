import { formatMoney, parseMoney } from '../money';
import type { TradePosition } from './positions';
import type { TradeRecord, TradingSettingsRecord } from './types';
import { isDerivativeSegment } from './types';

/*
 * Behaviour analytics.
 *
 * Five patterns that traders recognise in themselves after the fact. Each one is defined by a
 * rule the user can see and change, and each flag carries the trades it was derived from, so
 * nothing has to be taken on faith.
 *
 * The wording is deliberately flat. A flag says what happened and how often; it does not say
 * the trader was wrong, and it never tells anyone what to do next. Some of these patterns are
 * a deliberate strategy for some people — scaling into a planned position looks exactly like
 * averaging down — which is why the explanations describe rather than judge.
 */

export type BehaviourFlagKind = 'OVER_TRADING' | 'REVENGE_TRADE' | 'SIZE_CREEP' | 'AVERAGING_DOWN' | 'EXPIRY_DAY_CONCENTRATION';

export interface BehaviourFlag {
  kind: BehaviourFlagKind;
  title: string;
  /** What the rule looked for, in the user's own configured terms. */
  rule: string;
  /** A neutral description of what was found. */
  explanation: string;
  /** The day or instrument the flag is about, when it has one. */
  subject: string | null;
  date: string | null;
  count: number;
  /** Net P&L of the trades behind the flag, when it is meaningful. */
  netPnl: string | null;
  tradeIds: string[];
  positionIds: string[];
}

export interface BehaviourInput {
  trades: TradeRecord[];
  positions: TradePosition[];
  settings: TradingSettingsRecord | null;
  asOf: string;
}

export interface BehaviourReport {
  asOf: string;
  /** The thresholds that produced these flags, echoed so the report explains itself. */
  rules: { revengeWindowMinutes: number; overTradingMultiple: string; medianTradesPerDay: number };
  flags: BehaviourFlag[];
  summary: { kind: BehaviourFlagKind; title: string; count: number }[];
  /** Share of derivative trades placed on an expiry day, 0–100. */
  expiryDayRatio: number | null;
}

export function behaviourReport(input: BehaviourInput): BehaviourReport {
  const { trades, positions, asOf } = input;
  const revengeWindowMinutes = input.settings?.revengeWindowMinutes ?? 15;
  const overTradingMultiple = input.settings?.overTradingMultiple ?? '2';

  const perDay = tradesPerDay(trades);
  const median = medianOf([...perDay.values()]);

  const flags = [
    ...overTrading(perDay, trades, median, overTradingMultiple),
    ...revengeTrades(trades, positions, revengeWindowMinutes),
    ...sizeCreep(positions),
    ...averagingDown(positions),
    ...expiryDayConcentration(trades),
  ];

  const kinds = new Map<BehaviourFlagKind, { title: string; count: number }>();
  for (const flag of flags) {
    const entry = kinds.get(flag.kind);
    if (entry) entry.count += 1;
    else kinds.set(flag.kind, { title: flag.title, count: 1 });
  }

  return {
    asOf,
    rules: { revengeWindowMinutes, overTradingMultiple, medianTradesPerDay: median },
    flags,
    summary: [...kinds.entries()].map(([kind, value]) => ({ kind, title: value.title, count: value.count })),
    expiryDayRatio: expiryRatio(trades),
  };
}

function tradesPerDay(trades: TradeRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const trade of trades) counts.set(trade.date, (counts.get(trade.date) ?? 0) + 1);
  return counts;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Days whose fill count is far above the user's own median day. */
function overTrading(perDay: Map<string, number>, trades: TradeRecord[], median: number, multiple: string): BehaviourFlag[] {
  if (median === 0 || perDay.size < 5) return [];
  const threshold = Math.max(median + 1, Math.ceil(median * Number(multiple)));
  const flags: BehaviourFlag[] = [];
  for (const [date, count] of [...perDay.entries()].sort()) {
    if (count < threshold) continue;
    const day = trades.filter((t) => t.date === date);
    flags.push({
      kind: 'OVER_TRADING',
      title: 'Unusually busy day',
      rule: `At least ${threshold} fills in a day, which is ${multiple}× your median of ${median}`,
      explanation: `${count} fills on ${date}, against a median of ${median} on the days you traded.`,
      subject: date,
      date,
      count,
      netPnl: null,
      tradeIds: day.map((t) => t.id),
      positionIds: [],
    });
  }
  return flags;
}

/**
 * A new position opened within N minutes of closing a losing one, on the same day. Only fills
 * that carry a time can be tested, so a tradebook without times produces no flags here rather
 * than guesses.
 */
function revengeTrades(trades: TradeRecord[], positions: TradePosition[], windowMinutes: number): BehaviourFlag[] {
  const losers = positions
    .filter((p) => p.status === 'CLOSED' && parseMoney(p.netPnl) < 0n && p.closedAt && p.closedTime)
    .sort((a, b) => (a.closedAt! < b.closedAt! ? -1 : 1));
  if (losers.length === 0) return [];

  const flags: BehaviourFlag[] = [];
  for (const loser of losers) {
    const closedMinutes = minutesOf(loser.closedTime!);
    const next = positions
      .filter((p) => p.id !== loser.id && p.openedAt === loser.closedAt && p.openedTime !== null)
      .filter((p) => {
        const gap = minutesOf(p.openedTime!) - closedMinutes;
        return gap >= 0 && gap <= windowMinutes;
      })
      .sort((a, b) => (a.openedTime! < b.openedTime! ? -1 : 1));
    if (next.length === 0) continue;
    const follower = next[0];
    flags.push({
      kind: 'REVENGE_TRADE',
      title: 'New position soon after a loss',
      rule: `A position opened within ${windowMinutes} minutes of closing a losing one`,
      explanation: `${loser.label} was closed at ${loser.closedTime} for ${formatMoney(parseMoney(loser.netPnl))}, and ${follower.label} was opened at ${follower.openedTime}, ${minutesOf(follower.openedTime!) - closedMinutes} minutes later.`,
      subject: follower.label,
      date: loser.closedAt,
      count: next.length,
      netPnl: follower.status === 'CLOSED' ? follower.netPnl : null,
      tradeIds: [...loser.exits.map((l) => l.tradeId), ...follower.entries.map((l) => l.tradeId)].filter((id) => !id.includes(':')),
      positionIds: [loser.id, follower.id],
    });
  }
  return flags;
}

/**
 * Position size growing after a run of wins. Compares each position's entry value with the
 * one before it in the same segment, and flags a run of three or more consecutive increases
 * that each followed a winning trade.
 */
function sizeCreep(positions: TradePosition[]): BehaviourFlag[] {
  const closed = positions.filter((p) => p.status === 'CLOSED').sort((a, b) => (a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : a.id < b.id ? -1 : 1));
  const flags: BehaviourFlag[] = [];
  let run: TradePosition[] = [];

  for (let i = 1; i < closed.length; i += 1) {
    const previous = closed[i - 1];
    const current = closed[i];
    const grew = parseMoney(current.entryValue) > parseMoney(previous.entryValue);
    const afterWin = parseMoney(previous.netPnl) > 0n;
    if (grew && afterWin) {
      if (run.length === 0) run.push(previous);
      run.push(current);
      continue;
    }
    if (run.length >= 3) flags.push(sizeCreepFlag(run));
    run = [];
  }
  if (run.length >= 3) flags.push(sizeCreepFlag(run));
  return flags;
}

function sizeCreepFlag(run: TradePosition[]): BehaviourFlag {
  const first = run[0];
  const last = run[run.length - 1];
  const from = parseMoney(first.entryValue);
  const to = parseMoney(last.entryValue);
  const growth = from > 0n ? Math.round((Number(to) / Number(from) - 1) * 100) : null;
  return {
    kind: 'SIZE_CREEP',
    title: 'Position size grew through a winning run',
    rule: 'Three or more consecutive positions, each larger than the last and each opened after a win',
    explanation: `${run.length} positions in a row got larger after a winning trade, from ${formatMoney(from)} on ${first.openedAt} to ${formatMoney(to)} on ${last.openedAt}${growth === null ? '' : `, a ${growth}% increase`}.`,
    subject: null,
    date: last.openedAt,
    count: run.length,
    netPnl: formatMoney(run.reduce((sum, p) => sum + parseMoney(p.netPnl), 0n)),
    tradeIds: run.flatMap((p) => p.entries.map((l) => l.tradeId)).filter((id) => !id.includes(':')),
    positionIds: run.map((p) => p.id),
  };
}

/** Adding to a position at a worse price than the average paid so far. */
function averagingDown(positions: TradePosition[]): BehaviourFlag[] {
  const flags: BehaviourFlag[] = [];
  for (const position of positions) {
    if (position.entries.length < 2) continue;
    let value = 0n;
    let quantity = 0n;
    const adds: typeof position.entries = [];
    for (const entry of position.entries) {
      const price = parseMoney(entry.price);
      const units = BigInt(entry.quantity || '0');
      if (quantity > 0n) {
        const average = value / quantity;
        const worse = position.direction === 'LONG' ? price < average : price > average;
        if (worse) adds.push(entry);
      }
      value += price * units;
      quantity += units;
    }
    if (adds.length === 0) continue;
    flags.push({
      kind: 'AVERAGING_DOWN',
      title: position.direction === 'LONG' ? 'Added below the average price' : 'Added above the average price',
      rule: 'A fill that added to an open position at a price worse than the average already paid',
      explanation: `${adds.length} of the ${position.entries.length} entries into ${position.label} went on at a worse price than the running average, taking the position from ${position.entries[0].quantity} to ${position.quantity} units. ${position.status === 'CLOSED' ? `It finished at ${position.netPnl}.` : 'It is still open.'}`,
      subject: position.label,
      date: adds[adds.length - 1].date,
      count: adds.length,
      netPnl: position.status === 'CLOSED' ? position.netPnl : null,
      tradeIds: adds.map((entry) => entry.tradeId),
      positionIds: [position.id],
    });
  }
  return flags;
}

/**
 * Expiry-day concentration: how much of the derivative activity lands on the day a contract
 * expires. Nothing is wrong with trading an expiry; the ratio is here because it is usually
 * larger than people expect when they add it up.
 */
function expiryDayConcentration(trades: TradeRecord[]): BehaviourFlag[] {
  const derivatives = trades.filter((t) => isDerivativeSegment(t.segment) && t.expiry);
  if (derivatives.length < 10) return [];
  const onExpiry = derivatives.filter((t) => t.date === t.expiry);
  const ratio = Math.round((onExpiry.length / derivatives.length) * 100);
  if (ratio < 30) return [];
  return [
    {
      kind: 'EXPIRY_DAY_CONCENTRATION',
      title: 'Much of the derivative activity is on expiry day',
      rule: 'At least 30% of derivative fills placed on the contract’s own expiry date',
      explanation: `${onExpiry.length} of ${derivatives.length} derivative fills (${ratio}%) were placed on an expiry day. Premium decays fastest that day, so both results and charges tend to be larger than on other days.`,
      subject: null,
      date: null,
      count: onExpiry.length,
      netPnl: null,
      tradeIds: onExpiry.slice(0, 50).map((t) => t.id),
      positionIds: [],
    },
  ];
}

function expiryRatio(trades: TradeRecord[]): number | null {
  const derivatives = trades.filter((t) => isDerivativeSegment(t.segment) && t.expiry);
  if (derivatives.length === 0) return null;
  const onExpiry = derivatives.filter((t) => t.date === t.expiry).length;
  return Math.round((onExpiry / derivatives.length) * 10_000) / 100;
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
