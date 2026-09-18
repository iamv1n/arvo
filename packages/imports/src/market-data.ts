import { MAX_IMPORT_BARS, type Bar, type BarTimeframe, type DateFormat } from '@arvo/finance-core';
import { decodeText, detectDelimiter, parseCsv } from './csv';
import { DATE_FORMATS, detectDateFormats, parseDate } from './dates';
import { extractXlsx } from './xlsx';

/*
 * OHLCV imports for the Strategy Lab.
 *
 * Price files come from everywhere — a broker's historical API dump, a charting platform's
 * export, a Kaggle CSV, someone's own scraper — and they agree on almost nothing except that
 * there will be five numbers per row. So this recognises columns by alias rather than by
 * position, and works out the date format and the timeframe from the data instead of asking.
 *
 * Nothing here reaches the network, and nothing is inferred that could silently corrupt a
 * backtest: a row whose high is below its low, or whose numbers do not parse, is dropped with a
 * reason rather than repaired. A backtest over quietly mangled bars is worse than no backtest.
 */

const ALIASES = {
  date: /^(date|timestamp|datetime|date_?time|time ?stamp|day|trade ?date|bar ?time)$/i,
  time: /^(time|bar ?time|minute|clock)$/i,
  open: /^(open|o|open ?price|opening ?price)$/i,
  high: /^(high|h|high ?price|max)$/i,
  low: /^(low|l|low ?price|min)$/i,
  close: /^(close|c|close ?price|closing ?price|last|ltp|adj ?close|adjusted ?close)$/i,
  volume: /^(volume|vol|v|qty|quantity|traded ?quantity|traded ?volume|shares)$/i,
  symbol: /^(symbol|ticker|tradingsymbol|trading ?symbol|scrip|instrument|name)$/i,
} as const;

type Column = keyof typeof ALIASES;

export interface OhlcvColumnMap {
  date: number;
  time: number | null;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  symbol: number | null;
}

export interface ParsedOhlcv {
  bars: Bar[];
  warnings: string[];
  timeframe: BarTimeframe;
  /** The symbol found in the file, when it carried one. */
  symbol: string | null;
  dateFormat: DateFormat | 'ISO_DATETIME';
  columns: OhlcvColumnMap;
}

async function tableOf(bytes: Uint8Array, filename: string): Promise<string[][]> {
  if (/\.xlsx?$/i.test(filename) || Buffer.from(bytes.subarray(0, 2)).toString('latin1') === 'PK') {
    const { tables } = await extractXlsx(bytes);
    return tables[0]?.rows ?? [];
  }
  const text = decodeText(bytes);
  return parseCsv(text, detectDelimiter(text)).filter((row) => row.some((cell) => cell.trim() !== ''));
}

/** The first row that looks like a header: at least an open, a high, a low and a close. */
function findHeader(table: string[][]): { index: number; columns: OhlcvColumnMap } | null {
  for (let i = 0; i < Math.min(table.length, 25); i += 1) {
    const row = table[i];
    const found: Partial<Record<Column, number>> = {};
    row.forEach((cell, index) => {
      const value = cell.trim();
      for (const [column, pattern] of Object.entries(ALIASES) as [Column, RegExp][]) {
        if (found[column] === undefined && pattern.test(value)) found[column] = index;
      }
    });
    if (found.open !== undefined && found.high !== undefined && found.low !== undefined && found.close !== undefined && found.date !== undefined) {
      // "Date" and "Time" can both match the time alias; the date column never doubles as one.
      const time = found.time !== undefined && found.time !== found.date ? found.time : null;
      return {
        index: i,
        columns: {
          date: found.date,
          time,
          open: found.open,
          high: found.high,
          low: found.low,
          close: found.close,
          volume: found.volume ?? null,
          symbol: found.symbol ?? null,
        },
      };
    }
  }
  return null;
}

const ISO_DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/;

/** Splits a cell that may be a plain date, an ISO timestamp, or a date next to a time column. */
function splitDateTime(dateCell: string, timeCell: string | null, format: DateFormat | 'ISO_DATETIME'): { date: string; time: string | null } | null {
  const raw = dateCell.trim();
  const iso = ISO_DATETIME.exec(raw);
  if (iso) return { date: iso[1], time: normaliseTime(iso[2]) };
  const date = format === 'ISO_DATETIME' ? null : parseDate(raw, format);
  if (!date) return null;
  return { date, time: timeCell ? normaliseTime(timeCell.trim()) : null };
}

