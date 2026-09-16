import type { ColumnMapping, Extraction, NormalizeResult, NormalizedRow, RowIssue } from '@arvo/finance-core';
import { parseMoney } from '@arvo/finance-core';
import { absolute, negate, parseAmount, parseDirection } from './amounts';
import { parseDate } from './dates';

const cell = (row: string[], index: number | undefined) => (index === undefined || index === null ? '' : (row[index] ?? '').trim());

/**
 * Turns table rows into normalized statement rows using the column mapping.
 * Empty lines are ignored; lines with neither a date nor an amount (titles, totals, footers)
 * are reported as skipped; everything else becomes a row, with issues when invalid.
 */
export function normalizeRows(extraction: Extraction, mapping: ColumnMapping): NormalizeResult {
  const table = extraction.tables[mapping.tableIndex];
  const result: NormalizeResult = { rows: [], skipped: [] };
  if (!table) return result;

  table.rows.forEach((raw, index) => {
    if (index <= mapping.headerRowIndex) return;
    const rowNumber = index + 1;
    if (raw.every((c) => c.trim() === '')) return;

    const issues: RowIssue[] = [];
    const dateText = cell(raw, mapping.date);
    const date = dateText ? parseDate(dateText, mapping.dateFormat) : null;
    const description = mapping.description.map((i) => cell(raw, i)).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 500) || null;

    const { amount, signUnknown, amountIssue, hasAmountText } = readAmount(raw, mapping);

    if (!date && !hasAmountText) {
      result.skipped.push({ rowNumber, reason: summarize(raw) });
      return;
    }
    if (!dateText) issues.push({ field: 'date', code: 'MISSING_DATE', message: 'Date is missing' });
    else if (!date) issues.push({ field: 'date', code: 'INVALID_DATE', message: `"${dateText}" is not a ${mapping.dateFormat} date` });
    if (!description) issues.push({ field: 'description', code: 'MISSING_DESCRIPTION', message: 'Description is missing' });
    if (amountIssue) issues.push(amountIssue);

    const currencyText = cell(raw, mapping.currency).toUpperCase();
    const row: NormalizedRow = {
      rowNumber,
      raw,
      date,
      description,
      amount,
      currency: /^[A-Z]{3}$/.test(currencyText) ? currencyText : null,
      reference: cell(raw, mapping.reference).slice(0, 255) || null,
      signUnknown,
      issues,
    };
    result.rows.push(row);
  });
  return result;
}

function readAmount(
  raw: string[],
  mapping: ColumnMapping,
): { amount: string | null; signUnknown: boolean; amountIssue: RowIssue | null; hasAmountText: boolean } {
  const invalid = (message: string, hasAmountText = true) => ({
    amount: null,
    signUnknown: false,
    amountIssue: { field: 'amount' as const, code: 'INVALID_AMOUNT', message },
    hasAmountText,
  });

  let value: string;
  let signUnknown = false;

  if (mapping.amount !== undefined && mapping.amount !== null) {
    const text = cell(raw, mapping.amount);
    if (!text) return invalid('Amount is missing', false);
    const parsed = parseAmount(text);
    if (!parsed) return invalid(`"${text}" is not an amount`);
    value = parsed.value;

    const directionText = cell(raw, mapping.direction);
    const direction = mapping.direction !== undefined ? parseDirection(directionText) : null;
    const marker = direction ?? parsed.marker;
    if (marker === 'DEBIT') value = negate(absolute(value));
    else if (marker === 'CREDIT') value = absolute(value);
    else if (mapping.direction !== undefined && !value.startsWith('-')) signUnknown = true;
  } else {
    const debitText = cell(raw, mapping.debit);
    const creditText = cell(raw, mapping.credit);
    const debit = debitText ? parseAmount(debitText) : null;
    const credit = creditText ? parseAmount(creditText) : null;
    if (debitText && !debit) return invalid(`"${debitText}" is not an amount`);
    if (creditText && !credit) return invalid(`"${creditText}" is not an amount`);
    const debitUnits = debit ? parseMoney(debit.value) : 0n;
    const creditUnits = credit ? parseMoney(credit.value) : 0n;
    if (debitUnits !== 0n && creditUnits !== 0n) return invalid('Both debit and credit have a value');
    if (debitUnits === 0n && creditUnits === 0n) return invalid('Debit and credit are both empty', !!(debitText || creditText));
    value = debitUnits !== 0n ? negate(absolute(debit!.value)) : absolute(credit!.value);
  }

  if (mapping.invertAmounts) value = negate(value);
  if (parseMoney(value) === 0n) return invalid('Amount is zero');
  return { amount: value, signUnknown, amountIssue: null, hasAmountText: true };
}

function summarize(raw: string[]): string {
  const text = raw.filter((c) => c.trim()).join(' | ');
  return text.length > 120 ? `${text.slice(0, 117)}…` : text || '(blank)';
}
