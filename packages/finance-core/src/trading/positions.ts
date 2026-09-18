import { formatMoney, parseMoney } from '../money';
import { breakdownOf, scaleBreakdown, addBreakdowns } from './charges';
import { instrumentKey, instrumentLabel } from './symbols';
import type { ChargeBreakdown, OptionRight, TradeExchange, TradeKind, TradeRecord, TradeSegment, TradeSide, TradeStyle } from './types';
import { isOptionSegment, isDerivativeSegment, ZERO_CHARGES } from './types';

/*
 * Position reconstruction.
 *
 * Brokers hand out fills, not positions. This walks every fill of one contract in time order
 * and matches opposite sides first-in-first-out, which is both the convention the exchanges
 * use and what the Income Tax Department expects when a scrip is bought more than once.
 *
 * What the walk has to survive:
 *   partial exits      one sell closing part of a larger buy, and the rest staying open
 *   pyramiding         several buys stacked before any sell
 *   reversals          a sell bigger than the open long: the long closes and a short opens
 *   rollovers          the near-month future closed on the day the far month is opened
 *   expiry             an option left open past expiry settles instead of being traded out
 *
 * A position's identity is the id of the fill that opened it. That is stable as long as the
 * fill exists, needs no extra table, and lets a journal entry hang off a derived position.
 *
 * Everything is pure: same trades and same asOf, same positions, every time.
 */

export interface PositionLeg {
  tradeId: string;
  date: string;
  time: string | null;
  side: TradeSide;
  kind: TradeKind;
  /** The part of that fill matched into this position. */
  quantity: string;
  price: string;
  amount: string;
  /** The fill's charges, in proportion to the quantity matched here. */
  charges: ChargeBreakdown;
}

export interface TradePosition {
  /** The opening fill's id. */
  id: string;
  userId: string;
  broker: string;
  exchange: TradeExchange;
  segment: TradeSegment;
  symbol: string;
  underlying: string;
  expiry: string | null;
  strike: string | null;
  right: OptionRight | null;
  lotSize: number;
  label: string;
  direction: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openedTime: string | null;
  closedAt: string | null;
  closedTime: string | null;
  entries: PositionLeg[];
  exits: PositionLeg[];
  /** Total quantity that went through the position. */
  quantity: string;
  /** What is still open, in the position's own direction. */
  openQuantity: string;
  /** Cost of the closed quantity, and what it was closed for. */
  entryValue: string;
  exitValue: string;
  averageEntryPrice: string;
  averageExitPrice: string | null;
  /** Exit value less entry value on the closed quantity, before charges. */
  grossPnl: string;
  charges: ChargeBreakdown;
  netPnl: string;
  /** Charges as a percentage of gross profit; null when the position did not make one. */
  chargesPercentOfGross: number | null;
  style: TradeStyle;
  /** Trading sessions from entry to exit, counting both ends. */
  sessionsHeld: number;
  holdingMinutes: number | null;
  settledAtExpiry: boolean;
  /** Set when this position opened the same day a nearer expiry of the same underlying closed. */
  rolledFrom: string | null;
  rolledTo: string | null;
  warnings: string[];
}

export interface ReconstructionInput {
  trades: TradeRecord[];
  asOf: string;
  /**
   * Settlement price per instrument key for contracts left open past expiry. An option with
   * no entry here is settled worthless, which is what happens to the large majority of them.
   */
  settlementPrices?: Map<string, string>;
}

export interface ReconstructionResult {
  positions: TradePosition[];
  /** Positions still open on `asOf`, newest first. */
  open: TradePosition[];
  closed: TradePosition[];
  warnings: string[];
}

const qty = (value: string) => BigInt(value.split('.')[0] || '0');
const q = (value: bigint) => value.toString();

/** Fill order: session date, then time, then id, so the walk is reproducible. */
export function compareTrades(a: TradeRecord, b: TradeRecord): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.time ?? '';
  const bt = b.time ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

interface OpenLot {
  trade: TradeRecord;
  remaining: bigint;
}

