import { formatMoney, parseMoney, type CorporateActionKind, type IpoStatus } from '@arvo/finance-core';
import { parseAmount } from './amounts';
import { decodeText, detectDelimiter, parseCsv } from './csv';
import { DATE_FORMATS, detectDateFormats, parseDate } from './dates';
import { extractXlsx } from './xlsx';

/*
 * Calendar imports for Markets & Alerts.
 *
 * Three small file shapes — corporate actions, trading holidays and IPOs — and no network,
 * like everything else in this package. Columns are recognised by alias rather than position,
 * because these files come from exchange downloads, broker exports and hand-kept spreadsheets
 * in roughly equal measure and none of them agree on a header.
 *
 * A row that cannot be understood is dropped with a reason rather than guessed at. A corporate
 * action with the wrong ex-date is worse than a missing one: it moves an alert to the wrong day
 * and the user finds out afterwards.
 */

export interface ParsedRows<T> {
  rows: T[];
  warnings: string[];
}

export interface ParsedCorporateAction {
  symbol: string;
  name: string | null;
  kind: CorporateActionKind;
  exDate: string;
  recordDate: string | null;
  payDate: string | null;
  amount: string | null;
  ratio: string | null;
  notes: string | null;
}

export interface ParsedHoliday {
  date: string;
  name: string;
}

export interface ParsedIpo {
  name: string;
  symbol: string | null;
  openDate: string | null;
  closeDate: string | null;
  priceBandLow: string | null;
  priceBandHigh: string | null;
  lotSize: number | null;
  listingDate: string | null;
  status: IpoStatus;
  notes: string | null;
}

/** The most rows one calendar upload may carry. These files are hundreds of rows, never millions. */
export const MAX_CALENDAR_ROWS = 20_000;
/** The most bytes a calendar upload may be. */
export const MAX_CALENDAR_BYTES = 5 * 1024 * 1024;

async function tableOf(bytes: Uint8Array, filename: string): Promise<string[][]> {
  if (/\.xlsx?$/i.test(filename) || Buffer.from(bytes.subarray(0, 2)).toString('latin1') === 'PK') {
    const { tables } = await extractXlsx(bytes);
    return tables[0]?.rows ?? [];
  }
  const text = decodeText(bytes);
  return parseCsv(text, detectDelimiter(text)).filter((row) => row.some((cell) => cell.trim() !== ''));
}

/** Index of the first column whose header matches one of the aliases, or null. */
function column(header: string[], alias: RegExp): number | null {
  const index = header.findIndex((cell) => alias.test(cell.trim()));
  return index === -1 ? null : index;
}

const cell = (row: string[], index: number | null): string => (index === null ? '' : (row[index] ?? '').trim());

/** The date format that explains the most samples in a column; null when none does. */
function dateFormatOf(rows: string[][], index: number | null) {
  if (index === null) return null;
  const samples = rows.map((row) => (row[index] ?? '').trim()).filter(Boolean).slice(0, 40);
  return detectDateFormats(samples)[0] ?? DATE_FORMATS.find((format) => samples.some((sample) => parseDate(sample, format))) ?? null;
}

const ACTION_KINDS: { pattern: RegExp; kind: CorporateActionKind }[] = [
  { pattern: /divid|interim|final/i, kind: 'DIVIDEND' },
  { pattern: /split|sub-?divi|face ?value/i, kind: 'SPLIT' },
  { pattern: /bonus/i, kind: 'BONUS' },
  { pattern: /buy ?back/i, kind: 'BUYBACK' },
  { pattern: /rights?/i, kind: 'RIGHTS' },
];

/**
 * Corporate actions. Exchange "purpose" columns are free text ("INTERIM DIVIDEND RS 6 PER
 * SHARE"), so the kind is read out of the text and the per-share amount out of the same string
 * when there is no amount column of its own.
 */
