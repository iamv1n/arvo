import { formatMoney, parseMoney } from '../money';
import { daysBetween, mulDiv, type Position } from './valuation';
import { valueOf } from './units';

/*
 * Capital gains on FIFO lots, Indian rules, information only.
 *
 * Holding period: equity shares and equity-oriented funds turn long-term after
 * EQUITY_LONG_TERM_DAYS (12 months); everything else after OTHER_LONG_TERM_DAYS (24 months).
 * Both are configurable because the thresholds move with each Finance Act, and because a
 * debt fund bought before 1 April 2023 follows different rules than one bought after.
 *
 * The financial year runs 1 April to 31 March. Realised gains are grouped into the FY of the
 * sale date. Unrealised gains value each open lot at the holding's latest price.
 *
 * Nothing here is tax advice or a recommendation to trade. Rates are used only to put a
 * number on "what would this cost", and indexation is not applied: it was withdrawn for most
 * assets from 23 July 2024, and the cases where it survives need per-asset user input.
 */

export const EQUITY_LONG_TERM_DAYS = 365;
export const OTHER_LONG_TERM_DAYS = 730;
/** Section 112A exemption on long-term equity gains in a financial year. */
export const LTCG_EXEMPTION = '125000';
export const LTCG_RATE_PERCENT = '12.5';
export const STCG_RATE_PERCENT = '20';

export interface CapitalGainsConfig {
  equityLongTermDays: number;
  otherLongTermDays: number;
  /** Section 112A exemption for the year, as a decimal string. */
  ltcgExemption: string;
  ltcgRatePercent: string;
  stcgRatePercent: string;
}

export const DEFAULT_CAPITAL_GAINS_CONFIG: CapitalGainsConfig = {
  equityLongTermDays: EQUITY_LONG_TERM_DAYS,
  otherLongTermDays: OTHER_LONG_TERM_DAYS,
  ltcgExemption: LTCG_EXEMPTION,
  ltcgRatePercent: LTCG_RATE_PERCENT,
  stcgRatePercent: STCG_RATE_PERCENT,
};

export type GainTerm = 'SHORT' | 'LONG';

export interface GainRow {
  holdingId: string;
  holdingName: string;
  /** Present on realised rows only. */
  buyDate: string;
  sellDate?: string;
  units: string;
  cost: string;
  /** Sale proceeds (realised) or market value (unrealised). */
  value: string;
  gain: string;
  term: GainTerm;
  heldDays: number;
  /** Days until the lot turns long-term; 0 once it already is. */
  daysToLongTerm: number;
  isEquity: boolean;
}

export interface LockInRow {
  holdingId: string;
  holdingName: string;
  buyDate: string;
  unlocksOn: string;
  units: string;
  value: string;
  daysLeft: number;
}

export interface HarvestSuggestion {
  holdingId: string;
  holdingName: string;
  buyDate: string;
  units: string;
  gain: string;
  /** Warnings that make the idea less attractive (exit load, lock-in). */
  warnings: string[];
}

export interface CapitalGainsResult {
  asOf: string;
  financialYear: string;
  currency: string;
  config: CapitalGainsConfig;
  realised: {
    shortTerm: string;
    longTerm: string;
    /** Long-term equity gains that fall under the section 112A exemption. */
    exemptLongTerm: string;
    taxableLongTerm: string;
    estimatedTax: string;
    rows: GainRow[];
  };
  unrealised: {
    shortTerm: string;
    longTerm: string;
    rows: GainRow[];
  };
  /** Exemption left for the year after realised long-term equity gains. */
  harvestHeadroom: string;
  harvestSuggestions: HarvestSuggestion[];
  lockIns: LockInRow[];
  /** Advice level 0–2. Shown verbatim wherever these numbers appear. */
  disclaimer: string;
}

export const CAPITAL_GAINS_DISCLAIMER =
  'Information, not advice. These are estimates from your own records and the rates you configured; confirm them with your tax adviser before acting.';

