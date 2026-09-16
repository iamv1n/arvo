import type { ColumnMapping, Extraction, ImportFileType, StatementParser } from '@arvo/finance-core';
import { decodeText, detectDelimiter, parseCsv } from './csv';
import { detect, headerSignature } from './mapping';
import { normalizeRows } from './normalize';
import { extractPdfLines, parsePdfStatement } from './pdf';
import { extractXlsx } from './xlsx';

/**
 * File type from content, not the name: %PDF for PDF, a ZIP container holding an Excel
 * workbook for XLSX, and printable text for CSV. The extension only breaks ties.
 */
export function detectFileType(filename: string, bytes: Uint8Array): ImportFileType | null {
  const head = Buffer.from(bytes.subarray(0, 8));
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'PDF';
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    const probe = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 64_000))).toString('latin1');
    return probe.includes('xl/') || extension === 'xlsx' ? 'XLSX' : null;
  }
  // Legacy .xls (OLE compound file) is not supported.
  if (head[0] === 0xd0 && head[1] === 0xcf) return null;
  if (looksLikeText(bytes) && ['csv', 'txt', 'tsv', ''].includes(extension)) return 'CSV';
  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return control / Math.max(1, sample.length) < 0.01;
}

export class ArvoStatementParser implements StatementParser {
  detectFileType = detectFileType;

  async extract(fileType: ImportFileType, bytes: Uint8Array): Promise<Extraction> {
    switch (fileType) {
      case 'CSV': {
        const text = decodeText(bytes);
        return { fileType, tables: [{ name: 'CSV', rows: parseCsv(text, detectDelimiter(text)) }], warnings: [] };
      }
      case 'XLSX': {
        const { tables, warnings } = await extractXlsx(bytes);
        return { fileType, tables, warnings };
      }
      case 'PDF': {
        const { lines, warnings } = await extractPdfLines(bytes);
        const parsed = parsePdfStatement(lines);
        return {
          fileType,
          tables: [parsed.table],
          warnings: [...warnings, ...parsed.warnings],
          presetMapping: parsed.mapping,
        };
      }
    }
  }

  detect = detect;
  headerSignature = headerSignature;

  normalize(extraction: Extraction, mapping: ColumnMapping) {
    return normalizeRows(extraction, mapping);
  }
}