export async function parseCorporateActionsFile(bytes: Uint8Array, filename: string): Promise<ParsedRows<ParsedCorporateAction>> {
  const table = await tableOf(bytes, filename);
  const warnings: string[] = [];
  if (table.length < 2) return { rows: [], warnings: ['The file has no data rows'] };

  const [header, ...body] = table;
  const columns = {
    symbol: column(header, /^(symbol|ticker|scrip|security|instrument|nse ?symbol)$/i),
    name: column(header, /^(company|company ?name|security ?name|name)$/i),
    kind: column(header, /^(kind|type|purpose|action|corporate ?action|event)$/i),
    exDate: column(header, /^(ex[ _-]?date|ex)$/i),
    recordDate: column(header, /^(record ?date|rd)$/i),
    payDate: column(header, /^(pay(ment)? ?date|payout ?date)$/i),
    amount: column(header, /^(amount|dividend|value|per ?share|rs ?per ?share)$/i),
    ratio: column(header, /^(ratio|split ?ratio|bonus ?ratio)$/i),
    notes: column(header, /^(notes?|remarks?|comment)$/i),
  };
  if (columns.symbol === null) return { rows: [], warnings: ['No symbol column was found'] };
  if (columns.exDate === null) return { rows: [], warnings: ['No ex-date column was found'] };

  const exFormat = dateFormatOf(body, columns.exDate);
  const recordFormat = dateFormatOf(body, columns.recordDate);
  const payFormat = dateFormatOf(body, columns.payDate);
  if (!exFormat) return { rows: [], warnings: ['The ex-date column does not hold recognisable dates'] };

  const rows: ParsedCorporateAction[] = [];
  for (const [index, row] of body.entries()) {
    if (rows.length >= MAX_CALENDAR_ROWS) {
      warnings.push(`Stopped after ${MAX_CALENDAR_ROWS} rows`);
      break;
    }
    const line = index + 2;
    const symbol = cell(row, columns.symbol).toUpperCase();
    const exDate = parseDate(cell(row, columns.exDate), exFormat);
    if (!symbol || !exDate) {
      if (symbol || cell(row, columns.exDate)) warnings.push(`Row ${line}: skipped, the symbol or ex-date could not be read`);
      continue;
    }
    const purpose = cell(row, columns.kind);
    const kind = ACTION_KINDS.find((candidate) => candidate.pattern.test(purpose))?.kind ?? null;
    if (!kind) {
      warnings.push(`Row ${line}: skipped, "${purpose || 'blank'}" is not a corporate action Arvo recognises`);
      continue;
    }

    // A per-share amount either has its own column or is inside the purpose text.
    const explicit = parseAmount(cell(row, columns.amount));
    const embedded = /(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:\/-)?\s*per\s*share/i.exec(purpose);
    const amount = explicit?.value ?? (embedded ? formatMoney(parseMoney(embedded[1]!)) : null);
    const ratioText = cell(row, columns.ratio) || (/\b(\d+\s*[:]\s*\d+)\b/.exec(purpose)?.[1] ?? '');

    rows.push({
      symbol,
      name: cell(row, columns.name) || null,
      kind,
      exDate,
      recordDate: recordFormat ? parseDate(cell(row, columns.recordDate), recordFormat) : null,
      payDate: payFormat ? parseDate(cell(row, columns.payDate), payFormat) : null,
      amount: kind === 'DIVIDEND' || kind === 'BUYBACK' ? amount : null,
      ratio: ratioText ? ratioText.replace(/\s+/g, '') : null,
      notes: cell(row, columns.notes) || (purpose && !cell(row, columns.notes) ? purpose : null),
    });
  }
  return { rows, warnings };
}

/**
 * Trading holidays. The exchange publishes a date and a description and nothing else, so this
 * accepts a two-column file and, as a convenience, a single date column with no names.
 */
export async function parseHolidaysFile(bytes: Uint8Array, filename: string): Promise<ParsedRows<ParsedHoliday>> {
  const table = await tableOf(bytes, filename);
  const warnings: string[] = [];
  if (!table.length) return { rows: [], warnings: ['The file is empty'] };

  const [header, ...rest] = table;
  const dateIndex = column(header, /^(date|holiday ?date|trading ?holiday)$/i);
  const nameIndex = column(header, /^(name|description|holiday|occasion|reason)$/i);
  // A file with no header at all still parses: the first row is treated as data.
  const body = dateIndex === null ? table : rest;
  const dateColumn = dateIndex ?? 0;
  const nameColumn = nameIndex ?? (dateColumn === 0 ? 1 : 0);

  const format = dateFormatOf(body, dateColumn);
  if (!format) return { rows: [], warnings: ['No column in this file holds recognisable dates'] };

  const rows: ParsedHoliday[] = [];
  const seen = new Set<string>();
  for (const [index, row] of body.entries()) {
    const date = parseDate(cell(row, dateColumn), format);
    if (!date) {
      if (cell(row, dateColumn)) warnings.push(`Row ${index + 1}: "${cell(row, dateColumn)}" is not a date`);
      continue;
    }
    if (seen.has(date)) continue;
    seen.add(date);
    rows.push({ date, name: cell(row, nameColumn) || 'Trading holiday' });
  }
  return { rows, warnings };
}

