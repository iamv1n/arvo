import { createHash, randomUUID } from 'node:crypto';
import {
  ImportStatus,
  LIABILITY_ACCOUNT_TYPES,
  TransactionSource,
  TransactionStatus,
  TransactionType,
  type AccountType,
} from '@arvo/types';
import { isIsoDate } from '../dates';
import { DomainError } from '../errors';
import { transactionFingerprint } from '../fingerprint';
import { formatMoney, isMoneyString, parseMoney } from '../money';
import { normalizeText } from '../normalize';
import type { FinanceStore } from '../ports';
import { categorize, descriptionPatternKey, mostFrequent, type CategorizationContext } from '../rules/categorizer';
import { MerchantService } from '../services/merchant.service';
import { requireActiveAccount } from '../services/transaction.service';
import type {
  ColumnMapping,
  FileStore,
  ImportBatchRecord,
  ImportErrorRecord,
  ImportFileType,
  ImportRowDecision,
  ImportRowRecord,
  ImportRowStatus,
  NewImportRow,
  RowIssue,
  StatementParser,
} from './types';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;
const SOURCE_BY_FILE_TYPE: Record<ImportFileType, TransactionSource> = {
  CSV: TransactionSource.CSV,
  XLSX: TransactionSource.XLSX,
  PDF: TransactionSource.PDF,
};

export interface ImportSummary {
  batch: ImportBatchRecord;
  counts: {
    total: number;
    byStatus: Record<ImportRowStatus, number>;
    byDecision: Record<ImportRowDecision, number>;
    committed: number;
  };
  errors: ImportErrorRecord[];
}

export interface ImportRowEdit {
  date?: string;
  description?: string;
  amount?: string;
  type?: TransactionType;
  categoryId?: string | null;
  merchantName?: string | null;
  decision?: ImportRowDecision;
}

export interface ImportDependencies {
  parser: StatementParser;
  files: FileStore;
}

/** Keyword-based type inference for imported rows; users can override during review. */
export function inferTransactionType(amount: bigint, description: string, accountType: AccountType): TransactionType {
  const text = ` ${normalizeText(description)} `;
  const has = (...words: string[]) => words.some((w) => text.includes(` ${w} `));
  if (amount > 0n) {
    if (has('REFUND', 'REVERSAL', 'REVERSED', 'CASHBACK')) return TransactionType.REFUND;
    if (has('INTEREST', 'INT PD', 'INT CR', 'INT CREDIT')) return TransactionType.INTEREST;
    // Credits on a card or loan are usually payments from another account: needs review.
    if (LIABILITY_ACCOUNT_TYPES.includes(accountType)) return TransactionType.UNKNOWN;
    return TransactionType.INCOME;
  }
  if (has('INTEREST', 'FINANCE CHARGE', 'FINANCE CHARGES')) return TransactionType.INTEREST;
  if (has('FEE', 'FEES', 'CHARGE', 'CHARGES', 'GST', 'PENALTY', 'SURCHARGE')) return TransactionType.FEE;
  return TransactionType.EXPENSE;
}

export class ImportService {
  constructor(
    private readonly store: FinanceStore,
    private readonly deps: ImportDependencies,
  ) {}

  list(userId: string): Promise<ImportBatchRecord[]> {
    return this.store.imports.findBatches(userId);
  }

