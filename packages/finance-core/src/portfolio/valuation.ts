import { parseMoney } from '../money';
import type { Cashflow } from './xirr';
import { INCOME_TYPES, INVESTING_TYPES, REDEEMING_TYPES, UNIT_PRICED_KINDS } from './types';
import type { HoldingRecord, HoldingTransactionRecord } from './types';
import { parseUnits, priceOf, valueOf } from './units';

/*
 * Turning a holding's event log into a position.
 *
 * FIFO lots are the single source of truth for cost, realised gains, lock-ins and exit loads.
 * Charges on a purchase are added to that lot's cost; charges on a redemption are deducted
 * from the proceeds, which is how the Income Tax Act treats transfer expenses.
 *
 * VALUE_UPDATE rows state the holding's whole value on a date and move no money. They are how
 * EPF, PPF, NPS, real estate and anything else without a unit price gets marked to market.
 */

export interface Lot {
  /** Purchase date, which starts the holding period, the lock-in and the exit-load window. */
  date: string;
  units: bigint;
  /** Acquisition cost of the remaining units, including buy-side charges. */
  cost: bigint;
}

export interface RealisedSale {
  buyDate: string;
  sellDate: string;
  units: bigint;
  cost: bigint;
  proceeds: bigint;
  gain: bigint;
  /** Days the units were held. */
  heldDays: number;
}

export type ValueSource = 'PRICE' | 'STATED' | 'COST';

export interface Position {
  holding: HoldingRecord;
  /** Valuation date this position was built for. */
  asOf: string;
  /** Units still held on the valuation date. */
  units: bigint;
  /** Gross money put in (purchases plus buy charges). */
  invested: bigint;
  /** Gross money taken out (redemptions net of sell charges). */
  withdrawn: bigint;
  /** Dividends and interest received. */
  income: bigint;
  /** invested − withdrawn − income: what is still at stake. */
  netInvested: bigint;
  /** Acquisition cost of the units still held. */
  costBasis: bigint;
  price: bigint | null;
  priceDate: string | null;
  value: bigint;
  valueSource: ValueSource;
  /** value − costBasis on the units still held. */
  unrealisedGain: bigint;
  realised: RealisedSale[];
  lots: Lot[];
  /** Dated flows from the event log. The closing value is added by positionCashflows(). */
  cashflows: Cashflow[];
  /** Rows that could not be applied (a sale with no units left), for transparency. */
  warnings: string[];
}

const DAY_MS = 86_400_000;
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const INVESTING = new Set(INVESTING_TYPES);
const REDEEMING = new Set(REDEEMING_TYPES);
const INCOME = new Set(INCOME_TYPES);
const UNIT_PRICED = new Set(UNIT_PRICED_KINDS);

/** Signed money moved by a row, from the investor's pocket: negative in, positive out. */
export function cashflowOf(row: HoldingTransactionRecord): bigint {
  const amount = parseMoney(row.amount);
  const charges = parseMoney(row.charges);
  if (INVESTING.has(row.type)) return -(amount + charges);
  if (REDEEMING.has(row.type)) return amount - charges;
  if (INCOME.has(row.type)) return amount;
  return 0n;
}

/** Units added (positive) or removed (negative) by a row. */
export function unitsDeltaOf(row: HoldingTransactionRecord): bigint {
  if (row.units === null) return 0n;
  const units = parseUnits(row.units);
  if (INVESTING.has(row.type) || row.type === 'BONUS') return units;
  if (REDEEMING.has(row.type)) return -units;
  return 0n;
}

/**
 * Builds the position of one holding as of `asOf`. Rows after `asOf` are ignored, so any
 * report can be reproduced for a past date.
 */
