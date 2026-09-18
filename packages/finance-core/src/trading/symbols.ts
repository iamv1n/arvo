import { formatMoney, parseMoney } from '../money';
import type { OptionRight, TradeExchange, TradeSegment } from './types';

/*
 * Trading symbol parsing.
 *
 * Indian brokers file derivatives under the exchange's own compressed symbol rather than a
 * structured record, so the contract has to be read back out of the string. The three shapes
 * that matter:
 *
 *   NIFTY24SEP24500CE      monthly option: underlying, YY, MON, strike, right
 *   NIFTY2490524500CE      weekly option:  underlying, YY, M, DD, strike, right  (M is 1–9, O, N, D)
 *   BANKNIFTY24SEPFUT      future:         underlying, YY, MON, FUT
 *
 * Parsing is best effort and never throws: an unrecognised symbol becomes its own underlying
 * with no expiry, which the importer reports as a warning rather than dropping the fill.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** Weekly symbols compress the month to one character: 1–9, then O, N, D. */
const WEEKLY_MONTH: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, O: 10, N: 11, D: 12 };

/** Indices whose options are INDEX_OPTIONS rather than EQUITY_OPTIONS. */
export const INDEX_UNDERLYINGS = new Set([
  'NIFTY',
  'BANKNIFTY',
  'FINNIFTY',
  'MIDCPNIFTY',
  'NIFTYNXT50',
  'SENSEX',
  'BANKEX',
  'SENSEX50',
]);

export interface ParsedSymbol {
  underlying: string;
  expiry: string | null;
  strike: string | null;
  right: OptionRight | null;
  /** True when the string was understood as a derivative contract. */
  recognised: boolean;
}

const MONTHLY_OPTION = /^([A-Z][A-Z0-9&_-]*?)(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d+(?:\.\d+)?)(CE|PE)$/;
const WEEKLY_OPTION = /^([A-Z][A-Z0-9&_-]*?)(\d{2})([1-9OND])(\d{2})(\d+(?:\.\d+)?)(CE|PE)$/;
const MONTHLY_FUTURE = /^([A-Z][A-Z0-9&_-]*?)(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:FUT|F)$/;

/** Parses a broker trading symbol into its contract parts. */
export function parseTradingSymbol(raw: string): ParsedSymbol {
  const symbol = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!symbol) return { underlying: '', expiry: null, strike: null, right: null, recognised: false };

  const monthly = MONTHLY_OPTION.exec(symbol);
  if (monthly) {
    const [, underlying, yy, mon, strike, right] = monthly;
    return {
      underlying,
      expiry: lastThursdayFallback(2000 + Number(yy), MONTHS.indexOf(mon) + 1),
      strike: normaliseStrike(strike),
      right: right as OptionRight,
      recognised: true,
    };
  }

  const weekly = WEEKLY_OPTION.exec(symbol);
  if (weekly) {
    const [, underlying, yy, m, dd, strike, right] = weekly;
    const month = WEEKLY_MONTH[m];
    const day = Number(dd);
    if (month && day >= 1 && day <= 31) {
      return {
        underlying,
        expiry: `${2000 + Number(yy)}-${pad(month)}-${pad(day)}`,
        strike: normaliseStrike(strike),
        right: right as OptionRight,
        recognised: true,
      };
    }
  }

  const future = MONTHLY_FUTURE.exec(symbol);
  if (future) {
    const [, underlying, yy, mon] = future;
    return { underlying, expiry: lastThursdayFallback(2000 + Number(yy), MONTHS.indexOf(mon) + 1), strike: null, right: null, recognised: true };
  }

  // Cash equity: strip the exchange series suffix Zerodha and others append.
  return { underlying: symbol.replace(/-(EQ|BE|BZ|SM|ST|IQ|MF)$/, ''), expiry: null, strike: null, right: null, recognised: false };
}

