import { DomainError } from '../errors';
import { formatMoney, parseMoney } from '../money';
import { DEFAULT_CAPITAL_GAINS_CONFIG, addDays, addMonths, type CapitalGainsConfig } from './capital-gains';
import type { AssetClass } from './types';
import { daysBetween, mulDiv, type Position } from './valuation';

/*
 * Rebalancing arithmetic: given a target split by asset class, what is the smallest set of
 * trades that reaches it?
 *
 * Method: value the portfolio, work out each class's rupee gap, then close each gap inside the
 * class — sells come out of the most over-weight holdings first, buys go into the most
 * under-weight ones. Classes already inside the drift band are left alone, which is what keeps
 * the trade list short.
 *
 * Tax impact on a sell is estimated from the FIFO lots that would go: long-term and short-term
 * gains at the configured rates. Exit loads and lock-ins are reported as warnings, never netted
 * off, because the user may choose a different lot or wait.
 *
 * This is a calculator. It is level 2 (simulation) and says nothing about whether any of it is
 * a good idea.
 */

export const REBALANCE_DISCLAIMER =
  'Information, not advice. This is arithmetic on your own holdings and the target you entered, not a recommendation to buy or sell anything.';

/** Classes within this many percentage points of target are left untouched. */
export const DEFAULT_DRIFT_BAND_PERCENT = 2;

export interface RebalanceTarget {
  assetClass: AssetClass;
  /** Whole or fractional percent, e.g. "60" or "12.5". */
  percent: string;
}

export interface RebalanceTrade {
  holdingId: string;
  holdingName: string;
  assetClass: AssetClass;
  action: 'BUY' | 'SELL';
  amount: string;
  /** Units to move when a price is known; null for stated-value holdings. */
  units: string | null;
  /** Estimated tax on the gains a sell would realise; "0.00" for buys. */
  estimatedTax: string;
  estimatedGain: string;
  warnings: string[];
}

export interface RebalanceClassRow {
  assetClass: AssetClass;
  currentValue: string;
  currentPercent: number;
  targetPercent: number;
  targetValue: string;
  /** targetValue − currentValue: positive means buy. */
  difference: string;
  withinBand: boolean;
}

export interface RebalanceResult {
  asOf: string;
  currency: string;
  totalValue: string;
  driftBandPercent: number;
  classes: RebalanceClassRow[];
  trades: RebalanceTrade[];
  estimatedTaxTotal: string;
  warnings: string[];
  disclaimer: string;
}

export function rebalance(
  positions: Position[],
  options: {
    asOf: string;
    currency: string;
    targets: RebalanceTarget[];
    driftBandPercent?: number;
    config?: Partial<CapitalGainsConfig>;
  },
): RebalanceResult {
  const config = { ...DEFAULT_CAPITAL_GAINS_CONFIG, ...options.config };
  const band = options.driftBandPercent ?? DEFAULT_DRIFT_BAND_PERCENT;
  const targets = normalizeTargets(options.targets);

  const held = positions.filter((p) => p.holding.currency === options.currency && p.value > 0n);
  const totalValue = held.reduce((sum, p) => sum + p.value, 0n);
  if (totalValue <= 0n) {
    throw DomainError.validation('EMPTY_PORTFOLIO', 'There is nothing to rebalance yet');
  }

  const byClass = new Map<AssetClass, Position[]>();
  for (const position of held) {
    const list = byClass.get(position.holding.assetClass);
    if (list) list.push(position);
    else byClass.set(position.holding.assetClass, [position]);
  }

  const classes: RebalanceClassRow[] = [];
  const trades: RebalanceTrade[] = [];
  const warnings: string[] = [];
  const allClasses = new Set<AssetClass>([...byClass.keys(), ...targets.keys()]);

  for (const assetClass of [...allClasses].sort()) {
    const members = byClass.get(assetClass) ?? [];
    const currentValue = members.reduce((sum, p) => sum + p.value, 0n);
    const targetPercent = targets.get(assetClass) ?? 0;
    const targetValue = mulDiv(totalValue, BigInt(Math.round(targetPercent * 100)), 10_000n);
    const difference = targetValue - currentValue;
    const currentPercent = percentOf(currentValue, totalValue);
    const withinBand = Math.abs(currentPercent - targetPercent) <= band;

    classes.push({
      assetClass,
      currentValue: formatMoney(currentValue),
      currentPercent,
      targetPercent,
      targetValue: formatMoney(targetValue),
      difference: formatMoney(difference),
      withinBand,
    });

    if (withinBand || difference === 0n) continue;
    if (members.length === 0) {
      warnings.push(`No ${assetClass.toLowerCase().replace('_', ' ')} holding to buy into; add one first`);
      continue;
    }
    trades.push(...tradesForClass(members, currentValue, difference, options.asOf, config));
  }

  const estimatedTaxTotal = trades.reduce((sum, t) => sum + parseMoney(t.estimatedTax), 0n);
  return {
    asOf: options.asOf,
    currency: options.currency,
    totalValue: formatMoney(totalValue),
    driftBandPercent: band,
    classes,
    // Sells first: they fund the buys, and the order is what a person would execute.
    trades: trades.sort((a, b) => (a.action === b.action ? Number(b.amount) - Number(a.amount) : a.action === 'SELL' ? -1 : 1)),
    estimatedTaxTotal: formatMoney(estimatedTaxTotal),
    warnings,
    disclaimer: REBALANCE_DISCLAIMER,
  };
}

