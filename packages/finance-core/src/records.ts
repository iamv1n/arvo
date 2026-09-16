import type {
  AccountType,
  CategoryType,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '@arvo/types';

/*
 * Domain records. Money is a signed decimal string, dates are YYYY-MM-DD strings,
 * timestamps are UTC Date objects.
 *
 * Sign convention: amounts are from the account's perspective. Money leaving an
 * account is negative, money entering is positive. A credit-card purchase is
 * negative and a card balance that is owed is negative, so net worth is simply
 * the sum of all account balances.
 */

export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  openingBalance: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryRecord {
  id: string;
  /** null for system categories shared by every user. */
  userId: string | null;
  name: string;
  parentId: string | null;
  type: CategoryType;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MerchantRecord {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionRecord {
  id: string;
  userId: string;
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
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransferRecord {
  id: string;
  userId: string;
  fromTransactionId: string;
  toTransactionId: string;
  createdAt: Date;
}

type Generated = 'id' | 'createdAt' | 'updatedAt';

export type NewAccount = Omit<AccountRecord, Generated>;
export type AccountPatch = Partial<
  Pick<AccountRecord, 'name' | 'type' | 'institution' | 'openingBalance' | 'isActive'>
>;

export type NewCategory = Omit<CategoryRecord, Generated>;
export type CategoryPatch = Partial<Pick<CategoryRecord, 'name' | 'parentId' | 'type'>>;

export type NewMerchant = Omit<MerchantRecord, Generated>;

export type NewTransaction = Omit<TransactionRecord, Generated>;
export type TransactionPatch = Partial<Omit<TransactionRecord, Generated | 'userId'>>;

export type NewTransfer = Omit<TransferRecord, 'id' | 'createdAt'>;

export interface TransactionFilter {
  accountId?: string;
  categoryId?: string;
  merchantId?: string;
  types?: TransactionType[];
  /** Inclusive lower bound, YYYY-MM-DD. */
  from?: string;
  /** Inclusive upper bound, YYYY-MM-DD. */
  to?: string;
  /** Case-insensitive substring match on description and merchant name. */
  search?: string;
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** One SQL aggregate bucket: all transactions sharing month, type, category and direction. */
export interface TransactionAggregate {
  /** YYYY-MM of the transaction date. */
  month: string;
  type: TransactionType;
  categoryId: string | null;
  /** IN for positive amounts, OUT for negative. */
  direction: 'IN' | 'OUT';
  /** Signed decimal sum. */
  total: string;
  count: number;
}

export interface AggregateFilter {
  currency: string;
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. */
  to: string;
  accountId?: string;
}

export interface MerchantAggregate {
  merchantId: string | null;
  type: TransactionType;
  total: string;
  count: number;
}

export type RecurringFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface RecurringSeriesRecord {
  id: string;
  userId: string;
  /** Grouping key: "m:<merchantId>" or "d:<description pattern>". */
  key: string;
  label: string;
  merchantId: string | null;
  categoryId: string | null;
  accountId: string;
  currency: string;
  frequency: RecurringFrequency;
  /** Positive typical charge. */
  expectedAmount: string;
  /** expectedAmount normalized to a month. */
  monthlyCost: string;
  lastAmount: string;
  previousAmount: string | null;
  lastSeen: string;
  nextExpected: string;
  occurrences: number;
  /** Latest charge is higher than a previously stable price. */
  priceIncreased: boolean;
  confidence: number;
  status: 'ACTIVE' | 'STOPPED';
  isDismissed: boolean;
  transactionIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type RecurringSeriesUpsert = Omit<RecurringSeriesRecord, 'id' | 'createdAt' | 'updatedAt' | 'isDismissed'>;
