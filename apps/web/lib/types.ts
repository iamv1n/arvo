import type { AccountType, CategoryType, TransactionSource, TransactionStatus, TransactionType } from '@arvo/types';

/** Response shapes of the Arvo API. Amounts are signed decimal strings. */

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string;
  timezone: string;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  openingBalance: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  type: CategoryType;
  isSystem: boolean;
}

export interface Merchant {
  id: string;
  name: string;
  normalizedName: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  merchantId: string | null;
  categoryId: string | null;
  amount: string;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  source: TransactionSource;
  sourceReference: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Transfer {
  id: string;
  from: Transaction;
  to: Transaction;
  createdAt: string;
}

export interface CategorySpend {
  categoryId: string | null;
  name: string;
  parentId: string | null;
  parentName: string | null;
  amount: string;
  transactionCount: number;
}

export interface PeriodSummary {
  from: string;
  to: string;
  currency: string;
  income: string;
  expenses: string;
  netCashflow: string;
  savingsRate: number | null;
  transfersVolume: string;
  unclassified: { inflow: string; outflow: string; transactionCount: number };
  spendingByCategory: CategorySpend[];
  spendingByTopCategory: CategorySpend[];
  transactionCount: number;
}

export interface MonthlyPoint {
  month: string;
  income: string;
  expenses: string;
  netCashflow: string;
}

export interface NetWorth {
  currency: string;
  assets: string;
  liabilities: string;
  netWorth: string;
  accounts: { id: string; name: string; type: AccountType; kind: 'ASSET' | 'LIABILITY'; balance: string }[];
  excludedAccountCount: number;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export type ImportStatus = 'PENDING' | 'PROCESSING' | 'REVIEW' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ImportRowStatus = 'VALID' | 'INVALID' | 'POSSIBLE_DUPLICATE' | 'AMBIGUOUS';
export type ImportRowDecision = 'PENDING' | 'ACCEPT' | 'REJECT';

export interface ColumnMapping {
  tableIndex: number;
  headerRowIndex: number;
  date: number;
  description: number[];
  amount?: number;
  debit?: number;
  credit?: number;
  direction?: number;
  currency?: number;
  reference?: number;
  balance?: number;
  dateFormat: string;
  invertAmounts: boolean;
}

export interface Detection {
  tables: { index: number; name: string; rowCount: number; headerRowIndex: number; headers: string[]; sampleRows: string[][] }[];
  suggestedMapping: ColumnMapping | null;
  mappingSource: 'PRESET' | 'REMEMBERED' | 'AUTO' | 'NONE';
  dateFormatCandidates: string[];
  warnings: string[];
}

export interface ImportBatch {
  id: string;
  accountId: string;
  filename: string;
  fileType: 'CSV' | 'XLSX' | 'PDF';
  fileSize: number;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  mapping: ColumnMapping | null;
  detection: Detection | null;
  duplicateOfBatchId: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportSummary {
  batch: ImportBatch;
  counts: {
    total: number;
    byStatus: Record<ImportRowStatus, number>;
    byDecision: Record<ImportRowDecision, number>;
    committed: number;
  };
  errors: { rowNumber: number | null; code: string; message: string }[];
}

export interface ImportRow {
  id: string;
  rowNumber: number;
  raw: string[];
  date: string | null;
  description: string | null;
  amount: string | null;
  currency: string | null;
  type: import('@arvo/types').TransactionType | null;
  merchantName: string | null;
  categoryId: string | null;
  categorizationSource: 'RULE' | 'MERCHANT' | 'HISTORY' | 'AI' | 'USER' | null;
  sourceReference: string | null;
  status: ImportRowStatus;
  decision: ImportRowDecision;
  duplicateOfTransactionId: string | null;
  issues: { field: string; code: string; message: string }[];
  transactionId: string | null;
}

export interface PeriodComparison {
  currency: string;
  current: { from: string; to: string; income: string; expenses: string; netCashflow: string; transactionCount: number };
  previous: { from: string; to: string; income: string; expenses: string; netCashflow: string; transactionCount: number };
  change: { income: string; expenses: string; netCashflow: string; expensesPercent: number | null };
  categoryChanges: { categoryId: string | null; name: string; current: string; previous: string; change: string; changePercent: number | null }[];
  largestExpenses: Transaction[];
}

export interface MerchantSpend {
  merchantId: string | null;
  name: string;
  amount: string;
  transactionCount: number;
}

export interface RecurringSeries {
  id: string;
  label: string;
  merchantId: string | null;
  categoryId: string | null;
  accountId: string;
  currency: string;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  expectedAmount: string;
  monthlyCost: string;
  lastAmount: string;
  previousAmount: string | null;
  lastSeen: string;
  nextExpected: string;
  occurrences: number;
  priceIncreased: boolean;
  confidence: number;
  status: 'ACTIVE' | 'STOPPED';
  isDismissed: boolean;
  transactionIds: string[];
}

export interface RecurringOverview {
  currency: string;
  asOf: string;
  series: RecurringSeries[];
  monthlyTotal: string;
  annualTotal: string;
  priceIncreases: number;
}