export function reconstructPositions(input: ReconstructionInput): ReconstructionResult {
  const { asOf, settlementPrices } = input;
  const byInstrument = new Map<string, TradeRecord[]>();
  for (const trade of input.trades) {
    const key = instrumentKey(trade);
    const list = byInstrument.get(key);
    if (list) list.push(trade);
    else byInstrument.set(key, [trade]);
  }

  const positions: TradePosition[] = [];
  const warnings: string[] = [];

  for (const [key, trades] of byInstrument) {
    trades.sort(compareTrades);
    const built = walkInstrument(key, trades, asOf, settlementPrices, warnings);
    positions.push(...built);
  }

  linkRollovers(positions);
  positions.sort((a, b) => (a.openedAt === b.openedAt ? (a.id < b.id ? -1 : 1) : a.openedAt < b.openedAt ? 1 : -1));
  return {
    positions,
    open: positions.filter((p) => p.status === 'OPEN'),
    closed: positions.filter((p) => p.status === 'CLOSED'),
    warnings,
  };
}

function walkInstrument(
  key: string,
  trades: TradeRecord[],
  asOf: string,
  settlementPrices: Map<string, string> | undefined,
  warnings: string[],
): TradePosition[] {
  const out: TradePosition[] = [];
  const lots: OpenLot[] = [];
  let current: Draft | null = null;

  const openLeg = (trade: TradeRecord, amount: bigint) => {
    if (!current) current = draft(trade);
    current.entries.push(leg(trade, amount));
    lots.push({ trade, remaining: amount });
  };

  for (const trade of trades) {
    let remaining = qty(trade.quantity);
    if (remaining <= 0n) continue;

    // Same direction as what is open (or nothing open): the fill adds to the position.
    if (lots.length === 0 || lots[0].trade.side === trade.side) {
      openLeg(trade, remaining);
      continue;
    }

    // Opposite direction: close open lots first in, first out.
    while (remaining > 0n && lots.length > 0) {
      const lot = lots[0];
      const matched = remaining < lot.remaining ? remaining : lot.remaining;
      current!.exits.push(leg(trade, matched));
      current!.matchedEntry += matched * parseMoney(lot.trade.price);
      current!.matchedExit += matched * parseMoney(trade.price);
      current!.matchedQuantity += matched;
      current!.entryChargeShare.push(scaleBreakdown(breakdownOf(lot.trade), matched, qty(lot.trade.quantity)));
      current!.exitChargeShare.push(scaleBreakdown(breakdownOf(trade), matched, qty(trade.quantity)));
      lot.remaining -= matched;
      remaining -= matched;
      if (lot.remaining === 0n) lots.shift();
    }

    if (lots.length === 0) {
      // Everything matched: the position is closed. Anything left over reverses it.
      current!.closedBy = trade;
      out.push(finish(current!, asOf));
      current = null;
      if (remaining > 0n) {
        current = draft(trade);
        current.warnings.push('This fill reversed the previous position: the part beyond the close opened a new one in the opposite direction.');
        openLeg(trade, remaining);
      }
    }
  }

  if (current) {
    const settled = settleAtExpiry(current, lots, asOf, settlementPrices?.get(key) ?? null);
    if (settled) {
      out.push(finish(current, asOf));
    } else {
      out.push(finishOpen(current, lots, asOf));
      if (current.expiry && current.expiry < asOf && isDerivativeSegment(current.segment)) {
        warnings.push(`${current.label} is still open although its contract expired on ${current.expiry}. Import the settlement or add a closing trade.`);
      }
    }
  }
  return out;
}

interface Draft {
  first: TradeRecord;
  segment: TradeSegment;
  expiry: string | null;
  label: string;
  entries: PositionLeg[];
  exits: PositionLeg[];
  matchedEntry: bigint;
  matchedExit: bigint;
  matchedQuantity: bigint;
  entryChargeShare: ChargeBreakdown[];
  exitChargeShare: ChargeBreakdown[];
  closedBy: TradeRecord | null;
  settledAtExpiry: boolean;
  warnings: string[];
}

function draft(trade: TradeRecord): Draft {
  return {
    first: trade,
    segment: trade.segment,
    expiry: trade.expiry,
    label: instrumentLabel(trade),
    entries: [],
    exits: [],
    matchedEntry: 0n,
    matchedExit: 0n,
    matchedQuantity: 0n,
    entryChargeShare: [],
    exitChargeShare: [],
    closedBy: null,
    settledAtExpiry: false,
    warnings: [],
  };
}