const IPO_STATUS_ALIASES: { pattern: RegExp; status: IpoStatus }[] = [
  { pattern: /listed/i, status: 'LISTED' },
  { pattern: /withdraw|cancel/i, status: 'WITHDRAWN' },
  { pattern: /open|live|ongoing/i, status: 'OPEN' },
  { pattern: /closed|allot/i, status: 'CLOSED' },
  { pattern: /upcoming|announce/i, status: 'UPCOMING' },
];

/** IPOs. Everything except the name is optional, because half of it is unknown when it is announced. */
export async function parseIposFile(bytes: Uint8Array, filename: string): Promise<ParsedRows<ParsedIpo>> {
  const table = await tableOf(bytes, filename);
  if (table.length < 2) return { rows: [], warnings: ['The file has no data rows'] };

  const [header, ...body] = table;
  const columns = {
    name: column(header, /^(name|issue|company|company ?name|ipo)$/i),
    symbol: column(header, /^(symbol|ticker|scrip)$/i),
    openDate: column(header, /^(open|open ?date|issue ?open|start ?date)$/i),
    closeDate: column(header, /^(close|close ?date|issue ?close|end ?date)$/i),
    band: column(header, /^(price ?band|band|price ?range)$/i),
    bandLow: column(header, /^(price ?band ?low|low|min ?price|floor ?price)$/i),
    bandHigh: column(header, /^(price ?band ?high|high|max ?price|cap ?price)$/i),
    lotSize: column(header, /^(lot|lot ?size|market ?lot|min ?qty)$/i),
    listingDate: column(header, /^(listing|listing ?date|list ?date)$/i),
    status: column(header, /^(status|state)$/i),
    notes: column(header, /^(notes?|remarks?|comment)$/i),
  };
  if (columns.name === null) return { rows: [], warnings: ['No issue-name column was found'] };

  const openFormat = dateFormatOf(body, columns.openDate);
  const closeFormat = dateFormatOf(body, columns.closeDate);
  const listingFormat = dateFormatOf(body, columns.listingDate);

  const warnings: string[] = [];
  const rows: ParsedIpo[] = [];
  for (const [index, row] of body.entries()) {
    const name = cell(row, columns.name);
    if (!name) continue;

    // "100 – 110" in one cell is as common as two columns.
    let low = parseAmount(cell(row, columns.bandLow))?.value ?? null;
    let high = parseAmount(cell(row, columns.bandHigh))?.value ?? null;
    const band = cell(row, columns.band);
    if ((!low || !high) && band) {
      const match = /(\d+(?:\.\d+)?)\s*[-–—to]+\s*(\d+(?:\.\d+)?)/i.exec(band);
      if (match) {
        low ??= formatMoney(parseMoney(match[1]!));
        high ??= formatMoney(parseMoney(match[2]!));
      } else {
        warnings.push(`Row ${index + 2}: the price band "${band}" could not be read`);
      }
    }

    const lotText = cell(row, columns.lotSize).replace(/[^\d]/g, '');
    rows.push({
      name,
      symbol: cell(row, columns.symbol).toUpperCase() || null,
      openDate: openFormat ? parseDate(cell(row, columns.openDate), openFormat) : null,
      closeDate: closeFormat ? parseDate(cell(row, columns.closeDate), closeFormat) : null,
      priceBandLow: low,
      priceBandHigh: high,
      lotSize: lotText ? Number(lotText) : null,
      listingDate: listingFormat ? parseDate(cell(row, columns.listingDate), listingFormat) : null,
      status: IPO_STATUS_ALIASES.find((candidate) => candidate.pattern.test(cell(row, columns.status)))?.status ?? 'UPCOMING',
      notes: cell(row, columns.notes) || null,
    });
  }
  return { rows, warnings };
}
