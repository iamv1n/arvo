import { createHash } from 'node:crypto';
import type { ColumnMapping, Detection, Extraction, TableDetection } from '@arvo/finance-core';
import { amountColumnScore } from './amounts';
import { dateColumnScore, detectDateFormats } from './dates';

type Role = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'direction' | 'balance' | 'reference' | 'currency';

/** Header synonyms, most specific first. Matching is on lower-case text with punctuation removed. */
const SYNONYMS: Record<Role, string[]> = {
  date: ['transaction date', 'txn date', 'tran date', 'trans date', 'posting date', 'post date', 'date', 'value date', 'value dt'],
  description: ['description', 'narration', 'particulars', 'transaction details', 'details', 'remarks', 'transaction remarks', 'merchant', 'payee', 'memo'],
  amount: ['transaction amount', 'amount inr', 'amount', 'amt', 'txn amount'],
  debit: ['withdrawal amt', 'withdrawal amount', 'withdrawals', 'withdrawal', 'debit amount', 'debits', 'debit', 'dr amount', 'paid out', 'money out', 'dr'],
  credit: ['deposit amt', 'deposit amount', 'deposits', 'deposit', 'credit amount', 'credits', 'credit', 'cr amount', 'paid in', 'money in', 'cr'],
  direction: ['dr cr', 'cr dr', 'debit credit', 'type', 'txn type', 'transaction type'],
  balance: ['closing balance', 'running balance', 'available balance', 'balance'],
  reference: ['chq ref no', 'ref no', 'reference no', 'reference', 'cheque no', 'chq no', 'utr', 'transaction id', 'txn id', 'ref'],
  currency: ['currency', 'ccy', 'curr'],
};

const clean = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function headerRole(header: string): { role: Role; rank: number } | null {
  const text = clean(header);
  if (!text) return null;
  let best: { role: Role; rank: number } | null = null;
  for (const [role, words] of Object.entries(SYNONYMS) as [Role, string[]][]) {
    words.forEach((word, index) => {
      const exact = text === word;
      const partial = !exact && word.length > 3 && (text.startsWith(`${word} `) || text.endsWith(` ${word}`));
      if (!exact && !partial) return;
      const rank = index + (exact ? 0 : 50);
      if (!best || rank < best.rank) best = { role, rank };
    });
  }
  return best;
}

const HEADER_SCAN_ROWS = 40;