/** The Indian financial year containing a date, e.g. "2026-27". */
export function financialYearOf(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function financialYearRange(fy: string): { from: string; to: string } {
  const start = Number(fy.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

const EQUITY_KINDS = new Set(['EQUITY', 'MUTUAL_FUND', 'ETF']);
/** Equity-oriented for tax: an equity asset class held through shares, funds or ETFs. */
const isEquityTaxed = (position: Position) => position.holding.assetClass === 'EQUITY' && EQUITY_KINDS.has(position.holding.kind);

export function capitalGains(
  positions: Position[],
  options: { asOf: string; currency: string; financialYear?: string; config?: Partial<CapitalGainsConfig> },
): CapitalGainsResult {
  const config = { ...DEFAULT_CAPITAL_GAINS_CONFIG, ...options.config };
  const financialYear = options.financialYear ?? financialYearOf(options.asOf);
  const { from, to } = financialYearRange(financialYear);
  const exemption = parseMoney(config.ltcgExemption);

  const realisedRows: GainRow[] = [];
  const unrealisedRows: GainRow[] = [];
  const lockIns: LockInRow[] = [];

  for (const position of positions) {
    if (position.holding.currency !== options.currency) continue;
    const equity = isEquityTaxed(position);
    const threshold = equity ? config.equityLongTermDays : config.otherLongTermDays;

    for (const sale of position.realised) {
      if (sale.sellDate < from || sale.sellDate > to) continue;
      realisedRows.push({
        holdingId: position.holding.id,
        holdingName: position.holding.name,
        buyDate: sale.buyDate,
        sellDate: sale.sellDate,
        units: formatUnitsString(sale.units),
        cost: formatMoney(sale.cost),
        value: formatMoney(sale.proceeds),
        gain: formatMoney(sale.gain),
        term: sale.heldDays >= threshold ? 'LONG' : 'SHORT',
        heldDays: sale.heldDays,
        daysToLongTerm: Math.max(0, threshold - sale.heldDays),
        isEquity: equity,
      });
    }

    for (const lot of position.lots) {
      const heldDays = daysBetween(lot.date, options.asOf);
      const value =
        position.price !== null ? valueOf(lot.units, position.price) : position.units === 0n ? 0n : mulDiv(position.value, lot.units, position.units);
      unrealisedRows.push({
        holdingId: position.holding.id,
        holdingName: position.holding.name,
        buyDate: lot.date,
        units: formatUnitsString(lot.units),
        cost: formatMoney(lot.cost),
        value: formatMoney(value),
        gain: formatMoney(value - lot.cost),
        term: heldDays >= threshold ? 'LONG' : 'SHORT',
        heldDays,
        daysToLongTerm: Math.max(0, threshold - heldDays),
        isEquity: equity,
      });

      const lockInMonths = position.holding.lockInMonths;
      if (lockInMonths && lockInMonths > 0) {
        const unlocksOn = addMonths(lot.date, lockInMonths);
        if (unlocksOn > options.asOf) {
          lockIns.push({
            holdingId: position.holding.id,
            holdingName: position.holding.name,
            buyDate: lot.date,
            unlocksOn,
            units: formatUnitsString(lot.units),
            value: formatMoney(value),
            daysLeft: daysBetween(options.asOf, unlocksOn),
          });
        }
      }
    }
  }

  const realisedShort = sum(realisedRows.filter((r) => r.term === 'SHORT').map((r) => r.gain));
  const realisedLong = sum(realisedRows.filter((r) => r.term === 'LONG').map((r) => r.gain));
  const realisedLongEquity = sum(realisedRows.filter((r) => r.term === 'LONG' && r.isEquity).map((r) => r.gain));
  const exemptLong = clamp(realisedLongEquity, 0n, exemption);
  const taxableLong = realisedLong - exemptLong;
  const estimatedTax =
    percentOfMoney(max(taxableLong, 0n), config.ltcgRatePercent) + percentOfMoney(max(realisedShort, 0n), config.stcgRatePercent);

  const headroom = max(exemption - exemptLong, 0n);
  const harvestSuggestions = suggestHarvest(positions, unrealisedRows, headroom, options.asOf);

  return {
    asOf: options.asOf,
    financialYear,
    currency: options.currency,
    config,
    realised: {
      shortTerm: formatMoney(realisedShort),
      longTerm: formatMoney(realisedLong),
      exemptLongTerm: formatMoney(exemptLong),
      taxableLongTerm: formatMoney(max(taxableLong, 0n)),
      estimatedTax: formatMoney(estimatedTax),
      rows: realisedRows.sort((a, b) => (b.sellDate ?? '').localeCompare(a.sellDate ?? '')),
    },
    unrealised: {
      shortTerm: formatMoney(sum(unrealisedRows.filter((r) => r.term === 'SHORT').map((r) => r.gain))),
      longTerm: formatMoney(sum(unrealisedRows.filter((r) => r.term === 'LONG').map((r) => r.gain))),
      rows: unrealisedRows.sort((a, b) => compareMoney(parseMoney(b.gain), parseMoney(a.gain))),
    },
    harvestHeadroom: formatMoney(headroom),
    harvestSuggestions,
    lockIns: lockIns.sort((a, b) => a.unlocksOn.localeCompare(b.unlocksOn)),
    disclaimer: CAPITAL_GAINS_DISCLAIMER,
  };
}

/**
 * Long-term equity lots sitting on a gain, taken oldest-first until the remaining section 112A
 * exemption is used up. Presented as arithmetic, never as a suggestion to sell.
 */
function suggestHarvest(positions: Position[], rows: GainRow[], headroom: bigint, asOf: string): HarvestSuggestion[] {
  if (headroom <= 0n) return [];
  const byHolding = new Map(positions.map((p) => [p.holding.id, p]));
  const candidates = rows
    .filter((row) => row.term === 'LONG' && row.isEquity && parseMoney(row.gain) > 0n)
    .sort((a, b) => a.buyDate.localeCompare(b.buyDate));

  const suggestions: HarvestSuggestion[] = [];
  let left = headroom;
  for (const row of candidates) {
    if (left <= 0n) break;
    const gain = parseMoney(row.gain);
    const take = gain <= left ? gain : left;
    const position = byHolding.get(row.holdingId);
    const warnings: string[] = [];
    const exitLoadDays = position?.holding.exitLoadDays ?? null;
    if (exitLoadDays && daysBetween(row.buyDate, asOf) < exitLoadDays) {
      warnings.push(`Exit load applies until ${addDays(row.buyDate, exitLoadDays)}`);
    }
    if (position?.holding.lockInMonths && addMonths(row.buyDate, position.holding.lockInMonths) > asOf) {
      warnings.push(`Locked in until ${addMonths(row.buyDate, position.holding.lockInMonths)}`);
    }
    suggestions.push({
      holdingId: row.holdingId,
      holdingName: row.holdingName,
      buyDate: row.buyDate,
      units: row.units,
      gain: formatMoney(take),
      warnings,
    });
    left -= take;
  }
  return suggestions;
}

const sum = (values: string[]) => values.reduce((total, v) => total + parseMoney(v), 0n);
const compareMoney = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
const clamp = (value: bigint, low: bigint, high: bigint) => (value < low ? low : value > high ? high : value);

function percentOfMoney(amount: bigint, percent: string): bigint {
  const basisPoints = parseMoney(percent) / 100n;
  return (amount * basisPoints + 5000n) / 10000n;
}

function formatUnitsString(units: bigint): string {
  const abs = units < 0n ? -units : units;
  return `${units < 0n ? '-' : ''}${abs / 100000n}.${(abs % 100000n).toString().padStart(5, '0')}`;
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