/**
 * Splits a class's gap across its holdings in proportion to their value, so the trade list
 * stays as short as the class allows. A sell is capped at the holding's value.
 */
function tradesForClass(
  members: Position[],
  classValue: bigint,
  difference: bigint,
  asOf: string,
  config: CapitalGainsConfig,
): RebalanceTrade[] {
  const ordered = [...members].sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : a.holding.id.localeCompare(b.holding.id)));
  const action = difference > 0n ? 'BUY' : 'SELL';
  let remaining = difference < 0n ? -difference : difference;
  const trades: RebalanceTrade[] = [];

  for (let i = 0; i < ordered.length && remaining > 0n; i++) {
    const position = ordered[i];
    const isLast = i === ordered.length - 1;
    let amount = isLast ? remaining : mulDiv(difference < 0n ? -difference : difference, position.value, classValue);
    if (action === 'SELL' && amount > position.value) amount = position.value;
    if (amount > remaining) amount = remaining;
    if (amount <= 0n) continue;
    remaining -= amount;

    const { tax, gain, warnings } = action === 'SELL' ? sellImpact(position, amount, asOf, config) : { tax: 0n, gain: 0n, warnings: [] as string[] };
    trades.push({
      holdingId: position.holding.id,
      holdingName: position.holding.name,
      assetClass: position.holding.assetClass,
      action,
      amount: formatMoney(amount),
      units: position.price !== null && position.price > 0n ? formatUnitsString(unitsFor(amount, position.price)) : null,
      estimatedTax: formatMoney(tax),
      estimatedGain: formatMoney(gain),
      warnings,
    });
  }
  return trades;
}

/** Walks the FIFO lots a sale of `amount` would consume and prices the tax on them. */
function sellImpact(
  position: Position,
  amount: bigint,
  asOf: string,
  config: CapitalGainsConfig,
): { tax: bigint; gain: bigint; warnings: string[] } {
  const equity = position.holding.assetClass === 'EQUITY' && ['EQUITY', 'MUTUAL_FUND', 'ETF'].includes(position.holding.kind);
  const threshold = equity ? config.equityLongTermDays : config.otherLongTermDays;
  const warnings: string[] = [];
  let remaining = amount;
  let shortGain = 0n;
  let longGain = 0n;

  for (const lot of position.lots) {
    if (remaining <= 0n) break;
    const lotValue = position.units === 0n ? 0n : mulDiv(position.value, lot.units, position.units);
    if (lotValue <= 0n) continue;
    const take = lotValue <= remaining ? lotValue : remaining;
    const cost = mulDiv(lot.cost, take, lotValue);
    const gain = take - cost;
    const heldDays = daysBetween(lot.date, asOf);
    if (heldDays >= threshold) longGain += gain;
    else shortGain += gain;
    remaining -= take;

    if (position.holding.exitLoadDays && heldDays < position.holding.exitLoadDays) {
      warnings.push(`Units bought on ${lot.date} carry an exit load until ${addDays(lot.date, position.holding.exitLoadDays)}`);
    }
    if (position.holding.lockInMonths && addMonths(lot.date, position.holding.lockInMonths) > asOf) {
      warnings.push(`Units bought on ${lot.date} are locked in until ${addMonths(lot.date, position.holding.lockInMonths)}`);
    }
    if (heldDays < threshold) {
      warnings.push(`Units bought on ${lot.date} turn long-term on ${addDays(lot.date, threshold)}`);
    }
  }

  const tax = percentOfMoney(max(longGain, 0n), config.ltcgRatePercent) + percentOfMoney(max(shortGain, 0n), config.stcgRatePercent);
  return { tax, gain: longGain + shortGain, warnings: [...new Set(warnings)].slice(0, 4) };
}

function normalizeTargets(targets: RebalanceTarget[]): Map<AssetClass, number> {
  if (targets.length === 0) throw DomainError.validation('INVALID_INPUT', 'Give at least one target allocation', { field: 'targets' });
  const map = new Map<AssetClass, number>();
  let total = 0;
  for (const target of targets) {
    if (map.has(target.assetClass)) {
      throw DomainError.validation('INVALID_INPUT', `Duplicate target for ${target.assetClass}`, { field: 'targets' });
    }
    const percent = Number(target.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw DomainError.validation('INVALID_INPUT', 'Each target percent must be between 0 and 100', { field: 'targets' });
    }
    map.set(target.assetClass, Math.round(percent * 100) / 100);
    total += Math.round(percent * 100) / 100;
  }
  if (Math.abs(total - 100) > 0.01) {
    throw DomainError.validation('TARGETS_MUST_SUM_TO_100', `Target allocation adds up to ${total}%, not 100%`, { field: 'targets' });
  }
  return map;
}

const max = (a: bigint, b: bigint) => (a > b ? a : b);

function percentOf(value: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((value * 10_000n * 2n + total) / (2n * total)) / 100;
}

function percentOfMoney(amount: bigint, percent: string): bigint {
  const basisPoints = parseMoney(percent) / 100n;
  return (amount * basisPoints + 5000n) / 10000n;
}

function unitsFor(amount: bigint, price: bigint): bigint {
  return (amount * 100000n * 2n + price) / (2n * price);
}

function formatUnitsString(units: bigint): string {
  const abs = units < 0n ? -units : units;
  return `${units < 0n ? '-' : ''}${abs / 100000n}.${(abs % 100000n).toString().padStart(5, '0')}`;
}
