import { TransactionSource, TransactionStatus, TransactionType } from '@arvo/types';
import { isIsoDate } from '../dates';
import { DomainError } from '../errors';
import { transactionFingerprint } from '../fingerprint';
import { formatMoney, isMoneyString, parseMoney } from '../money';
import type { FinanceStore, Repositories } from '../ports';
import type {
  AccountRecord,
  Page,
  TransactionFilter,
  TransactionPatch,
  TransactionRecord,
} from '../records';
import { MerchantService } from './merchant.service';
import {
  assertAmountMatchesType,
  optionalText,
  requireCurrency,
  requireDate,
  requireMoney,
  requireText,
} from './validation';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;
export const MAX_BULK_SIZE = 500;

export interface CreateTransactionInput {
  accountId: string;
  date: string;
  description: string;
  amount: string;
  type: TransactionType;
  /** Defaults to the account currency; must match it (no conversion in MVP). */
  currency?: string;
  categoryId?: string | null;
  merchantId?: string | null;
  /** Resolved to an existing merchant by normalized name, or created. */
  merchantName?: string;
  status?: TransactionStatus;
  source?: TransactionSource;
  sourceReference?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateTransactionInput {
  accountId?: string;
  date?: string;
  description?: string;
  amount?: string;
  type?: TransactionType;
  categoryId?: string | null;
  merchantId?: string | null;
  merchantName?: string;
  status?: TransactionStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export type ListTransactionsInput = Partial<TransactionFilter>;

export class TransactionService {
  constructor(private readonly store: FinanceStore) {}

  async list(userId: string, input: ListTransactionsInput = {}): Promise<Page<TransactionRecord>> {
    for (const field of ['from', 'to'] as const) {
      const value = input[field];
      if (value !== undefined && !isIsoDate(value)) {
        throw DomainError.validation('INVALID_DATE', `${field} must be a valid YYYY-MM-DD date`, { field });
      }
    }
    if (input.from && input.to && input.from > input.to) {
      throw DomainError.validation('INVALID_DATE_RANGE', 'from must not be after to');
    }
    for (const field of ['minAmount', 'maxAmount'] as const) {
      const value = input[field];
      if (value !== undefined && (!isMoneyString(value) || value.trim().startsWith('-'))) {
        throw DomainError.validation('INVALID_AMOUNT', `${field} must be a positive decimal amount`, { field });
      }
    }
    if (input.minAmount && input.maxAmount && parseMoney(input.minAmount) > parseMoney(input.maxAmount)) {
      throw DomainError.validation('INVALID_AMOUNT_RANGE', 'minAmount must not be greater than maxAmount');
    }
    const filter: TransactionFilter = {
      ...input,
      search: input.search?.trim() || undefined,
      minAmount: input.minAmount ? formatMoney(parseMoney(input.minAmount)) : undefined,
      maxAmount: input.maxAmount ? formatMoney(parseMoney(input.maxAmount)) : undefined,
      limit: clamp(input.limit ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
      offset: Math.max(0, input.offset ?? 0),
    };
    return this.store.transactions.findMany(userId, filter);
  }

  async get(userId: string, id: string): Promise<TransactionRecord> {
    return requireTransaction(this.store, userId, id);
  }

  async create(userId: string, input: CreateTransactionInput): Promise<TransactionRecord> {
    return this.store.transaction(async (repos) => {
      const account = await requireActiveAccount(repos, userId, input.accountId);
      const currency = requireCurrency(input.currency ?? account.currency);
      assertAccountCurrency(account, currency);

      const amount = requireMoney('amount', input.amount);
      assertAmountMatchesType(input.type, amount);
      const date = requireDate('date', input.date);
      const description = requireText('description', input.description, 500);

      const categoryId = await resolveCategory(repos, userId, input.categoryId);
      const merchantId = await resolveMerchant(repos, userId, input.merchantId, input.merchantName);

      return repos.transactions.create({
        userId,
        accountId: account.id,
        date,
        description,
        merchantId,
        categoryId,
        amount: formatMoney(amount),
        currency,
        type: input.type,
        status: input.status ?? TransactionStatus.CLEARED,
        source: input.source ?? TransactionSource.MANUAL,
        sourceReference: optionalText('sourceReference', input.sourceReference, 255),
        notes: optionalText('notes', input.notes, 2000),
        metadata: input.metadata ?? {},
        fingerprint: transactionFingerprint({
          accountId: account.id,
          date,
          amount: formatMoney(amount),
          description,
        }),
      });
    });
  }

  async update(userId: string, id: string, input: UpdateTransactionInput): Promise<TransactionRecord> {
    return this.store.transaction(async (repos) => {
      const existing = await requireTransaction(repos, userId, id);
      const patch: TransactionPatch = {};

      const movesMoney =
        (input.accountId !== undefined && input.accountId !== existing.accountId) ||
        (input.amount !== undefined && requireMoney('amount', input.amount) !== requireMoney('amount', existing.amount)) ||
        (input.type !== undefined && input.type !== existing.type);
      if (movesMoney && (await repos.transfers.findByTransactionId(userId, id))) {
        throw DomainError.conflict(
          'TRANSACTION_IN_TRANSFER',
          'Unlink the transfer before changing the account, amount or type',
        );
      }

      if (input.accountId !== undefined && input.accountId !== existing.accountId) {
        const account = await requireActiveAccount(repos, userId, input.accountId);
        assertAccountCurrency(account, existing.currency);
        patch.accountId = account.id;
      }
      if (input.date !== undefined) patch.date = requireDate('date', input.date);
      if (input.description !== undefined) {
        patch.description = requireText('description', input.description, 500);
      }
      if (input.amount !== undefined) patch.amount = formatMoney(requireMoney('amount', input.amount));
      if (input.type !== undefined) patch.type = input.type;
      if (input.status !== undefined) patch.status = input.status;
      if (input.notes !== undefined) patch.notes = optionalText('notes', input.notes, 2000);
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      if (input.categoryId !== undefined) {
        patch.categoryId = await resolveCategory(repos, userId, input.categoryId);
      }
      if (input.merchantId !== undefined || input.merchantName !== undefined) {
        patch.merchantId = await resolveMerchant(repos, userId, input.merchantId, input.merchantName);
      }

      const merged = { ...existing, ...patch };
      assertAmountMatchesType(merged.type, requireMoney('amount', merged.amount));
      patch.fingerprint = transactionFingerprint(merged);

      return repos.transactions.update(userId, id, patch);
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.store.transaction(async (repos) => {
      await requireTransaction(repos, userId, id);
      if (await repos.transfers.findByTransactionId(userId, id)) {
        throw DomainError.conflict('TRANSACTION_IN_TRANSFER', 'Unlink the transfer before deleting');
      }
      await repos.transactions.delete(userId, id);
    });
  }

  /** Sets (or clears, with null) the category of many transactions atomically. */
  async bulkCategorize(userId: string, ids: string[], categoryId: string | null): Promise<number> {
    return this.bulkUpdate(userId, ids, { categoryId });
  }

  /**
   * Applies the same category and/or merchant to many transactions in one database transaction.
   * merchantName resolves to an existing merchant (by normalized name) or creates it;
   * merchantId null clears the merchant.
   */
  async bulkUpdate(
    userId: string,
    ids: string[],
    changes: { categoryId?: string | null; merchantId?: string | null; merchantName?: string },
  ): Promise<number> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0 || uniqueIds.length > MAX_BULK_SIZE) {
      throw DomainError.validation(
        'INVALID_INPUT',
        `transactionIds must contain between 1 and ${MAX_BULK_SIZE} ids`,
        { field: 'transactionIds' },
      );
    }
    const touchesCategory = changes.categoryId !== undefined;
    const touchesMerchant = changes.merchantId !== undefined || changes.merchantName !== undefined;
    if (!touchesCategory && !touchesMerchant) {
      throw DomainError.validation('INVALID_INPUT', 'Provide a category or merchant to apply');
    }
    return this.store.transaction(async (repos) => {
      const patch: TransactionPatch = {};
      if (touchesCategory) patch.categoryId = await resolveCategory(repos, userId, changes.categoryId);
      if (touchesMerchant) patch.merchantId = await resolveMerchant(repos, userId, changes.merchantId, changes.merchantName);
      const found = await repos.transactions.findByIds(userId, uniqueIds);
      if (found.length !== uniqueIds.length) {
        const foundIds = new Set(found.map((t) => t.id));
        throw new DomainError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'Some transactions were not found', {
          missing: uniqueIds.filter((id) => !foundIds.has(id)),
        });
      }
      for (const id of uniqueIds) {
        await repos.transactions.update(userId, id, patch);
      }
      return uniqueIds.length;
    });
  }
}

export async function requireTransaction(
  repos: Pick<Repositories, 'transactions'>,
  userId: string,
  id: string,
): Promise<TransactionRecord> {
  const transaction = await repos.transactions.findById(userId, id);
  if (!transaction) {
    throw DomainError.notFound('TRANSACTION_NOT_FOUND', 'Transaction not found');
  }
  return transaction;
}

export async function requireActiveAccount(
  repos: Pick<Repositories, 'accounts'>,
  userId: string,
  accountId: string,
): Promise<AccountRecord> {
  const account = await repos.accounts.findById(userId, accountId);
  if (!account) {
    throw DomainError.notFound('ACCOUNT_NOT_FOUND', 'Account not found');
  }
  if (!account.isActive) {
    throw DomainError.conflict('ACCOUNT_INACTIVE', 'Account is inactive');
  }
  return account;
}

function assertAccountCurrency(account: AccountRecord, currency: string): void {
  if (account.currency !== currency) {
    throw DomainError.validation(
      'CURRENCY_MISMATCH',
      `Transaction currency ${currency} does not match account currency ${account.currency}`,
    );
  }
}

async function resolveCategory(
  repos: Repositories,
  userId: string,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (!categoryId) return null;
  const category = await repos.categories.findVisibleById(userId, categoryId);
  if (!category) {
    throw DomainError.notFound('CATEGORY_NOT_FOUND', 'Category not found');
  }
  return category.id;
}

async function resolveMerchant(
  repos: Repositories,
  userId: string,
  merchantId: string | null | undefined,
  merchantName: string | undefined,
): Promise<string | null> {
  if (merchantId && merchantName !== undefined) {
    throw DomainError.validation('INVALID_INPUT', 'Provide merchantId or merchantName, not both');
  }
  if (merchantName !== undefined) {
    return (await new MerchantService(repos).findOrCreate(userId, merchantName)).id;
  }
  if (!merchantId) return null;
  return (await new MerchantService(repos).require(userId, merchantId)).id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