function leg(trade: TradeRecord, matched: bigint): PositionLeg {
  const amount = matched * parseMoney(trade.price);
  return {
    tradeId: trade.id,
    date: trade.date,
    time: trade.time,
    side: trade.side,
    kind: trade.kind,
    quantity: q(matched),
    price: trade.price,
    amount: formatMoney(amount),
    charges: scaleBreakdown(breakdownOf(trade), matched, qty(trade.quantity)),
  };
}

/**
 * Settles a derivative left open past its expiry.
 *
 * An option with no settlement price is taken as expiring worthless — the outcome of most
 * out-of-the-money contracts — and the leg is marked so the UI can say it was estimated. With
 * a settlement price above zero the contract was exercised (long) or assigned (short), and
 * the STT on intrinsic value follows from the leg's kind. Futures are never guessed at: with
 * no settlement price the position stays open and the caller gets a warning.
 */
function settleAtExpiry(current: Draft, lots: OpenLot[], asOf: string, settlementPrice: string | null): boolean {
  if (lots.length === 0) return false;
  const expiry = current.expiry;
  if (!expiry || expiry >= asOf || !isDerivativeSegment(current.segment)) return false;
  const isOption = isOptionSegment(current.segment);
  if (!isOption && settlementPrice === null) return false;

  const price = settlementPrice ?? '0';
  const priceUnits = parseMoney(price);
  const long = lots[0].trade.side === 'BUY';
  const kind: TradeKind = isOption && priceUnits > 0n ? (long ? 'EXERCISE' : 'ASSIGNMENT') : 'EXPIRY';

  for (const lot of lots) {
    const matched = lot.remaining;
    if (matched <= 0n) continue;
    const amount = matched * priceUnits;
    current.exits.push({
      tradeId: `${lot.trade.id}:settlement`,
      date: expiry,
      time: null,
      side: long ? 'SELL' : 'BUY',
      kind,
      quantity: q(matched),
      price,
      amount: formatMoney(amount),
      charges: ZERO_CHARGES,
    });
    current.matchedEntry += matched * parseMoney(lot.trade.price);
    current.matchedExit += amount;
    current.matchedQuantity += matched;
    current.entryChargeShare.push(scaleBreakdown(breakdownOf(lot.trade), matched, qty(lot.trade.quantity)));
  }
  lots.length = 0;
  current.settledAtExpiry = true;
  current.warnings.push(
    settlementPrice === null
      ? `No closing trade was imported, so this contract is treated as expiring worthless on ${expiry}. This part of the P&L is an estimate.`
      : `Settled at expiry on ${expiry} at ${price}, taken from the imported settlement price.`,
  );
  return true;
}

function finish(current: Draft, asOf: string): TradePosition {
  const last = current.exits[current.exits.length - 1];
  const entryCharges = addBreakdowns(current.entryChargeShare);
  const exitCharges = addBreakdowns(current.exitChargeShare.length > 0 ? current.exitChargeShare : [ZERO_CHARGES]);
  const charges = addBreakdowns([entryCharges, exitCharges]);
  const long = current.first.side === 'BUY';
  const gross = long ? current.matchedExit - current.matchedEntry : current.matchedEntry - current.matchedExit;
  const net = gross - parseMoney(charges.total);
  return {
    ...common(current, asOf),
    status: 'CLOSED',
    closedAt: last?.date ?? current.first.date,
    closedTime: last?.time ?? null,
    quantity: q(current.matchedQuantity),
    openQuantity: '0',
    entryValue: formatMoney(current.matchedEntry),
    exitValue: formatMoney(current.matchedExit),
    averageEntryPrice: average(current.matchedEntry, current.matchedQuantity),
    averageExitPrice: average(current.matchedExit, current.matchedQuantity),
    grossPnl: formatMoney(gross),
    charges,
    netPnl: formatMoney(net),
    chargesPercentOfGross: gross > 0n ? round2((Number(parseMoney(charges.total)) / Number(gross)) * 100) : null,
    ...timing(current, last?.date ?? current.first.date, last?.time ?? null),
    settledAtExpiry: current.settledAtExpiry,
  };
}