export function buildPosition(holding: HoldingRecord, transactions: HoldingTransactionRecord[], asOf: string): Position {
  const rows = transactions
    .filter((t) => t.holdingId === holding.id && t.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

  const lots: Lot[] = [];
  const realised: RealisedSale[] = [];
  const cashflows: Cashflow[] = [];
  const warnings: string[] = [];
  let invested = 0n;
  let withdrawn = 0n;
  let income = 0n;
  let statedValue: bigint | null = null;
  let statedDate: string | null = null;

  for (const row of rows) {
    const flow = cashflowOf(row);
    if (flow !== 0n) cashflows.push({ date: row.date, amount: formatExact(flow) });

    if (row.type === 'VALUE_UPDATE') {
      statedValue = parseMoney(row.amount);
      statedDate = row.date;
      continue;
    }
    if (INCOME.has(row.type)) {
      income += parseMoney(row.amount);
      continue;
    }
    if (INVESTING.has(row.type) || row.type === 'BONUS') {
      const cost = row.type === 'BONUS' ? 0n : parseMoney(row.amount) + parseMoney(row.charges);
      invested += cost;
      const units = unitsDeltaOf(row);
      if (units > 0n) lots.push({ date: row.date, units, cost });
      else if (cost > 0n) statedValue = (statedValue ?? 0n) + cost;
      continue;
    }
    if (REDEEMING.has(row.type)) {
      const proceeds = parseMoney(row.amount) - parseMoney(row.charges);
      withdrawn += proceeds;
      let toSell = unitsDeltaOf(row) * -1n;
      if (toSell === 0n) {
        // A maturity or withdrawal with no unit count closes out the stated value instead.
        statedValue = statedValue === null ? null : maxZero(statedValue - proceeds);
        continue;
      }
      let remainingProceeds = proceeds;
      while (toSell > 0n && lots.length > 0) {
        const lot = lots[0];
        const take = lot.units <= toSell ? lot.units : toSell;
        const lotCost = take === lot.units ? lot.cost : mulDiv(lot.cost, take, lot.units);
        const share = take === toSell ? remainingProceeds : mulDiv(proceeds, take, unitsDeltaOf(row) * -1n);
        realised.push({
          buyDate: lot.date,
          sellDate: row.date,
          units: take,
          cost: lotCost,
          proceeds: share,
          gain: share - lotCost,
          heldDays: daysBetween(lot.date, row.date),
        });
        lot.units -= take;
        lot.cost -= lotCost;
        remainingProceeds -= share;
        toSell -= take;
        if (lot.units === 0n) lots.shift();
      }
      if (toSell > 0n) warnings.push(`Sale on ${row.date} exceeds the units held; the excess was ignored`);
      continue;
    }
  }

  const units = lots.reduce((sum, lot) => sum + lot.units, 0n);
  const costBasis = lots.reduce((sum, lot) => sum + lot.cost, 0n);
  const price = holding.latestPrice !== null ? parseMoney(holding.latestPrice) : null;
  const priced = UNIT_PRICED.has(holding.kind) && units > 0n && price !== null;

  let value: bigint;
  let valueSource: ValueSource;
  if (priced) {
    value = valueOf(units, price);
    valueSource = 'PRICE';
  } else if (statedValue !== null) {
    value = statedValue;
    valueSource = 'STATED';
  } else if (units > 0n) {
    value = costBasis;
    valueSource = 'COST';
  } else {
    value = 0n;
    valueSource = 'COST';
  }

  return {
    holding,
    asOf,
    units,
    invested,
    withdrawn,
    income,
    netInvested: invested - withdrawn - income,
    costBasis: priced || valueSource === 'COST' ? costBasis : maxZero(invested - withdrawn),
    price: priced ? price : null,
    priceDate: priced ? holding.latestPriceDate : statedDate,
    value,
    valueSource,
    unrealisedGain: value - (priced || valueSource === 'COST' ? costBasis : maxZero(invested - withdrawn)),
    realised,
    lots,
    cashflows,
    warnings,
  };
}

/** Builds every position in one pass, grouping the transactions by holding. */
export function buildPositions(holdings: HoldingRecord[], transactions: HoldingTransactionRecord[], asOf: string): Position[] {
  const byHolding = new Map<string, HoldingTransactionRecord[]>();
  for (const row of transactions) {
    const list = byHolding.get(row.holdingId);
    if (list) list.push(row);
    else byHolding.set(row.holdingId, [row]);
  }
  return holdings.map((holding) => buildPosition(holding, byHolding.get(holding.id) ?? [], asOf));
}

/**
 * A position's flows for XIRR: the event log plus the closing value on the valuation date as
 * the final positive flow ("as if it were sold today").
 */
export function positionCashflows(position: Position): Cashflow[] {
  if (position.value === 0n) return position.cashflows;
  return [...position.cashflows, { date: position.asOf, amount: formatExact(position.value) }];
}

/**
 * Merges dated cashflows from several positions into one series for a combined XIRR.
 * With `includeTerminal` false only the event-log flows are merged, which is what the
 * benchmark replication needs.
 */
export function mergeCashflows(positions: Position[], includeTerminal = true): Cashflow[] {
  const byDate = new Map<string, bigint>();
  for (const position of positions) {
    for (const flow of includeTerminal ? positionCashflows(position) : position.cashflows) {
      byDate.set(flow.date, (byDate.get(flow.date) ?? 0n) + parseMoney(flow.amount));
    }
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amount]) => ({ date, amount: formatExact(amount) }));
}

/** Decimal string with the full 4 fraction digits, so nothing is lost between stages. */
function formatExact(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  return `${negative ? '-' : ''}${abs / 10_000n}.${(abs % 10_000n).toString().padStart(4, '0')}`;
}

const maxZero = (value: bigint) => (value < 0n ? 0n : value);

/** value × numerator ÷ denominator, rounded half away from zero. */
function mulDiv(value: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const negative = (value < 0n) !== (numerator < 0n) !== (denominator < 0n);
  const abs = (value < 0n ? -value : value) * (numerator < 0n ? -numerator : numerator);
  const den = denominator < 0n ? -denominator : denominator;
  const result = (abs * 2n + den) / (2n * den);
  return negative ? -result : result;
}

export { formatExact, mulDiv, priceOf };
