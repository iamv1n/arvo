import type {
  AccountPatch,
  BudgetPatch,
  BudgetRecord,
  GoalPatch,
  GoalRecord,
  NewBudget,
  NewGoal,
  AccountRecord,
  CategoryPatch,
  CategoryRecord,
  MerchantRecord,
  NewAccount,
  NewCategory,
  NewMerchant,
  NewTransaction,
  NewTransfer,
  MerchantAggregate,
  RecurringSeriesRecord,
  RecurringSeriesUpsert,
  AggregateFilter,
  TransactionAggregate,
  Page,
  PageRequest,
  TransactionFilter,
  TransactionPatch,
  TransactionRecord,
  TransferRecord,
} from './records';
import type { TransactionType } from '@arvo/types';
import type { ImportRepository } from './imports/types';
import type { RuleRepository } from './rules/types';

/*
 * Persistence ports implemented by @arvo/database. Every user-owned lookup takes the
 * authenticated userId and must scope its query by it; a record belonging to another
 * user is reported as absent, never returned.
 */

export interface AccountRepository {
  findAll(userId: string): Promise<AccountRecord[]>;
  findById(userId: string, id: string): Promise<AccountRecord | null>;
  create(input: NewAccount): Promise<AccountRecord>;
  update(userId: string, id: string, patch: AccountPatch): Promise<AccountRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface CategoryRepository {
  /** System categories plus the user's own. */
  findVisible(userId: string): Promise<CategoryRecord[]>;
  /** A system category or one owned by the user. */
  findVisibleById(userId: string, id: string): Promise<CategoryRecord | null>;
  create(input: NewCategory): Promise<CategoryRecord>;
  update(userId: string, id: string, patch: CategoryPatch): Promise<CategoryRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface MerchantRepository {
  findAll(userId: string): Promise<MerchantRecord[]>;
  /** Ordered by name; search matches name case-insensitively. */
  findPage(userId: string, request: PageRequest & { search?: string }): Promise<Page<MerchantRecord>>;
  findById(userId: string, id: string): Promise<MerchantRecord | null>;
  findByNormalizedName(userId: string, normalizedName: string): Promise<MerchantRecord | null>;
  create(input: NewMerchant): Promise<MerchantRecord>;
  update(userId: string, id: string, patch: Pick<MerchantRecord, 'name' | 'normalizedName'>): Promise<MerchantRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface TransactionRepository {
  findMany(userId: string, filter: TransactionFilter): Promise<Page<TransactionRecord>>;
  findById(userId: string, id: string): Promise<TransactionRecord | null>;
  findByIds(userId: string, ids: string[]): Promise<TransactionRecord[]>;
  create(input: NewTransaction): Promise<TransactionRecord>;
  update(userId: string, id: string, patch: TransactionPatch): Promise<TransactionRecord>;
  delete(userId: string, id: string): Promise<void>;
  /** Exact sum of amounts per account, as decimal strings. Accounts with no rows are omitted. */
  sumAmountsByAccount(userId: string): Promise<Map<string, string>>;
  countByAccount(userId: string, accountId: string): Promise<number>;
  /** Existing ledger transactions of an account whose fingerprint is in the list. */
  findByFingerprints(userId: string, accountId: string, fingerprints: string[]): Promise<{ id: string; fingerprint: string }[]>;
  /** How often each merchant was used with each category. */
  merchantCategoryStats(userId: string): Promise<{ merchantId: string; categoryId: string; count: number }[]>;
  /**
   * How often each description pattern was used with each category. The pattern key is the
   * description upper-cased with every run of non A–Z characters collapsed to one space, trimmed
   * (see descriptionPatternKey).
   */
  descriptionCategoryStats(userId: string, keys: string[]): Promise<{ key: string; categoryId: string; count: number }[]>;
  aggregate(userId: string, filter: AggregateFilter): Promise<TransactionAggregate[]>;
  aggregateByMerchant(userId: string, filter: AggregateFilter): Promise<MerchantAggregate[]>;
  /** Transactions of the given types in a period, ordered by date then id. */
  findInPeriod(
    userId: string,
    filter: AggregateFilter & { types: TransactionType[] },
  ): Promise<TransactionRecord[]>;
  /** Largest outflows (most negative amounts first) of the given types in a period. */
  findLargestOutflows(
    userId: string,
    filter: AggregateFilter & { types: TransactionType[] },
    limit: number,
  ): Promise<TransactionRecord[]>;
}

export interface TransferRepository {
  findAll(userId: string): Promise<TransferRecord[]>;
  /** Newest first. */
  findPage(userId: string, request: PageRequest): Promise<Page<TransferRecord>>;
  findById(userId: string, id: string): Promise<TransferRecord | null>;
  findByTransactionId(userId: string, transactionId: string): Promise<TransferRecord | null>;
  create(input: NewTransfer): Promise<TransferRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface RecurringRepository {
  findAll(userId: string): Promise<RecurringSeriesRecord[]>;
  findById(userId: string, id: string): Promise<RecurringSeriesRecord | null>;
  /**
   * Replaces detected series: upserts by key (keeping isDismissed) and deletes series whose
   * key was not detected this time.
   */
  sync(userId: string, series: RecurringSeriesUpsert[]): Promise<void>;
  setDismissed(userId: string, id: string, isDismissed: boolean): Promise<RecurringSeriesRecord>;
}

export interface BudgetRepository {
  findAll(userId: string): Promise<BudgetRecord[]>;
  findById(userId: string, id: string): Promise<BudgetRecord | null>;
  create(input: NewBudget): Promise<BudgetRecord>;
  update(userId: string, id: string, patch: BudgetPatch): Promise<BudgetRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface GoalRepository {
  findAll(userId: string): Promise<GoalRecord[]>;
  findById(userId: string, id: string): Promise<GoalRecord | null>;
  create(input: NewGoal): Promise<GoalRecord>;
  update(userId: string, id: string, patch: GoalPatch): Promise<GoalRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface Repositories {
  accounts: AccountRepository;
  categories: CategoryRepository;
  merchants: MerchantRepository;
  transactions: TransactionRepository;
  transfers: TransferRepository;
  imports: ImportRepository;
  rules: RuleRepository;
  recurring: RecurringRepository;
  budgets: BudgetRepository;
  goals: GoalRepository;
}

/** Storage entry point: plain repositories plus an atomic unit of work. */
export interface FinanceStore extends Repositories {
  /** Runs `work` in one database transaction; everything rolls back if it throws. */
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