function finishOpen(current: Draft, lots: OpenLot[], asOf: string): TradePosition {
  const openQuantity = lots.reduce((sum, lot) => sum + lot.remaining, 0n);
  const entryCharges = addBreakdowns(current.entryChargeShare.length > 0 ? current.entryChargeShare : [ZERO_CHARGES]);
  const exitCharges = addBreakdowns(current.exitChargeShare.length > 0 ? current.exitChargeShare : [ZERO_CHARGES]);
  const charges = addBreakdowns([entryCharges, exitCharges]);
  const long = current.first.side === 'BUY';
  const gross = long ? current.matchedExit - current.matchedEntry : current.matchedEntry - current.matchedExit;
  const totalEntry = current.entries.reduce((sum, e) => sum + parseMoney(e.amount), 0n);
  const totalQuantity = current.entries.reduce((sum, e) => sum + qty(e.quantity), 0n);
  return {
    ...common(current, asOf),
    status: 'OPEN',
    closedAt: null,
    closedTime: null,
    quantity: q(totalQuantity),
    openQuantity: q(openQuantity),
    entryValue: formatMoney(totalEntry),
    exitValue: formatMoney(current.matchedExit),
    averageEntryPrice: average(totalEntry, totalQuantity),
    averageExitPrice: current.matchedQuantity > 0n ? average(current.matchedExit, current.matchedQuantity) : null,
    grossPnl: formatMoney(gross),
    charges,
    netPnl: formatMoney(gross - parseMoney(charges.total)),
    chargesPercentOfGross: gross > 0n ? round2((Number(parseMoney(charges.total)) / Number(gross)) * 100) : null,
    ...timing(current, asOf, null),
    settledAtExpiry: false,
  };
}

function common(current: Draft, _asOf: string) {
  const t = current.first;
  return {
    id: t.id,
    userId: t.userId,
    broker: t.broker,
    exchange: t.exchange,
    segment: t.segment,
    symbol: t.symbol,
    underlying: t.underlying,
    expiry: t.expiry,
    strike: t.strike,
    right: t.right,
    lotSize: t.lotSize,
    label: current.label,
    direction: (t.side === 'BUY' ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT',
    openedAt: t.date,
    openedTime: t.time,
    entries: current.entries,
    exits: current.exits,
    rolledFrom: null,
    rolledTo: null,
    warnings: current.warnings,
  };
}

function timing(current: Draft, closeDate: string, closeTime: string | null) {
  const sessionsHeld = sessionsBetween(current.first.date, closeDate);
  const style = classifyStyle(sessionsHeld);
  const openTime = current.first.time;
  const holdingMinutes =
    openTime && closeTime && current.first.date === closeDate ? Math.max(0, minutesOf(closeTime) - minutesOf(openTime)) : sessionsHeld > 1 ? null : null;
  return { sessionsHeld, style, holdingMinutes };
}

/**
 * Trading sessions from one date to another, counting both ends. Weekends are excluded but
 * exchange holidays are not, so a long hold can read one or two sessions high; the style
 * bands are wide enough that it rarely changes the label.
 */
export function sessionsBetween(from: string, to: string): number {
  if (from === to) return 1;
  let count = 0;
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return Math.max(1, count);
}

export function classifyStyle(sessionsHeld: number): TradeStyle {
  if (sessionsHeld <= 1) return 'INTRADAY';
  if (sessionsHeld === 2) return 'BTST';
  if (sessionsHeld <= 10) return 'SWING';
  return 'POSITIONAL';
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

function average(value: bigint, quantity: bigint): string {
  if (quantity === 0n) return '0';
  return formatMoney(value / quantity);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Links a closed futures or option position to the one that replaced it: same underlying and
 * segment, opened on the day the old one closed, in the same direction, at a later expiry.
 */
function linkRollovers(positions: TradePosition[]): void {
  const derivatives = positions.filter((p) => isDerivativeSegment(p.segment) && p.expiry !== null);
  for (const closed of derivatives) {
    if (closed.status !== 'CLOSED' || !closed.closedAt) continue;
    const next = derivatives.find(
      (p) =>
        p.id !== closed.id &&
        p.underlying === closed.underlying &&
        p.segment === closed.segment &&
        p.direction === closed.direction &&
        p.openedAt === closed.closedAt &&
        p.expiry !== null &&
        closed.expiry !== null &&
        p.expiry > closed.expiry,
    );
    if (next) {
      closed.rolledTo = next.id;
      next.rolledFrom = closed.id;
    }
  }
}
