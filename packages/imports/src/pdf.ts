import type { ColumnMapping, DateFormat, ExtractedTable } from '@arvo/finance-core';
import { parseMoney } from '@arvo/finance-core';
import { getDocumentProxy } from 'unpdf';
import { absolute, parseAmount } from './amounts';
import { detectDateFormats, parseDate } from './dates';

const MAX_PAGES = 200;

/** A line of text on a page, with items ordered left to right and wide gaps kept as column breaks. */
export interface PdfLine {
  page: number;
  text: string;
}

/** Extracts visual lines from a PDF by grouping text items that share a baseline. */
export async function extractPdfLines(bytes: Uint8Array): Promise<{ lines: PdfLine[]; warnings: string[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const warnings: string[] = [];
  const lines: PdfLine[] = [];
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  if (pdf.numPages > MAX_PAGES) warnings.push(`Only the first ${MAX_PAGES} pages were read`);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item)
      .filter((item) => item.str.trim() !== '')
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }));

    // Group by baseline with a small tolerance; PDF y grows upwards.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: (typeof items)[] = [];
    for (const item of items) {
      const group = groups.at(-1);
      if (group && Math.abs(group[0].y - item.y) <= 2.5) group.push(item);
      else groups.push([item]);
    }
    for (const group of groups) {
      group.sort((a, b) => a.x - b.x);
      let text = '';
      let lastEnd: number | null = null;
      for (const item of group) {
        if (lastEnd !== null) {
          const gap = item.x - lastEnd;
          text += gap > 12 ? '   ' : gap > 1 ? ' ' : '';
        }
        text += item.text;
        lastEnd = item.x + item.width;
      }
      lines.push({ page: pageNumber, text: text.trim() });
    }
  }
  await pdf.loadingTask.destroy();
  if (lines.length === 0) {
    warnings.push('No text found. Scanned (image-only) statements are not supported yet.');
  }
  return { lines, warnings };
}

/**
 * A statement layout turns text lines into a table plus the mapping for that table. Layouts are
 * tried in order and the one with the highest score wins, so bank-specific layouts can be added
 * without touching the generic one.
 */
export interface PdfStatementLayout {
  id: string;
  score(lines: PdfLine[]): number;
  parse(lines: PdfLine[]): { table: ExtractedTable; mapping: ColumnMapping; warnings: string[] };
}

const DATE_AT_START =
  /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[ -][A-Za-z]{3,4}[ -,]{1,2}\d{2,4})\s+(.*)$/;
const AMOUNT_TOKEN = /^\(?[-+]?[₹$]?\s?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\)?(?:\s?(?:Dr|DR|Cr|CR)\.?)?$/;

interface CandidateRow {
  dateText: string;
  description: string;
  amounts: string[];
}

function splitLine(text: string): CandidateRow | null {
  const match = DATE_AT_START.exec(text);
  if (!match) return null;
  const [, dateText, rest] = match;
  // Pull amount tokens off the end of the line.
  const tokens = rest.split(/\s{3,}|\s+/);
  const amounts: string[] = [];
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    const withMarker = tokens.length > 1 && /^(Dr|DR|Cr|CR)\.?$/.test(last) ? `${tokens[tokens.length - 2]} ${last}` : null;
    if (withMarker && AMOUNT_TOKEN.test(withMarker)) {
      amounts.unshift(withMarker);
      tokens.splice(-2, 2);
    } else if (AMOUNT_TOKEN.test(last)) {
      amounts.unshift(last);
      tokens.pop();
    } else {
      break;
    }
  }
  if (amounts.length === 0) return null;
  return { dateText, description: tokens.join(' ').trim(), amounts };
}

/**
 * Generic layout: each transaction line starts with a date and ends with one to three amounts.
 *  - two or more amounts: the last is the running balance; the sign of the movement comes from
 *    the change in balance (the most reliable signal on bank statements);
 *  - otherwise an explicit Dr/Cr marker decides;
 *  - on statements where credits carry "Cr" and debits carry nothing (typical for cards), an
 *    unmarked amount is a debit;
 *  - anything else is left unsigned and flagged ambiguous for review.
 * Lines without a date that follow a transaction are treated as wrapped descriptions.
 */
