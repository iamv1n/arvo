import type {
  RecurringSeriesRecord,
  ImportBatchRecord,
  ImportErrorRecord,
  ImportRowRecord,
  RuleRecord,
  AccountRecord,
  CategoryRecord,
  MerchantRecord,
  TransactionRecord,
  TransferRecord,
} from '@arvo/finance-core';
import { formatMoney, parseMoney } from '@arvo/finance-core';
import type {
  RecurringSeriesEntity,
  ImportBatchEntity,
  ImportErrorEntity,
  ImportRowEntity,
  RuleEntity,
  AccountEntity,
  CategoryEntity,
  MerchantEntity,
  TransactionEntity,
  TransferEntity,
} from '../entities';

/** numeric(19,4) comes back as "649.5000"; expose the core's canonical form "649.50". */
const canonicalMoney = (value: string): string => formatMoney(parseMoney(value));

export const toAccount = (e: AccountEntity): AccountRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  type: e.type,
  institution: e.institution,
  currency: e.currency,
  openingBalance: canonicalMoney(e.openingBalance),
  isActive: e.isActive,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toCategory = (e: CategoryEntity): CategoryRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  parentId: e.parentId,
  type: e.type,
  isSystem: e.isSystem,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toMerchant = (e: MerchantEntity): MerchantRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  normalizedName: e.normalizedName,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toTransaction = (e: TransactionEntity): TransactionRecord => ({
  id: e.id,
  userId: e.userId,
  accountId: e.accountId,
  date: e.date,
  description: e.description,
  merchantId: e.merchantId,
  categoryId: e.categoryId,
  amount: canonicalMoney(e.amount),
  currency: e.currency,
  type: e.type,
  status: e.status,
  source: e.source,
  sourceReference: e.sourceReference,
  notes: e.notes,
  metadata: e.metadata,
  fingerprint: e.fingerprint,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toTransfer = (e: TransferEntity): TransferRecord => ({
  id: e.id,
  userId: e.userId,
  fromTransactionId: e.fromTransactionId,
  toTransactionId: e.toTransactionId,
  createdAt: e.createdAt,
});

export const toImportBatch = (e: ImportBatchEntity): ImportBatchRecord => ({
  id: e.id,
  userId: e.userId,
  accountId: e.accountId,
  filename: e.filename,
  fileType: e.fileType,
  fileHash: e.fileHash,
  fileSize: e.fileSize,
  storageKey: e.storageKey,
  status: e.status,
  totalRows: e.totalRows,
  processedRows: e.processedRows,
  mapping: e.mapping,
  detection: e.detection,
  duplicateOfBatchId: e.duplicateOfBatchId,
  errorMessage: e.errorMessage,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
  completedAt: e.completedAt,
});

export const toImportRow = (e: ImportRowEntity): ImportRowRecord => ({
  id: e.id,
  batchId: e.batchId,
  userId: e.userId,
  rowNumber: e.rowNumber,
  raw: e.raw,
  date: e.date,
  description: e.description,
  amount: e.amount === null ? null : canonicalMoney(e.amount),
  currency: e.currency,
  type: e.type,
  merchantName: e.merchantName,
  categoryId: e.categoryId,
  categorizationSource: e.categorizationSource,
  sourceReference: e.sourceReference,
  fingerprint: e.fingerprint,
  status: e.status,
  decision: e.decision,
  duplicateOfTransactionId: e.duplicateOfTransactionId,
  issues: e.issues,
  transactionId: e.transactionId,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toImportError = (e: ImportErrorEntity): ImportErrorRecord => ({
  id: e.id,
  batchId: e.batchId,
  userId: e.userId,
  rowNumber: e.rowNumber,
  code: e.code,
  message: e.message,
  createdAt: e.createdAt,
});

export const toRule = (e: RuleEntity): RuleRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  priority: e.priority,
  isActive: e.isActive,
  conditions: e.conditions,
  actions: e.actions,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toRecurring = (e: RecurringSeriesEntity): RecurringSeriesRecord => ({
  id: e.id,
  userId: e.userId,
  key: e.key,
  label: e.label,
  merchantId: e.merchantId,
  categoryId: e.categoryId,
  accountId: e.accountId,
  currency: e.currency,
  frequency: e.frequency,
  expectedAmount: canonicalMoney(e.expectedAmount),
  monthlyCost: canonicalMoney(e.monthlyCost),
  lastAmount: canonicalMoney(e.lastAmount),
  previousAmount: e.previousAmount === null ? null : canonicalMoney(e.previousAmount),
  lastSeen: e.lastSeen,
  nextExpected: e.nextExpected,
  occurrences: e.occurrences,
  confidence: Number(e.confidence),
  status: e.status,
  isDismissed: e.isDismissed,
  transactionIds: e.transactionIds,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});
