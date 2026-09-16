import type { ImportStatus, TransactionType } from '@arvo/types';

/*
 * Import domain. Statements go through:
 *   upload → detect → (column mapping) → normalize → validate → categorize → duplicate check
 *   → review (accept / reject / edit) → commit to the ledger.
 * Nothing reaches the ledger until the user commits.
 */

export type ImportFileType = 'CSV' | 'XLSX' | 'PDF';

/** A grid of cell strings: one CSV file, one spreadsheet sheet, or rows reconstructed from a PDF. */
export interface ExtractedTable {
  name: string;
  rows: string[][];
}

export interface Extraction {
  fileType: ImportFileType;
  tables: ExtractedTable[];
  warnings: string[];
  /** PDF layouts come with a fixed mapping; tabular files need detection or user input. */
  presetMapping?: ColumnMapping;
}

export type DateFormat =
  | 'YYYY-MM-DD'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'DD-MM-YYYY'
  | 'MM-DD-YYYY'
  | 'DD.MM.YYYY'
  | 'DD/MM/YY'
  | 'MM/DD/YY'
  | 'DD-MM-YY'
  | 'DD-MMM-YYYY'
  | 'DD MMM YYYY'
  | 'DD-MMM-YY'
  | 'DD MMM YY'
  | 'MMM DD, YYYY'
  | 'YYYY/MM/DD';

export interface ColumnMapping {
  tableIndex: number;
  /** Zero-based header row; -1 when the table has no header. Data starts on the next row. */
  headerRowIndex: number;
  date: number;
  /** One or more columns joined with a space (e.g. narration split over two columns). */
  description: number[];
  /** Signed amount column. Use this or debit/credit. */
  amount?: number;
  debit?: number;
  credit?: number;
  /** Column holding DR/CR (or DEBIT/CREDIT) that sets the sign of an unsigned amount. */
  direction?: number;
  currency?: number;
  reference?: number;
  balance?: number;
  dateFormat: DateFormat;
  /** Flip signs for statements that show spending as positive (common on credit cards). */
  invertAmounts: boolean;
}

export interface TableDetection {
  index: number;
  name: string;
  rowCount: number;
  headerRowIndex: number;
  headers: string[];
  sampleRows: string[][];
}

export interface Detection {
  tables: TableDetection[];
  suggestedMapping: ColumnMapping | null;
  mappingSource: 'PRESET' | 'REMEMBERED' | 'AUTO' | 'NONE';
  /** Formats that fit every sampled date; more than one means the user should confirm. */
  dateFormatCandidates: DateFormat[];
  warnings: string[];
}

export interface RowIssue {
  field: 'date' | 'description' | 'amount' | 'currency' | 'row';
  code: string;
  message: string;
}

/** One statement line after normalization, before ledger checks. */
export interface NormalizedRow {
  rowNumber: number;
  raw: string[];
  date: string | null;
  description: string | null;
  amount: string | null;
  currency: string | null;
  reference: string | null;
  /** The sign could not be determined (e.g. a PDF line without balance or DR/CR marker). */
  signUnknown: boolean;
  issues: RowIssue[];
}

export interface SkippedLine {
  rowNumber: number;
  reason: string;
}

export interface NormalizeResult {
  rows: NormalizedRow[];
  skipped: SkippedLine[];
}

/** Implemented by @arvo/imports. */
export interface StatementParser {
  detectFileType(filename: string, bytes: Uint8Array): ImportFileType | null;
  extract(fileType: ImportFileType, bytes: Uint8Array): Promise<Extraction>;
  detect(extraction: Extraction, remembered?: ColumnMapping | null): Detection;
  /** Stable signature of a table's header, used to remember mappings per statement format. */
  headerSignature(extraction: Extraction, mapping: Pick<ColumnMapping, 'tableIndex' | 'headerRowIndex'>): string | null;
  normalize(extraction: Extraction, mapping: ColumnMapping): NormalizeResult;
}