/**
 * The monthly expiry day when the exchange calendar is unknown: the last Thursday of the
 * month. Exchanges have moved expiry day more than once, so an expiry parsed this way is
 * only ever used for grouping and for the "settled at expiry" cut-off, never for tax dates.
 */
function lastThursdayFallback(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const shift = (last.getUTCDay() - 4 + 7) % 7;
  last.setUTCDate(last.getUTCDate() - shift);
  return last.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');

function normaliseStrike(raw: string): string {
  return formatMoney(parseMoney(raw));
}

/**
 * The segment a fill belongs to, from what the file could tell us. `intraday` comes from the
 * broker's own product code (MIS/CNC/NRML) or from same-day matching in the reconstruction.
 */
export function classifySegment(input: {
  exchange: TradeExchange;
  underlying: string;
  right: OptionRight | null;
  expiry: string | null;
  intraday?: boolean;
}): TradeSegment {
  const { exchange, underlying, right, expiry } = input;
  const isIndex = INDEX_UNDERLYINGS.has(underlying);
  if (exchange === 'MCX') return right ? 'COMMODITY_OPTIONS' : 'COMMODITY_FUTURES';
  if (exchange === 'CDS' || exchange === 'BCD') return right ? 'CURRENCY_OPTIONS' : 'CURRENCY_FUTURES';
  if (exchange === 'NFO' || exchange === 'BFO') {
    if (right) return isIndex ? 'INDEX_OPTIONS' : 'EQUITY_OPTIONS';
    return isIndex ? 'INDEX_FUTURES' : 'EQUITY_FUTURES';
  }
  // NSE/BSE cash. A derivative symbol filed under the cash exchange still behaves as one.
  if (right) return isIndex ? 'INDEX_OPTIONS' : 'EQUITY_OPTIONS';
  if (expiry) return isIndex ? 'INDEX_FUTURES' : 'EQUITY_FUTURES';
  return input.intraday ? 'EQUITY_INTRADAY' : 'EQUITY_DELIVERY';
}

/** The exchange a broker's exchange/segment text refers to. */
export function normaliseExchange(raw: string | null | undefined, fallback: TradeExchange = 'NSE'): TradeExchange {
  const value = (raw ?? '').trim().toUpperCase();
  if (!value) return fallback;
  if (/^(NFO|NSE ?FO|NSE-?FO|FNO|F&O|NSEFO)$/.test(value)) return 'NFO';
  if (/^(BFO|BSE ?FO|BSE-?FO|BSEFO)$/.test(value)) return 'BFO';
  if (/^(CDS|NSE ?CDS|CURRENCY|CUR)$/.test(value)) return 'CDS';
  if (/^(BCD|BSE ?CDS)$/.test(value)) return 'BCD';
  if (/^(MCX|COMMODITY|COM)$/.test(value)) return 'MCX';
  if (/^(BSE|BSE ?EQ|BSECM)$/.test(value)) return 'BSE';
  if (/^(NSE|NSE ?EQ|NSECM|EQ)$/.test(value)) return 'NSE';
  return fallback;
}

/** Stable identity for "the same contract", used to group fills into positions. */
export function instrumentKey(trade: {
  segment: TradeSegment;
  underlying: string;
  expiry: string | null;
  strike: string | null;
  right: OptionRight | null;
}): string {
  return [trade.segment, trade.underlying, trade.expiry ?? '', trade.strike ?? '', trade.right ?? ''].join('|');
}

/** A short human label for a contract: "NIFTY 24500 CE 26 Sep 24" or just "INFY". */
export function instrumentLabel(trade: {
  underlying: string;
  expiry: string | null;
  strike: string | null;
  right: OptionRight | null;
}): string {
  const parts = [trade.underlying];
  if (trade.strike) parts.push(trimZeros(trade.strike));
  if (trade.right) parts.push(trade.right);
  if (trade.expiry) parts.push(trade.expiry);
  else if (!trade.strike && !trade.right) return trade.underlying;
  return parts.join(' ');
}

function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}