  async upload(
    userId: string,
    input: { accountId: string; filename: string; bytes: Uint8Array },
  ): Promise<ImportBatchRecord> {
    const account = await requireActiveAccount(this.store, userId, input.accountId);
    if (input.bytes.byteLength === 0) {
      throw DomainError.validation('IMPORT_EMPTY_FILE', 'The file is empty');
    }
    if (input.bytes.byteLength > MAX_IMPORT_BYTES) {
      throw DomainError.validation('IMPORT_FILE_TOO_LARGE', `Files must be at most ${MAX_IMPORT_BYTES / 1024 / 1024} MB`);
    }
    const fileType = this.deps.parser.detectFileType(input.filename, input.bytes);
    if (!fileType) {
      throw DomainError.validation('IMPORT_UNSUPPORTED_FILE', 'Only CSV, XLSX and PDF statements are supported');
    }

    const fileHash = createHash('sha256').update(input.bytes).digest('hex');
    const previous = await this.store.imports.findCompletedBatchByHash(userId, account.id, fileHash);
    const storageKey = `${userId}/${randomUUID()}.${fileType.toLowerCase()}`;
    await this.deps.files.save(storageKey, input.bytes);

    const batch = await this.store.imports.createBatch({
      userId,
      accountId: account.id,
      filename: safeDisplayName(input.filename),
      fileType,
      fileHash,
      fileSize: input.bytes.byteLength,
      storageKey,
      status: ImportStatus.PENDING,
      totalRows: 0,
      processedRows: 0,
      mapping: null,
      detection: null,
      duplicateOfBatchId: previous?.id ?? null,
      errorMessage: null,
      completedAt: null,
    });

    let detectionReady: ImportBatchRecord;
    try {
      const extraction = await this.deps.parser.extract(fileType, input.bytes);
      if (!extraction.tables.some((t) => t.rows.length > 0)) {
        return this.fail(userId, batch.id, 'No rows could be read from this file');
      }
      const firstPass = this.deps.parser.detect(extraction);
      let remembered: ColumnMapping | null = null;
      if (firstPass.suggestedMapping && firstPass.mappingSource === 'AUTO') {
        const signature = this.deps.parser.headerSignature(extraction, firstPass.suggestedMapping);
        remembered = signature ? await this.store.imports.findRememberedMapping(userId, signature) : null;
      }
      const detection = remembered ? this.deps.parser.detect(extraction, remembered) : firstPass;
      if (previous) {
        detection.warnings.unshift(
          `This exact file was already imported on ${previous.completedAt?.toISOString().slice(0, 10) ?? 'an earlier date'}.`,
        );
      }
      detectionReady = await this.store.imports.updateBatch(userId, batch.id, { detection });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      return this.fail(userId, batch.id, 'The file could not be read. It may be damaged or password protected.');
    }

    // PDF layouts map themselves; go straight to review.
    const detection = detectionReady.detection;
    if (detection?.mappingSource === 'PRESET' && detection.suggestedMapping) {
      return (await this.process(userId, batch.id, detection.suggestedMapping)).batch;
    }
    return detectionReady;
  }

  /** Normalizes, validates, categorizes and duplicate-checks every row, replacing earlier results. */
  async process(userId: string, batchId: string, mapping: ColumnMapping): Promise<ImportSummary> {
    const batch = await this.requireBatch(userId, batchId);
    if (batch.status !== ImportStatus.PENDING && batch.status !== ImportStatus.REVIEW) {
      throw DomainError.conflict('IMPORT_NOT_EDITABLE', `Import is ${batch.status.toLowerCase()}`);
    }
    const account = await requireActiveAccount(this.store, userId, batch.accountId);
    validateMapping(mapping);

    const bytes = await this.deps.files.read(batch.storageKey);
    const extraction = await this.deps.parser.extract(batch.fileType, bytes);
    if (!extraction.tables[mapping.tableIndex]) {
      throw DomainError.validation('IMPORT_INVALID_MAPPING', 'Selected table does not exist');
    }
    const { rows, skipped } = this.deps.parser.normalize(extraction, mapping);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw DomainError.validation('IMPORT_TOO_MANY_ROWS', `Statements may contain at most ${MAX_IMPORT_ROWS} rows`);
    }

    const ctx = await this.categorizationContext(userId, rows.map((r) => r.description ?? ''));
    const prepared: NewImportRow[] = rows.map((row) => {
      const issues: RowIssue[] = [...row.issues];
      if (row.currency && row.currency !== account.currency) {
        issues.push({
          field: 'currency',
          code: 'CURRENCY_MISMATCH',
          message: `Row currency ${row.currency} differs from account currency ${account.currency}`,
        });
      }
      const base: NewImportRow = {
        batchId,
        userId,
        rowNumber: row.rowNumber,
        raw: row.raw,
        date: row.date,
        description: row.description,
        amount: row.amount,
        currency: account.currency,
        type: null,
        merchantName: null,
        categoryId: null,
        categorizationSource: null,
        sourceReference: row.reference,
        fingerprint: null,
        status: 'VALID',
        decision: 'ACCEPT',
        duplicateOfTransactionId: null,
        issues,
        transactionId: null,
      };
      if (row.date && row.description && row.amount) {
        const result = categorize({ description: row.description, amount: row.amount }, ctx);
        base.type = result.type ?? inferTransactionType(parseMoney(row.amount), row.description, account.type);
        base.categoryId = result.categoryId;
        base.merchantName = result.merchantName;
        base.categorizationSource = result.source;
        base.fingerprint = transactionFingerprint({
          accountId: account.id,
          date: row.date,
          amount: row.amount,
          description: row.description,
        });
      }
      return classify(base, row.signUnknown);
    });

