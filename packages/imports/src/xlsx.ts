import type { ExtractedTable } from '@arvo/finance-core';
import ExcelJS from 'exceljs';

const MAX_SHEETS = 20;

/** Reads every visible worksheet into string grids. Dates become YYYY-MM-DD; formulas use cached results. */
export async function extractXlsx(bytes: Uint8Array): Promise<{ tables: ExtractedTable[]; warnings: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const warnings: string[] = [];
  const tables: ExtractedTable[] = [];

  workbook.worksheets.slice(0, MAX_SHEETS).forEach((sheet) => {
    if (sheet.state !== 'visible') return;
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        cells.push(cellText(row.getCell(col).value));
      }
      rows[rowNumber - 1] = cells;
    });
    // Fill gaps left by rows ExcelJS never materialised.
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    tables.push({ name: sheet.name, rows: trimTrailingEmpty(rows) });
  });
  if (workbook.worksheets.length > MAX_SHEETS) {
    warnings.push(`Only the first ${MAX_SHEETS} sheets were read`);
  }
  return { tables, warnings };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel dates carry no timezone; read the calendar date as written.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value).trim();
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) return cellText(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((r) => r.text).join('').trim();
    if ('text' in value) return String(value.text).trim();
    if ('error' in value) return '';
  }
  return String(value).trim();
}

/** Avoids binary float noise such as 0.30000000000000004 while keeping up to 4 decimals. */
function numberText(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4)));
}

function trimTrailingEmpty(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((c) => c === '')) end--;
  return rows.slice(0, end);
}