/** Finds the row that looks most like a header: the most cells naming known columns (at least 2). */
export function detectHeaderRow(rows: string[][]): number {
  let bestIndex = -1;
  let bestScore = 1;
  rows.slice(0, HEADER_SCAN_ROWS).forEach((row, index) => {
    const roles = new Set(row.map(headerRole).filter(Boolean).map((r) => r!.role));
    const score = roles.size + (roles.has('date') ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function columnCount(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

export function headersFor(rows: string[][], headerRowIndex: number): string[] {
  const count = columnCount(rows);
  const header = headerRowIndex >= 0 ? rows[headerRowIndex] ?? [] : [];
  return Array.from({ length: count }, (_, i) => header[i]?.trim() || `Column ${i + 1}`);
}

function dataRows(rows: string[][], headerRowIndex: number): string[][] {
  return rows.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell.trim() !== ''));
}

/** Builds a mapping from header names, falling back to content sniffing for date and amount. */
export function suggestMapping(rows: string[][], tableIndex: number): ColumnMapping | null {
  const headerRowIndex = detectHeaderRow(rows);
  const headers = headersFor(rows, headerRowIndex);
  const sample = dataRows(rows, headerRowIndex).slice(0, 50);
  const column = (i: number) => sample.map((row) => row[i] ?? '');

  const chosen: Partial<Record<Role, { index: number; rank: number }>> = {};
  const descriptionColumns: number[] = [];
  if (headerRowIndex >= 0) {
    headers.forEach((header, index) => {
      const match = headerRole(header);
      if (!match) return;
      if (match.role === 'description') {
        if (match.rank < 50 || descriptionColumns.length === 0) descriptionColumns.push(index);
        return;
      }
      const current = chosen[match.role];
      if (!current || match.rank < current.rank) chosen[match.role] = { index, rank: match.rank };
    });
  }

  // Content sniffing when headers are missing or unhelpful.
  const columns = headers.map((_, i) => i);
  if (!chosen.date) {
    const best = columns
      .map((i) => ({ i, score: dateColumnScore(column(i)) }))
      .filter((c) => c.score >= 0.8)
      .sort((a, b) => b.score - a.score || a.i - b.i)[0];
    if (best) chosen.date = { index: best.i, rank: 99 };
  }
  const used = new Set(Object.values(chosen).map((c) => c!.index));
  if (!chosen.amount && !chosen.debit && !chosen.credit) {
    const numeric = columns.filter((i) => !used.has(i) && amountColumnScore(column(i)) >= 0.9 && column(i).some((v) => v.trim()));
    // With a trailing balance column, the amount is the one before it.
    const pick = numeric.length >= 2 ? numeric[numeric.length - 2] : numeric[0];
    if (pick !== undefined) chosen.amount = { index: pick, rank: 99 };
  }
  if (descriptionColumns.length === 0) {
    const allUsed = new Set(Object.values(chosen).map((c) => c!.index));
    const textColumn = columns
      .filter((i) => !allUsed.has(i))
      .map((i) => ({ i, length: column(i).reduce((sum, v) => sum + (amountColumnScore([v]) ? 0 : v.length), 0) }))
      .sort((a, b) => b.length - a.length)[0];
    if (textColumn && textColumn.length > 0) descriptionColumns.push(textColumn.i);
  }

  if (!chosen.date || descriptionColumns.length === 0 || (!chosen.amount && !chosen.debit && !chosen.credit)) {
    return null;
  }
  const hasDebitCredit = chosen.debit !== undefined || chosen.credit !== undefined;
  const dateFormat = detectDateFormats(column(chosen.date.index))[0] ?? 'DD/MM/YYYY';
  return {
    tableIndex,
    headerRowIndex,
    date: chosen.date.index,
    description: descriptionColumns,
    amount: hasDebitCredit ? undefined : chosen.amount?.index,
    debit: chosen.debit?.index,
    credit: chosen.credit?.index,
    direction: !hasDebitCredit ? chosen.direction?.index : undefined,
    balance: chosen.balance?.index,
    reference: chosen.reference?.index,
    currency: chosen.currency?.index,
    dateFormat,
    invertAmounts: false,
  };
}

const SAMPLE_ROWS = 15;

export function detect(extraction: Extraction, remembered?: ColumnMapping | null): Detection {
  const tables: TableDetection[] = extraction.tables.map((table, index) => {
    const headerRowIndex = extraction.presetMapping?.tableIndex === index ? extraction.presetMapping.headerRowIndex : detectHeaderRow(table.rows);
    return {
      index,
      name: table.name,
      rowCount: dataRows(table.rows, headerRowIndex).length,
      headerRowIndex,
      headers: headersFor(table.rows, headerRowIndex),
      sampleRows: dataRows(table.rows, headerRowIndex).slice(0, SAMPLE_ROWS),
    };
  });

  let suggestedMapping: ColumnMapping | null = null;
  let mappingSource: Detection['mappingSource'] = 'NONE';
  if (extraction.presetMapping) {
    suggestedMapping = extraction.presetMapping;
    mappingSource = 'PRESET';
  } else if (remembered && extraction.tables[remembered.tableIndex]) {
    suggestedMapping = remembered;
    mappingSource = 'REMEMBERED';
  } else {
    // Prefer the table with the most data rows that yields a complete mapping.
    const ranked = [...tables].sort((a, b) => b.rowCount - a.rowCount);
    for (const table of ranked) {
      suggestedMapping = suggestMapping(extraction.tables[table.index].rows, table.index);
      if (suggestedMapping) {
        mappingSource = 'AUTO';
        break;
      }
    }
  }

  let dateFormatCandidates: Detection['dateFormatCandidates'] = [];
  if (suggestedMapping) {
    const table = extraction.tables[suggestedMapping.tableIndex];
    const samples = dataRows(table.rows, suggestedMapping.headerRowIndex).map((r) => r[suggestedMapping!.date] ?? '');
    dateFormatCandidates = detectDateFormats(samples.slice(0, 200));
  }

  const warnings = [...extraction.warnings];
  if (!suggestedMapping) warnings.push('Columns could not be detected automatically. Please map them.');
  if (dateFormatCandidates.length > 1 && mappingSource !== 'REMEMBERED') {
    warnings.push(`Dates could be read as ${dateFormatCandidates.slice(0, 2).join(' or ')}. Please confirm the format.`);
  }
  return { tables, suggestedMapping, mappingSource, dateFormatCandidates, warnings };
}

/** Header layout fingerprint for remembering a mapping per statement format. */
export function headerSignature(
  extraction: Extraction,
  mapping: Pick<ColumnMapping, 'tableIndex' | 'headerRowIndex'>,
): string | null {
  const table = extraction.tables[mapping.tableIndex];
  if (!table || mapping.headerRowIndex < 0) return null;
  const header = (table.rows[mapping.headerRowIndex] ?? []).map(clean);
  if (header.filter(Boolean).length < 2) return null;
  return createHash('sha256').update(header.join('|')).digest('hex');
}