    await this.markDuplicates(userId, account.id, prepared);

    await this.store.transaction(async (repos) => {
      await repos.imports.replaceRows(userId, batchId, prepared);
      await repos.imports.replaceErrors(userId, batchId, [
        ...extraction.warnings.map((message) => ({ batchId, userId, rowNumber: null, code: 'FILE_WARNING', message })),
        ...skipped.map((s) => ({ batchId, userId, rowNumber: s.rowNumber, code: 'ROW_SKIPPED', message: s.reason })),
      ]);
      await repos.imports.updateBatch(userId, batchId, {
        status: ImportStatus.REVIEW,
        mapping,
        totalRows: prepared.length,
        processedRows: 0,
        errorMessage: null,
      });
    });

    if (batch.fileType !== 'PDF') {
      const signature = this.deps.parser.headerSignature(extraction, mapping);
      if (signature) await this.store.imports.rememberMapping(userId, signature, mapping);
    }
    return this.summary(userId, batchId);
  }

  async summary(userId: string, batchId: string): Promise<ImportSummary> {
    const batch = await this.requireBatch(userId, batchId);
    const [counts, errors] = await Promise.all([
      this.store.imports.countRows(userId, batchId),
      this.store.imports.findErrors(userId, batchId),
    ]);
    const byStatus: Record<ImportRowStatus, number> = { VALID: 0, INVALID: 0, POSSIBLE_DUPLICATE: 0, AMBIGUOUS: 0 };
    const byDecision: Record<ImportRowDecision, number> = { PENDING: 0, ACCEPT: 0, REJECT: 0 };
    let total = 0;
    for (const c of counts) {
      byStatus[c.status] += c.count;
      byDecision[c.decision] += c.count;
      total += c.count;
    }
    return { batch, counts: { total, byStatus, byDecision, committed: batch.processedRows }, errors };
  }

  async rows(
    userId: string,
    batchId: string,
    filter: { statuses?: ImportRowStatus[]; decisions?: ImportRowDecision[]; limit?: number; offset?: number },
  ) {
    await this.requireBatch(userId, batchId);
    return this.store.imports.findRows(userId, batchId, {
      statuses: filter.statuses,
      decisions: filter.decisions,
      limit: Math.min(500, Math.max(1, filter.limit ?? 100)),
      offset: Math.max(0, filter.offset ?? 0),
    });
  }

  /** Edits a row under review and re-validates it, including the duplicate check. */
  async updateRow(userId: string, batchId: string, rowId: string, edit: ImportRowEdit): Promise<ImportRowRecord> {
    const batch = await this.requireReviewBatch(userId, batchId);
    const row = await this.store.imports.findRow(userId, batchId, rowId);
    if (!row) throw DomainError.notFound('IMPORT_ROW_NOT_FOUND', 'Import row not found');

    const next: NewImportRow = { ...row };
    const contentChanged =
      edit.date !== undefined || edit.description !== undefined || edit.amount !== undefined || edit.type !== undefined;
    if (edit.date !== undefined) next.date = edit.date;
    if (edit.description !== undefined) next.description = edit.description.trim() || null;
    if (edit.amount !== undefined) {
      next.amount = isMoneyString(edit.amount) ? formatMoney(parseMoney(edit.amount)) : edit.amount;
    }
    if (edit.type !== undefined) next.type = edit.type;
    if (edit.merchantName !== undefined) next.merchantName = edit.merchantName?.trim() || null;
    if (edit.categoryId !== undefined) {
      if (edit.categoryId && !(await this.store.categories.findVisibleById(userId, edit.categoryId))) {
        throw DomainError.notFound('CATEGORY_NOT_FOUND', 'Category not found');
      }
      next.categoryId = edit.categoryId;
      next.categorizationSource = edit.categoryId ? 'USER' : null;
    }

    if (contentChanged) {
      next.issues = next.issues.filter((i) => i.field === 'currency');
      if (!next.date || !isIsoDate(next.date)) {
        next.issues.push({ field: 'date', code: 'INVALID_DATE', message: 'Date is missing or invalid' });
      }
      if (!next.description) {
        next.issues.push({ field: 'description', code: 'MISSING_DESCRIPTION', message: 'Description is required' });
      }
      const amountValid = !!next.amount && isMoneyString(next.amount) && parseMoney(next.amount) !== 0n;
      if (!amountValid) {
        next.issues.push({ field: 'amount', code: 'INVALID_AMOUNT', message: 'Amount is missing or invalid' });
      }
      if (!next.type && amountValid && next.description) {
        const account = await requireActiveAccount(this.store, userId, batch.accountId);
        next.type = inferTransactionType(parseMoney(next.amount!), next.description, account.type);
      }
      next.fingerprint =
        next.date && isIsoDate(next.date) && next.description && amountValid
          ? transactionFingerprint({
              accountId: batch.accountId,
              date: next.date,
              amount: next.amount!,
              description: next.description,
            })
          : null;

      // An edit is an explicit user review, so the row is no longer ambiguous about its sign.
      const classified = classify({ ...next, duplicateOfTransactionId: null }, false);
      await this.markDuplicates(userId, batch.accountId, [classified], rowId);
      next.issues = classified.issues;
      next.status = classified.status;
      next.duplicateOfTransactionId = classified.duplicateOfTransactionId;
      next.decision = classified.status === 'INVALID' ? 'REJECT' : classified.decision;
    }

    if (edit.decision !== undefined) next.decision = edit.decision;
    if (next.decision === 'ACCEPT' && next.status === 'INVALID') {
      throw DomainError.validation('IMPORT_ROW_INVALID', 'Fix the row before accepting it', next.issues);
    }

    const { batchId: _batchId, userId: _userId, rowNumber: _rowNumber, raw: _raw, ...patch } = next;
    return this.store.imports.updateRow(userId, batchId, rowId, patch);
  }

  /** Accepts or rejects rows in bulk, by id or by status. Invalid rows can never be accepted. */
  async setDecision(
    userId: string,
    batchId: string,
    where: { rowIds?: string[]; statuses?: ImportRowStatus[] },
    decision: ImportRowDecision,
  ): Promise<number> {
    await this.requireReviewBatch(userId, batchId);
    if (!where.rowIds?.length && !where.statuses?.length) {
      throw DomainError.validation('INVALID_INPUT', 'Provide rowIds or statuses');
    }
    if (decision === 'ACCEPT') {
      if (where.statuses?.includes('INVALID')) {
        throw DomainError.validation('IMPORT_ROW_INVALID', 'Invalid rows cannot be accepted');
      }
      if (where.rowIds?.length) {
        const wanted = new Set(where.rowIds);
        const rows = await this.store.imports.findAllRows(userId, batchId);
        if (rows.some((r) => wanted.has(r.id) && r.status === 'INVALID')) {
          throw DomainError.validation('IMPORT_ROW_INVALID', 'Invalid rows cannot be accepted');
        }
      }
    }
    return this.store.imports.setDecisions(userId, batchId, where, decision);
  }

  /** Writes accepted rows to the ledger in one database transaction. */
  async commit(userId: string, batchId: string): Promise<ImportSummary> {
    const batch = await this.requireReviewBatch(userId, batchId);
    await this.store.transaction(async (repos) => {
      const account = await requireActiveAccount(repos, userId, batch.accountId);
      const rows = await repos.imports.findAllRows(userId, batchId);
      const pending = rows.filter((r) => r.decision === 'PENDING').length;
      if (pending > 0) {
        throw DomainError.conflict(
          'IMPORT_HAS_PENDING_ROWS',
          `${pending} ${pending === 1 ? 'row still needs' : 'rows still need'} a decision (possible duplicates or ambiguous rows)`,
        );
      }
      const merchants = new MerchantService(repos);
      let created = 0;
      for (const row of rows) {
        if (row.decision !== 'ACCEPT' || row.transactionId) continue;
        if (row.status === 'INVALID' || !row.date || !row.description || !row.amount || !row.type || !row.fingerprint) {
          throw DomainError.validation('IMPORT_ROW_INVALID', `Row ${row.rowNumber} is not valid`);
        }
        const merchantId = row.merchantName ? (await merchants.findOrCreate(userId, row.merchantName)).id : null;
        const transaction = await repos.transactions.create({
          userId,
          accountId: account.id,
          date: row.date,
          description: row.description,
          merchantId,
          categoryId: row.categoryId,
          amount: row.amount,
          currency: account.currency,
          type: row.type,
          status: TransactionStatus.CLEARED,
          source: SOURCE_BY_FILE_TYPE[batch.fileType],
          sourceReference: row.sourceReference,
          notes: null,
          metadata: { importBatchId: batchId, importRowNumber: row.rowNumber },
          fingerprint: row.fingerprint,
        });
        await repos.imports.updateRow(userId, batchId, row.id, { transactionId: transaction.id });
        created++;
      }
      await repos.imports.updateBatch(userId, batchId, {
        status: ImportStatus.COMPLETED,
        processedRows: created,
        completedAt: new Date(),
      });
    });
    return this.summary(userId, batchId);
  }

  async cancel(userId: string, batchId: string): Promise<ImportBatchRecord> {
    const batch = await this.requireBatch(userId, batchId);
    if (batch.status === ImportStatus.COMPLETED) {
      throw DomainError.conflict('IMPORT_ALREADY_COMMITTED', 'Committed imports cannot be cancelled');
    }
    return this.store.imports.updateBatch(userId, batchId, { status: ImportStatus.CANCELLED });
  }

  /** Deletes the import record and its stored file. Committed transactions stay in the ledger. */
  async delete(userId: string, batchId: string): Promise<void> {
    const batch = await this.requireBatch(userId, batchId);
    await this.store.imports.deleteBatch(userId, batchId);
    await this.deps.files.delete(batch.storageKey).catch(() => undefined);
  }

  async file(userId: string, batchId: string): Promise<{ filename: string; fileType: ImportFileType; bytes: Uint8Array }> {
    const batch = await this.requireBatch(userId, batchId);
    return { filename: batch.filename, fileType: batch.fileType, bytes: await this.deps.files.read(batch.storageKey) };
  }

  async requireBatch(userId: string, batchId: string): Promise<ImportBatchRecord> {
    const batch = await this.store.imports.findBatch(userId, batchId);
    if (!batch) throw DomainError.notFound('IMPORT_NOT_FOUND', 'Import not found');
    return batch;
  }

  private async requireReviewBatch(userId: string, batchId: string): Promise<ImportBatchRecord> {
    const batch = await this.requireBatch(userId, batchId);
    if (batch.status !== ImportStatus.REVIEW) {
      throw DomainError.conflict('IMPORT_NOT_IN_REVIEW', `Import is ${batch.status.toLowerCase()}, not in review`);
    }
    return batch;
  }

  private fail(userId: string, batchId: string, message: string): Promise<ImportBatchRecord> {
    return this.store.imports.updateBatch(userId, batchId, { status: ImportStatus.FAILED, errorMessage: message });
  }

  private async categorizationContext(userId: string, descriptions: string[]): Promise<CategorizationContext> {
    const keys = [...new Set(descriptions.map(descriptionPatternKey).filter(Boolean))];
    const [rules, merchants, merchantStats, historyStats] = await Promise.all([
      this.store.rules.findAll(userId),
      this.store.merchants.findAll(userId),
      this.store.transactions.merchantCategoryStats(userId),
      keys.length ? this.store.transactions.descriptionCategoryStats(userId, keys) : Promise.resolve([]),
    ]);
    return {
      rules,
      merchants,
      merchantCategory: mostFrequent(merchantStats.map((s) => ({ key: s.merchantId, categoryId: s.categoryId, count: s.count }))),
      historyCategory: mostFrequent(historyStats),
    };
  }

  /**
   * Flags rows whose fingerprint matches a ledger transaction or an earlier row of the same
   * batch. Flagged rows wait for an explicit decision; they are never dropped.
   */
  private async markDuplicates(
    userId: string,
    accountId: string,
    rows: NewImportRow[],
    editedRowId?: string,
  ): Promise<void> {
    const fingerprints = [...new Set(rows.map((r) => r.fingerprint).filter((f): f is string => !!f))];
    const ledger = new Map<string, string>();
    for (let i = 0; i < fingerprints.length; i += 1000) {
      const matches = await this.store.transactions.findByFingerprints(userId, accountId, fingerprints.slice(i, i + 1000));
      for (const match of matches) {
        if (!ledger.has(match.fingerprint)) ledger.set(match.fingerprint, match.id);
      }
    }

    const seen = new Set<string>();
    if (editedRowId && rows[0]) {
      const edited = rows[0];
      for (const other of await this.store.imports.findAllRows(userId, edited.batchId)) {
        if (other.id !== editedRowId && other.fingerprint && other.rowNumber < edited.rowNumber) seen.add(other.fingerprint);
      }
    }

    for (const row of rows) {
      if (!row.fingerprint || row.status === 'INVALID') continue;
      const ledgerMatch = ledger.get(row.fingerprint);
      if (ledgerMatch || seen.has(row.fingerprint)) {
        row.status = 'POSSIBLE_DUPLICATE';
        row.decision = 'PENDING';
        row.duplicateOfTransactionId = ledgerMatch ?? null;
      }
      seen.add(row.fingerprint);
    }
  }
}

