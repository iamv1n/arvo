import { isIsoDate, type DateFormat } from '@arvo/finance-core';

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

interface FormatSpec {
  pattern: RegExp;
  /** Maps regex groups to [year, month, day]. Month may be a name. */
  parts: (m: RegExpExecArray) => [string, string, string];
}

const pad = (n: number) => String(n).padStart(2, '0');

const SPECS: Record<DateFormat, FormatSpec> = {
  'YYYY-MM-DD': { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, parts: (m) => [m[1], m[2], m[3]] },
  'YYYY/MM/DD': { pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, parts: (m) => [m[1], m[2], m[3]] },
  'DD/MM/YYYY': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parts: (m) => [m[3], m[2], m[1]] },
  'MM/DD/YYYY': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parts: (m) => [m[3], m[1], m[2]] },
  'DD-MM-YYYY': { pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, parts: (m) => [m[3], m[2], m[1]] },
  'MM-DD-YYYY': { pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, parts: (m) => [m[3], m[1], m[2]] },
  'DD.MM.YYYY': { pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, parts: (m) => [m[3], m[2], m[1]] },
  'DD/MM/YY': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, parts: (m) => [m[3], m[2], m[1]] },
  'MM/DD/YY': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, parts: (m) => [m[3], m[1], m[2]] },
  'DD-MM-YY': { pattern: /^(\d{1,2})-(\d{1,2})-(\d{2})$/, parts: (m) => [m[3], m[2], m[1]] },
  'DD-MMM-YYYY': { pattern: /^(\d{1,2})-([A-Za-z]{3,4})-(\d{4})$/, parts: (m) => [m[3], m[2], m[1]] },
  'DD MMM YYYY': { pattern: /^(\d{1,2}) ([A-Za-z]{3,4}),? (\d{4})$/, parts: (m) => [m[3], m[2], m[1]] },
  'DD-MMM-YY': { pattern: /^(\d{1,2})-([A-Za-z]{3,4})-(\d{2})$/, parts: (m) => [m[3], m[2], m[1]] },
  'DD MMM YY': { pattern: /^(\d{1,2}) ([A-Za-z]{3,4}) (\d{2})$/, parts: (m) => [m[3], m[2], m[1]] },
  'MMM DD, YYYY': { pattern: /^([A-Za-z]{3,4}) (\d{1,2}),? (\d{4})$/, parts: (m) => [m[3], m[1], m[2]] },
};

/** Candidate order also breaks ties: day-first before month-first. */
export const DATE_FORMATS = Object.keys(SPECS) as DateFormat[];

function cleanDate(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    // Drop a trailing time component ("14/08/2026 10:22:01").
    .replace(/[ T]\d{1,2}:\d{2}(:\d{2})?( ?[AP]M)?$/i, '');
}

/** Parses a date in the given format into YYYY-MM-DD, or null if it does not fit. */
export function parseDate(value: string, format: DateFormat): string | null {
  const text = cleanDate(value);
  const match = SPECS[format].pattern.exec(text);
  if (!match) return null;
  const [rawYear, rawMonth, rawDay] = SPECS[format].parts(match);
  let year = Number(rawYear);
  // Two-digit years: 00–69 → 2000s, 70–99 → 1900s.
  if (rawYear.length === 2) year += year < 70 ? 2000 : 1900;
  const month = /^\d+$/.test(rawMonth) ? Number(rawMonth) : MONTHS[rawMonth.toUpperCase()];
  if (!month) return null;
  const iso = `${year}-${pad(month)}-${pad(Number(rawDay))}`;
  return isIsoDate(iso) ? iso : null;
}

/**
 * Formats that parse the most non-empty samples (at least half of them), so one malformed row
 * cannot rule out the right format. The list keeps DATE_FORMATS order, so the first entry is the
 * preferred guess; more than one entry means day/month order is ambiguous.
 */
export function detectDateFormats(samples: string[]): DateFormat[] {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (values.length === 0) return [];
  const scored = DATE_FORMATS.map((format) => ({
    format,
    ok: values.filter((v) => parseDate(v, format) !== null).length,
  }));
  const best = Math.max(...scored.map((s) => s.ok));
  if (best === 0 || best * 2 < values.length) return [];
  return scored.filter((s) => s.ok === best).map((s) => s.format);
}

/** Share of samples that parse under the best format; used to recognise date columns. */
export function dateColumnScore(samples: string[]): number {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (values.length === 0) return 0;
  let best = 0;
  for (const format of DATE_FORMATS) {
    const ok = values.filter((v) => parseDate(v, format) !== null).length;
    best = Math.max(best, ok / values.length);
  }
  return best;
}