export const genericDatedLinesLayout: PdfStatementLayout = {
  id: 'generic-dated-lines',
  score(lines) {
    return lines.filter((l) => splitLine(l.text)).length;
  },
  parse(lines) {
    const warnings: string[] = [];
    const candidates: CandidateRow[] = [];
    let last: CandidateRow | null = null;
    for (const line of lines) {
      const row = splitLine(line.text);
      if (row) {
        candidates.push(row);
        last = row;
      } else if (last && isContinuation(line.text)) {
        last.description = `${last.description} ${line.text}`.trim();
      } else {
        last = null;
      }
    }

    const formats = detectDateFormats(candidates.map((c) => c.dateText));
    const dateFormat: DateFormat = formats[0] ?? 'DD/MM/YYYY';
    const creditsMarked = candidates.some((c) => c.amounts.some((a) => parseAmount(a)?.marker === 'CREDIT'));
    const debitsMarked = candidates.some((c) => c.amounts.some((a) => parseAmount(a)?.marker === 'DEBIT'));

    const rows: string[][] = [['Date', 'Description', 'Amount', 'Direction', 'Balance']];
    let previousBalance: bigint | null = null;
    for (const c of candidates) {
      // "Opening balance" / "Balance brought forward" lines seed the running balance.
      if (/\b(opening balance|balance b\/?f|brought forward)\b/i.test(c.description)) {
        const opening = parseAmount(c.amounts[c.amounts.length - 1]);
        if (opening) previousBalance = parseMoney(opening.value);
        continue;
      }
      const hasBalance = c.amounts.length >= 2;
      const balance = hasBalance ? parseAmount(c.amounts[c.amounts.length - 1]) : null;
      const movement = parseAmount(c.amounts[hasBalance ? c.amounts.length - 2 : 0]);
      if (!movement) continue;

      let direction = '';
      const magnitude = absolute(movement.value);
      if (balance && previousBalance !== null) {
        const delta = parseMoney(balance.value) - previousBalance;
        if (delta === -parseMoney(magnitude)) direction = 'DEBIT';
        else if (delta === parseMoney(magnitude)) direction = 'CREDIT';
      }
      if (!direction && movement.marker) direction = movement.marker;
      if (!direction && movement.value.startsWith('-')) direction = 'DEBIT';
      if (!direction && creditsMarked && !debitsMarked) direction = 'DEBIT';
      if (balance) previousBalance = parseMoney(balance.value);

      rows.push([parseDate(c.dateText, dateFormat) ?? c.dateText, c.description, magnitude, direction, balance?.value ?? '']);
    }
    if (rows.length === 1) warnings.push('No transaction lines were recognised in this PDF');

    return {
      table: { name: 'Statement', rows },
      mapping: {
        tableIndex: 0,
        headerRowIndex: 0,
        date: 0,
        description: [1],
        amount: 2,
        direction: 3,
        balance: 4,
        dateFormat: 'YYYY-MM-DD',
        invertAmounts: false,
      },
      warnings,
    };
  },
};

function isContinuation(text: string): boolean {
  if (text.length > 120) return false;
  // Page furniture that commonly sits between transactions.
  if (/\b(page \d+|opening balance|closing balance|statement|total|balance b\/f|balance c\/f)\b/i.test(text)) return false;
  return !/\d{1,3}(,\d{2,3})*\.\d{2}\s*$/.test(text);
}

export const PDF_LAYOUTS: PdfStatementLayout[] = [genericDatedLinesLayout];

export function parsePdfStatement(lines: PdfLine[], layouts = PDF_LAYOUTS) {
  const ranked = layouts.map((layout) => ({ layout, score: layout.score(lines) })).sort((a, b) => b.score - a.score);
  return ranked[0].layout.parse(lines);
}