function classify(row: NewImportRow, signUnknown: boolean): NewImportRow {
  const issues = [...row.issues];
  if (row.type && row.amount && isMoneyString(row.amount)) {
    const signIssue = signMismatch(row.type, parseMoney(row.amount));
    if (signIssue && !issues.some((i) => i.code === signIssue.code)) issues.push(signIssue);
  }
  if (issues.length > 0 || !row.date || !row.description || !row.amount) {
    return { ...row, issues, status: 'INVALID', decision: 'REJECT' };
  }
  if (signUnknown || row.type === TransactionType.UNKNOWN) {
    return { ...row, issues, status: 'AMBIGUOUS', decision: 'PENDING' };
  }
  return { ...row, issues, status: 'VALID', decision: 'ACCEPT' };
}

function signMismatch(type: TransactionType, amount: bigint): RowIssue | null {
  if ((type === TransactionType.INCOME || type === TransactionType.REFUND) && amount < 0n) {
    return { field: 'amount', code: 'AMOUNT_SIGN_MISMATCH', message: `${type} must be money coming in` };
  }
  if ((type === TransactionType.EXPENSE || type === TransactionType.FEE) && amount > 0n) {
    return { field: 'amount', code: 'AMOUNT_SIGN_MISMATCH', message: `${type} must be money going out` };
  }
  return null;
}