/** Stores uploaded statements. Keys are opaque and never derived from user-supplied names. */
export interface FileStore {
  save(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export type ImportRowStatus = 'VALID' | 'INVALID' | 'POSSIBLE_DUPLICATE' | 'AMBIGUOUS';
export type ImportRowDecision = 'PENDING' | 'ACCEPT' | 'REJECT';
export type CategorizationSource = 'RULE' | 'MERCHANT' | 'HISTORY' | 'AI' | 'USER';

export interface ImportBatchRecord {
  id: string;
  userId: string;
  accountId: string;
  filename: string;
  fileType: ImportFileType;
  fileHash: string;
  fileSize: number;
  storageKey: string;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  mapping: ColumnMapping | null;
  detection: Detection | null;
  duplicateOfBatchId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface ImportRowRecord {
  id: string;
  batchId: string;
  userId: string;
  rowNumber: number;
  raw: string[];
  date: string | null;
  description: string | null;
  amount: string | null;
  currency: string | null;
  type: TransactionType | null;
  merchantName: string | null;
  categoryId: string | null;
  categorizationSource: CategorizationSource | null;
  sourceReference: string | null;
  fingerprint: string | null;
  status: ImportRowStatus;
  decision: ImportRowDecision;
  duplicateOfTransactionId: string | null;
  issues: RowIssue[];
  transactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportErrorRecord {
  id: string;
  batchId: string;
  userId: string;
  rowNumber: number | null;
  code: string;
  message: string;
  createdAt: Date;
}

export type NewImportBatch = Omit<ImportBatchRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type ImportBatchPatch = Partial<
  Pick<
    ImportBatchRecord,
    'status' | 'totalRows' | 'processedRows' | 'mapping' | 'detection' | 'errorMessage' | 'completedAt'
  >
>;
export type NewImportRow = Omit<ImportRowRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type ImportRowPatch = Partial<Omit<ImportRowRecord, 'id' | 'batchId' | 'userId' | 'rowNumber' | 'raw' | 'createdAt' | 'updatedAt'>>;
export type NewImportError = Omit<ImportErrorRecord, 'id' | 'createdAt'>;

export interface ImportRowFilter {
  statuses?: ImportRowStatus[];
  decisions?: ImportRowDecision[];
  limit: number;
  offset: number;
}

export interface ImportRepository {
  findBatches(userId: string): Promise<ImportBatchRecord[]>;
  findBatch(userId: string, id: string): Promise<ImportBatchRecord | null>;
  findCompletedBatchByHash(userId: string, accountId: string, fileHash: string): Promise<ImportBatchRecord | null>;
  createBatch(input: NewImportBatch): Promise<ImportBatchRecord>;
  updateBatch(userId: string, id: string, patch: ImportBatchPatch): Promise<ImportBatchRecord>;
  deleteBatch(userId: string, id: string): Promise<void>;

  findRows(userId: string, batchId: string, filter: ImportRowFilter): Promise<{ items: ImportRowRecord[]; total: number }>;
  findAllRows(userId: string, batchId: string): Promise<ImportRowRecord[]>;
  findRow(userId: string, batchId: string, rowId: string): Promise<ImportRowRecord | null>;
  replaceRows(userId: string, batchId: string, rows: NewImportRow[]): Promise<void>;
  updateRow(userId: string, batchId: string, rowId: string, patch: ImportRowPatch): Promise<ImportRowRecord>;
  /** Sets the decision on matching rows; returns how many changed. */
  setDecisions(
    userId: string,
    batchId: string,
    where: { rowIds?: string[]; statuses?: ImportRowStatus[] },
    decision: ImportRowDecision,
  ): Promise<number>;
  countRows(userId: string, batchId: string): Promise<{ status: ImportRowStatus; decision: ImportRowDecision; count: number }[]>;

  replaceErrors(userId: string, batchId: string, errors: NewImportError[]): Promise<void>;
  findErrors(userId: string, batchId: string): Promise<ImportErrorRecord[]>;

  findRememberedMapping(userId: string, headerSignature: string): Promise<ColumnMapping | null>;
  rememberMapping(userId: string, headerSignature: string, mapping: ColumnMapping): Promise<void>;
}
