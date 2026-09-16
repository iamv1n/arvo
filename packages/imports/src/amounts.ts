import { formatMoney, isMoneyString, parseMoney } from '@arvo/finance-core';

export type DirectionMarker = 'DEBIT' | 'CREDIT';

export interface ParsedAmount {
  /** Canonical signed decimal string. */
  value: string;
  /** DR/CR marker found next to the number, if any. */
  marker: DirectionMarker | null;
}

const CURRENCY_TOKENS = /(₹|RS\.?|INR|USD|EUR|GBP|SGD|AED|\$|€|£)/gi;
const DEBIT_MARKERS = /(?<=[\d\s)])(DR|DEBIT|D)\.?$/i;
const CREDIT_MARKERS = /(?<=[\d\s)])(CR|CREDIT|C)\.?$/i;

/**
 * Parses statement amounts such as "1,23,456.50", "(1,200.00)", "-450", "649.00 Dr",
 * "₹ 2,000 CR" and "1,200.00Dr". Comma decimal separators ("1.200,00") are not supported.
 * Returns null for empty cells or text that is not a number.
 */
export function parseAmount(input: string): ParsedAmount | null {
  let text = input.trim();
  if (!text || text === '-' || text === '--') return null;

  let marker: DirectionMarker | null = null;
  const trailing = text.replace(CURRENCY_TOKENS, '').trim();
  if (DEBIT_MARKERS.test(trailing)) {
    marker = 'DEBIT';
    text = trailing.replace(DEBIT_MARKERS, '');
  } else if (CREDIT_MARKERS.test(trailing)) {
    marker = 'CREDIT';
    text = trailing.replace(CREDIT_MARKERS, '');
  } else {
    text = trailing;
  }

  let negative = false;
  text = text.replace(/\s+/g, '');
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  text = text.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  // Round to 4 fraction digits, half away from zero, to fit the ledger scale.
  const [whole, fraction = ''] = text.split('.');
  let units = BigInt(whole) * 10000n + BigInt((fraction + '0000').slice(0, 4));
  if (fraction.length > 4 && Number(fraction[4]) >= 5) units += 1n;
  if (whole.length > 15) return null;
  const value = formatMoney(negative ? -units : units);
  return isMoneyString(value) ? { value, marker } : null;
}

export function parseDirection(input: string): DirectionMarker | null {
  const text = input.trim().toUpperCase().replace(/\.$/, '');
  if (['DR', 'D', 'DEBIT', 'WITHDRAWAL', 'OUT'].includes(text)) return 'DEBIT';
  if (['CR', 'C', 'CREDIT', 'DEPOSIT', 'IN'].includes(text)) return 'CREDIT';
  return null;
}

export function negate(value: string): string {
  return formatMoney(-parseMoney(value));
}

export function absolute(value: string): string {
  const units = parseMoney(value);
  return formatMoney(units < 0n ? -units : units);
}

/** Share of non-empty samples that are amounts; used to recognise amount columns. */
export function amountColumnScore(samples: string[]): number {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (values.length === 0) return 0;
  return values.filter((v) => parseAmount(v) !== null).length / values.length;
}