function validateMapping(mapping: ColumnMapping): void {
  const fail = (message: string): never => {
    throw DomainError.validation('IMPORT_INVALID_MAPPING', message);
  };
  const isColumn = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
  if (!Number.isInteger(mapping.tableIndex) || mapping.tableIndex < 0) fail('tableIndex is invalid');
  if (!Number.isInteger(mapping.headerRowIndex) || mapping.headerRowIndex < -1) fail('headerRowIndex is invalid');
  if (!isColumn(mapping.date)) fail('Choose the date column');
  if (!mapping.description?.length || !mapping.description.every(isColumn)) fail('Choose at least one description column');
  const hasAmount = mapping.amount !== undefined && mapping.amount !== null;
  const hasDebitCredit =
    (mapping.debit !== undefined && mapping.debit !== null) || (mapping.credit !== undefined && mapping.credit !== null);
  if (!hasAmount && !hasDebitCredit) fail('Choose an amount column, or debit and credit columns');
  if (hasAmount && hasDebitCredit) fail('Use either an amount column or debit/credit columns, not both');
}

/** Strips any path and control characters from the uploaded filename; used for display only. */
function safeDisplayName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'statement';
  const cleaned = base.replace(/\p{Cc}/gu, '').trim().slice(0, 255);
  return cleaned || 'statement';
}
