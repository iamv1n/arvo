import { AccountType, CategoryType, ImportStatus, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import { FinanceCore } from '../finance-core';
import { inferTransactionType } from './import.service';
import type { ColumnMapping, FileStore, NormalizedRow, StatementParser } from './types';

/** Fake parser: file bytes are JSON arrays of [date, description, amount] tuples. */
const MAPPING: ColumnMapping = {
  tableIndex: 0, headerRowIndex: 0, date: 0, description: [1], amount: 2, dateFormat: 'YYYY-MM-DD', invertAmounts: false,
};

const parser: StatementParser = {
  detectFileType: (name) => (name.endsWith('.csv') ? 'CSV' : null),
  extract: async (fileType, bytes) => {
    const rows = JSON.parse(Buffer.from(bytes).toString()) as string[][];
    return { fileType, tables: [{ name: 'CSV', rows: [['Date', 'Description', 'Amount'], ...rows] }], warnings: [] };
  },
  detect: (extraction, remembered) => ({
    tables: [],
    suggestedMapping: remembered ?? MAPPING,
    mappingSource: remembered ? 'REMEMBERED' : 'AUTO',
    dateFormatCandidates: ['YYYY-MM-DD'],
    warnings: [],
  }),
  headerSignature: () => 'sig',
  normalize: (extraction) => ({
    rows: extraction.tables[0].rows.slice(1).map((raw, i): NormalizedRow => ({
      rowNumber: i + 2,
      raw,
      date: /^\d{4}-\d{2}-\d{2}$/.test(raw[0]) ? raw[0] : null,
      description: raw[1] || null,
      amount: raw[2] === '?' ? '10.00' : raw[2] || null,
      currency: null,
      reference: null,
      signUnknown: raw[2] === '?',
      issues: /^\d{4}-\d{2}-\d{2}$/.test(raw[0]) ? [] : [{ field: 'date', code: 'INVALID_DATE', message: 'bad date' }],
    })),
    skipped: [{ rowNumber: 99, reason: 'Totals' }],
  }),
};

function fixture() {
  const ctx = setup();
  const files = new Map<string, Uint8Array>();
  const fileStore: FileStore = {
    save: async (key, bytes) => void files.set(key, bytes),
    read: async (key) => files.get(key)!,
    delete: async (key) => void files.delete(key),
  };
  const core = new FinanceCore(ctx.store, { imports: { parser, files: fileStore } });
  const upload = async (rows: string[][], accountId: string, userId = USER_A) =>
    core.imports.upload(userId, { accountId, filename: '../../etc/statement.csv', bytes: Buffer.from(JSON.stringify(rows)) });
  return { ...ctx, core, files, upload };
}

const STATEMENT = [
  ['2026-08-01', 'SALARY ACME', '120000'],
  ['2026-08-03', 'SWIGGY ORDER 8812', '-450'],
  ['2026-08-03', 'SWIGGY ORDER 8812', '-450'],
  ['2026-08-05', 'NETFLIX.COM', '-649'],
  ['bad', 'BROKEN', '-1'],
  ['2026-08-09', 'MYSTERY CREDIT', '?'],
];

describe('ImportService', () => {
  it('uploads, detects, processes into review with statuses, and never touches the ledger', async () => {
    const { core, bank, upload, files } = fixture();
    const account = await bank();
    const batch = await upload(STATEMENT, account.id);
    expect(batch).toMatchObject({ status: ImportStatus.PENDING, filename: 'statement.csv', fileType: 'CSV' });
    expect(batch.detection?.mappingSource).toBe('AUTO');
    expect(files.size).toBe(1);

    const summary = await core.imports.process(USER_A, batch.id, MAPPING);
    expect(summary.batch.status).toBe(ImportStatus.REVIEW);
    expect(summary.counts).toMatchObject({
      total: 6,
      byStatus: { VALID: 3, POSSIBLE_DUPLICATE: 1, INVALID: 1, AMBIGUOUS: 1 },
      byDecision: { ACCEPT: 3, PENDING: 2, REJECT: 1 },
    });
    expect(summary.errors.map((e) => e.code)).toEqual(['ROW_SKIPPED']);
    expect((await core.transactions.list(USER_A)).total).toBe(0);

    const rows = (await core.imports.rows(USER_A, batch.id, {})).items;
    expect(rows.map((r) => r.type)).toEqual([
      TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.EXPENSE, TransactionType.EXPENSE, null, TransactionType.INCOME,
    ]);
  });

  it('requires a decision on duplicates and ambiguous rows before committing, then commits atomically', async () => {
    const { core, bank, upload } = fixture();
    const account = await bank(USER_A, '0');
    const batch = await upload(STATEMENT, account.id);
    await core.imports.process(USER_A, batch.id, MAPPING);

    await expectDomainError(core.imports.commit(USER_A, batch.id), 'IMPORT_HAS_PENDING_ROWS');
    await expectDomainError(core.imports.setDecision(USER_A, batch.id, { statuses: ['INVALID'] }, 'ACCEPT'), 'IMPORT_ROW_INVALID');

    const rows = (await core.imports.rows(USER_A, batch.id, {})).items;
    const duplicate = rows.find((r) => r.status === 'POSSIBLE_DUPLICATE')!;
    const ambiguous = rows.find((r) => r.status === 'AMBIGUOUS')!;
    // Keep the duplicate (two identical orders really happened); fix the ambiguous sign.
    await core.imports.updateRow(USER_A, batch.id, duplicate.id, { decision: 'ACCEPT' });
    const fixed = await core.imports.updateRow(USER_A, batch.id, ambiguous.id, { amount: '-10', type: TransactionType.EXPENSE });
    expect(fixed).toMatchObject({ status: 'VALID', decision: 'ACCEPT', amount: '-10.00' });

    const done = await core.imports.commit(USER_A, batch.id);
    expect(done.batch).toMatchObject({ status: ImportStatus.COMPLETED, processedRows: 5 });
    const ledger = await core.transactions.list(USER_A);
    expect(ledger.total).toBe(5);
    expect(ledger.items.every((t) => t.source === 'CSV' && t.metadata.importBatchId === batch.id)).toBe(true);
    expect((await core.accounts.get(USER_A, account.id)).balance).toBe('118441.00');

    await expectDomainError(core.imports.commit(USER_A, batch.id), 'IMPORT_NOT_IN_REVIEW');
    await expectDomainError(core.imports.cancel(USER_A, batch.id), 'IMPORT_ALREADY_COMMITTED');
  });

  it('flags rows already in the ledger on re-import and warns about the identical file', async () => {
    const { core, bank, upload } = fixture();
    const account = await bank();
    const first = await upload(STATEMENT.slice(0, 2), account.id);
    await core.imports.process(USER_A, first.id, MAPPING);
    await core.imports.commit(USER_A, first.id);

    const again = await upload(STATEMENT.slice(0, 2), account.id);
    expect(again.duplicateOfBatchId).toBe(first.id);
    expect(again.detection?.warnings[0]).toMatch(/already imported/);
    const summary = await core.imports.process(USER_A, again.id, MAPPING);
    expect(summary.counts.byStatus.POSSIBLE_DUPLICATE).toBe(2);
    const rows = (await core.imports.rows(USER_A, again.id, {})).items;
    expect(rows.every((r) => r.duplicateOfTransactionId)).toBe(true);

    expect(await core.imports.setDecision(USER_A, again.id, { statuses: ['POSSIBLE_DUPLICATE'] }, 'REJECT')).toBe(2);
    const done = await core.imports.commit(USER_A, again.id);
    expect(done.batch.processedRows).toBe(0);
    expect((await core.transactions.list(USER_A)).total).toBe(2);
  });

  it('categorizes with rules first, then known merchants, then history', async () => {
    const { core, bank, store, upload } = fixture();
    const delivery = store.addSystemCategory('Delivery');
    const streaming = store.addSystemCategory('Streaming');
    const salary = store.addSystemCategory('Salary', CategoryType.INCOME);
    const account = await bank();

    // History: a past NETFLIX.COM transaction categorized as Streaming.
    await core.transactions.create(USER_A, {
      accountId: account.id, date: '2026-07-05', description: 'NETFLIX COM', amount: '-649', type: TransactionType.EXPENSE, categoryId: streaming.id,
    });
    // Known merchant with a category.
    await core.transactions.create(USER_A, {
      accountId: account.id, date: '2026-07-10', description: 'order', amount: '-300', type: TransactionType.EXPENSE, merchantName: 'Swiggy', categoryId: delivery.id,
    });
    // Rule beats everything for payroll.
    await core.rules.create(USER_A, {
      name: 'Payroll', conditions: [{ field: 'description', operator: 'contains', value: 'acme' }, { field: 'direction', operator: 'equals', value: 'in' }],
      actions: { categoryId: salary.id, merchantName: 'Acme Corp' },
    });

    const batch = await upload(STATEMENT.slice(0, 4), account.id);
    await core.imports.process(USER_A, batch.id, MAPPING);
    const rows = (await core.imports.rows(USER_A, batch.id, {})).items;
    expect(rows.map((r) => [r.description, r.categoryId, r.categorizationSource, r.merchantName])).toEqual([
      ['SALARY ACME', salary.id, 'RULE', 'Acme Corp'],
      ['SWIGGY ORDER 8812', delivery.id, 'MERCHANT', 'Swiggy'],
      ['SWIGGY ORDER 8812', delivery.id, 'MERCHANT', 'Swiggy'],
      ['NETFLIX.COM', streaming.id, 'HISTORY', null],
    ]);

    // User edits win and are marked as such.
    const edited = await core.imports.updateRow(USER_A, batch.id, rows[3].id, { categoryId: delivery.id });
    expect(edited.categorizationSource).toBe('USER');
  });

  it('remembers the confirmed mapping for the next statement with the same header', async () => {
    const { core, bank, upload } = fixture();
    const account = await bank();
    const first = await upload(STATEMENT.slice(0, 1), account.id);
    await core.imports.process(USER_A, first.id, { ...MAPPING, invertAmounts: true });
    const second = await upload(STATEMENT.slice(1, 2), account.id);
    expect(second.detection).toMatchObject({ mappingSource: 'REMEMBERED', suggestedMapping: { invertAmounts: true } });
  });

  it('validates uploads, mappings and ownership', async () => {
    const { core, bank, upload } = fixture();
    const account = await bank();
    await expectDomainError(core.imports.upload(USER_A, { accountId: account.id, filename: 'x.exe', bytes: Buffer.from('MZ') }), 'IMPORT_UNSUPPORTED_FILE');
    await expectDomainError(core.imports.upload(USER_A, { accountId: account.id, filename: 'x.csv', bytes: new Uint8Array() }), 'IMPORT_EMPTY_FILE');
    await expectDomainError(upload(STATEMENT, account.id, USER_B), 'ACCOUNT_NOT_FOUND');

    const batch = await upload(STATEMENT, account.id);
    await expectDomainError(core.imports.process(USER_A, batch.id, { ...MAPPING, amount: undefined }), 'IMPORT_INVALID_MAPPING');
    await expectDomainError(core.imports.process(USER_A, batch.id, { ...MAPPING, debit: 3 }), 'IMPORT_INVALID_MAPPING');
    await expectDomainError(core.imports.summary(USER_B, batch.id), 'IMPORT_NOT_FOUND');
    await expectDomainError(core.imports.process(USER_B, batch.id, MAPPING), 'IMPORT_NOT_FOUND');
    await expectDomainError(core.imports.delete(USER_B, batch.id), 'IMPORT_NOT_FOUND');
  });

  it('deletes the batch and its file but keeps committed transactions', async () => {
    const { core, bank, upload, files } = fixture();
    const account = await bank();
    const batch = await upload(STATEMENT.slice(0, 1), account.id);
    await core.imports.process(USER_A, batch.id, MAPPING);
    await core.imports.commit(USER_A, batch.id);
    await core.imports.delete(USER_A, batch.id);
    expect(files.size).toBe(0);
    expect(await core.imports.list(USER_A)).toEqual([]);
    expect((await core.transactions.list(USER_A)).total).toBe(1);
  });
});

describe('inferTransactionType', () => {
  it.each([
    [120000n, 'SALARY', AccountType.BANK, TransactionType.INCOME],
    [500n, 'AMAZON REFUND', AccountType.BANK, TransactionType.REFUND],
    [300n, 'SAVINGS INT CR', AccountType.BANK, TransactionType.INTEREST],
    [5000n, 'PAYMENT RECEIVED THANK YOU', AccountType.CREDIT_CARD, TransactionType.UNKNOWN],
    [-590n, 'LATE PAYMENT FEE', AccountType.CREDIT_CARD, TransactionType.FEE],
    [-1200n, 'FINANCE CHARGES', AccountType.CREDIT_CARD, TransactionType.INTEREST],
    [-450n, 'SWIGGY', AccountType.BANK, TransactionType.EXPENSE],
  ])('%s %s on %s → %s', (amount, description, accountType, expected) => {
    expect(inferTransactionType(amount, description, accountType)).toBe(expected);
  });
});