/** HH:MM, dropping seconds: a minute bar is identified by its minute. */
function normaliseTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

const number = (value: string): number | null => {
  const cleaned = value.trim().replace(/,/g, '');
  if (cleaned === '' || cleaned === '-' || /^(na|n\/a|null|nan)$/i.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Parses a price file into bars.
 *
 * The timeframe is decided by the data, not by the user: if any row carries a time of day it is
 * minute data, otherwise it is daily. That is more reliable than asking, because the commonest
 * import mistake is loading minute bars as daily and wondering why every indicator is wrong.
 */
export async function parseOhlcvFile(bytes: Uint8Array, filename: string): Promise<ParsedOhlcv> {
  const table = await tableOf(bytes, filename);
  const header = findHeader(table);
  if (!header) {
    throw new Error(
      'This file does not look like price data. It needs a header row with date, open, high, low and close columns (volume is optional).',
    );
  }
  const rows = table.slice(header.index + 1).filter((row) => row.some((cell) => cell.trim() !== ''));
  const { columns } = header;

  const dateSamples = rows.slice(0, 200).map((row) => (row[columns.date] ?? '').trim());
  const format: DateFormat | 'ISO_DATETIME' = dateSamples.some((sample) => ISO_DATETIME.test(sample))
    ? 'ISO_DATETIME'
    : (detectDateFormats(dateSamples)[0] ?? DATE_FORMATS[0]);

  const warnings: string[] = [];
  const bars: Bar[] = [];
  const seen = new Set<string>();
  let symbol: string | null = null;
  let dropped = 0;
  let intraday = false;

  for (let i = 0; i < rows.length; i += 1) {
    if (bars.length >= MAX_IMPORT_BARS) {
      warnings.push(`The file has more than ${MAX_IMPORT_BARS.toLocaleString('en-IN')} rows; the rest were not read. Split it by year and import each part.`);
      break;
    }
    const row = rows[i];
    const rowNumber = header.index + 2 + i;
    const when = splitDateTime(row[columns.date] ?? '', columns.time === null ? null : (row[columns.time] ?? ''), format);
    if (!when) {
      dropped += 1;
      if (warnings.length < 20) warnings.push(`Row ${rowNumber}: could not read the date "${(row[columns.date] ?? '').trim()}".`);
      continue;
    }
    const open = number(row[columns.open] ?? '');
    const high = number(row[columns.high] ?? '');
    const low = number(row[columns.low] ?? '');
    const close = number(row[columns.close] ?? '');
    if (open === null || high === null || low === null || close === null) {
      dropped += 1;
      if (warnings.length < 20) warnings.push(`Row ${rowNumber}: one of the four prices is missing or not a number.`);
      continue;
    }
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      dropped += 1;
      if (warnings.length < 20) warnings.push(`Row ${rowNumber}: a price is zero or negative.`);
      continue;
    }
    if (high < low || high < Math.max(open, close) || low > Math.min(open, close)) {
      // A bar whose high is not the highest is not a bar. Repairing it would invent data.
      dropped += 1;
      if (warnings.length < 20) warnings.push(`Row ${rowNumber}: the high and low do not contain the open and close, so the bar was dropped.`);
      continue;
    }
    const key = `${when.date}|${when.time ?? ''}`;
    if (seen.has(key)) {
      dropped += 1;
      if (warnings.length < 20) warnings.push(`Row ${rowNumber}: a bar for ${key.replace('|', ' ')} was already in the file; the duplicate was dropped.`);
      continue;
    }
    seen.add(key);
    if (when.time !== null) intraday = true;
    if (symbol === null && columns.symbol !== null) {
      const value = (row[columns.symbol] ?? '').trim();
      if (value) symbol = value.toUpperCase();
    }
    bars.push({ date: when.date, time: when.time, open, high, low, close, volume: number(row[columns.volume ?? -1] ?? '') ?? 0 });
  }

  if (bars.length === 0) throw new Error('No usable bars came out of this file. Check the date format and that the price columns hold numbers.');
  if (dropped > 20) warnings.push(`${dropped} rows were dropped in total; the first twenty reasons are listed above.`);
  if (columns.volume === null) warnings.push('No volume column was found, so every bar has a volume of zero. VWAP and volume rules will not work.');

  // Files arrive newest-first as often as oldest-first, and the engine needs chronological order.
  bars.sort((a, b) => (a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date)));

  return { bars, warnings, timeframe: intraday ? 'MINUTE' : 'DAY', symbol, dateFormat: format, columns };
}
