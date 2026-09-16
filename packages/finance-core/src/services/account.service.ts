import type { AccountType } from '@arvo/types';
import { DomainError } from '../errors';
import { formatMoney, parseMoney } from '../money';
import type { FinanceStore } from '../ports';
import type { AccountPatch, AccountRecord } from '../records';
import { optionalText, requireCurrency, requireMoney, requireText } from './validation';

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: string;
  institution?: string | null;
  openingBalance?: string;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  institution?: string | null;
  openingBalance?: string;
  isActive?: boolean;
}

export interface AccountWithBalance extends AccountRecord {
  /** opening_balance + sum of all transaction amounts, in the account currency. */
  balance: string;
}

export class AccountService {
  constructor(private readonly store: FinanceStore) {}

  async list(userId: string): Promise<AccountWithBalance[]> {
    const [accounts, sums] = await Promise.all([
      this.store.accounts.findAll(userId),
      this.store.transactions.sumAmountsByAccount(userId),
    ]);
    return accounts.map((account) => withBalance(account, sums.get(account.id)));
  }

  async get(userId: string, id: string): Promise<AccountWithBalance> {
    const account = await this.require(userId, id);
    const sums = await this.store.transactions.sumAmountsByAccount(userId);
    return withBalance(account, sums.get(account.id));
  }

  async require(userId: string, id: string): Promise<AccountRecord> {
    const account = await this.store.accounts.findById(userId, id);
    if (!account) {
      throw DomainError.notFound('ACCOUNT_NOT_FOUND', 'Account not found');
    }
    return account;
  }

  async create(userId: string, input: CreateAccountInput): Promise<AccountWithBalance> {
    const openingBalance = requireMoney('openingBalance', input.openingBalance ?? '0');
    const account = await this.store.accounts.create({
      userId,
      name: requireText('name', input.name, 120),
      type: input.type,
      institution: optionalText('institution', input.institution, 120),
      currency: requireCurrency(input.currency),
      openingBalance: formatMoney(openingBalance),
      isActive: true,
    });
    return withBalance(account, undefined);
  }

  async update(userId: string, id: string, input: UpdateAccountInput): Promise<AccountWithBalance> {
    await this.require(userId, id);
    const patch: AccountPatch = {};
    if (input.name !== undefined) patch.name = requireText('name', input.name, 120);
    if (input.type !== undefined) patch.type = input.type;
    if (input.institution !== undefined) {
      patch.institution = optionalText('institution', input.institution, 120);
    }
    if (input.openingBalance !== undefined) {
      patch.openingBalance = formatMoney(requireMoney('openingBalance', input.openingBalance));
    }
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    await this.store.accounts.update(userId, id, patch);
    return this.get(userId, id);
  }

  /** Accounts with transactions cannot be deleted; deactivate them instead. */
  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    const count = await this.store.transactions.countByAccount(userId, id);
    if (count > 0) {
      throw DomainError.conflict(
        'ACCOUNT_HAS_TRANSACTIONS',
        'Account has transactions; deactivate it instead of deleting',
      );
    }
    await this.store.accounts.delete(userId, id);
  }
}

function withBalance(account: AccountRecord, transactionSum: string | undefined): AccountWithBalance {
  const balance = parseMoney(account.openingBalance) + parseMoney(transactionSum ?? '0');
  return { ...account, balance: formatMoney(balance) };
}
