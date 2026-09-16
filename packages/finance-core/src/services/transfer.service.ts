import { TransactionSource, TransactionStatus, TransactionType } from '@arvo/types';
import { DomainError } from '../errors';
import { transactionFingerprint } from '../fingerprint';
import { absMoney, formatMoney } from '../money';
import type { FinanceStore, Repositories } from '../ports';
import { normalizePage, type Page, type PageRequest, type TransactionRecord, type TransferRecord } from '../records';
import { requireActiveAccount, requireTransaction } from './transaction.service';
import { optionalText, requireDate, requireMoney, requireText } from './validation';

export interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  /** Positive amount moved from one account to the other. */
  amount: string;
  date: string;
  description: string;
  notes?: string | null;
}

export interface LinkTransferInput {
  /** The outflow (negative amount). */
  fromTransactionId: string;
  /** The inflow (positive amount). */
  toTransactionId: string;
}

export interface TransferDetail extends TransferRecord {
  from: TransactionRecord;
  to: TransactionRecord;
}

/** Metadata key remembering a transaction's type before it was linked as a transfer. */
const TYPE_BEFORE_TRANSFER = 'typeBeforeTransfer';

/**
 * Transfers move money between the user's own accounts. Both legs are TRANSFER
 * transactions, so analytics never counts them as income or expense
 * (e.g. paying a credit card from a bank account).
 */
export class TransferService {
  constructor(private readonly store: FinanceStore) {}

  async list(userId: string, request: Partial<PageRequest> = {}): Promise<Page<TransferDetail>> {
    const page = await this.store.transfers.findPage(userId, normalizePage(request));
    return { items: await this.withLegs(userId, page.items), total: page.total };
  }

  private async withLegs(userId: string, transfers: TransferRecord[]): Promise<TransferDetail[]> {
    const ids = transfers.flatMap((t) => [t.fromTransactionId, t.toTransactionId]);
    const transactions = new Map(
      (ids.length ? await this.store.transactions.findByIds(userId, ids) : []).map((t) => [t.id, t]),
    );
    return transfers.flatMap((transfer) => {
      const from = transactions.get(transfer.fromTransactionId);
      const to = transactions.get(transfer.toTransactionId);
      return from && to ? [{ ...transfer, from, to }] : [];
    });
  }

  async get(userId: string, id: string): Promise<TransferDetail> {
    return detail(this.store, userId, await requireTransfer(this.store, userId, id));
  }

  /** Records a new movement between two accounts as a linked pair of transactions. */
  async create(userId: string, input: CreateTransferInput): Promise<TransferDetail> {
    if (input.fromAccountId === input.toAccountId) {
      throw DomainError.validation('TRANSFER_SAME_ACCOUNT', 'A transfer needs two different accounts');
    }
    const amount = requireMoney('amount', input.amount);
    if (amount <= 0n) {
      throw DomainError.validation('INVALID_AMOUNT', 'amount must be positive', { field: 'amount' });
    }
    const date = requireDate('date', input.date);
    const description = requireText('description', input.description, 500);
    const notes = optionalText('notes', input.notes, 2000);

    return this.store.transaction(async (repos) => {
      const fromAccount = await requireActiveAccount(repos, userId, input.fromAccountId);
      const toAccount = await requireActiveAccount(repos, userId, input.toAccountId);
      if (fromAccount.currency !== toAccount.currency) {
        throw DomainError.validation(
          'TRANSFER_CURRENCY_MISMATCH',
          'Transfers between accounts in different currencies are not supported yet',
        );
      }

      const leg = (accountId: string, signed: bigint) => {
        const legAmount = formatMoney(signed);
        return repos.transactions.create({
          userId,
          accountId,
          date,
          description,
          merchantId: null,
          categoryId: null,
          amount: legAmount,
          currency: fromAccount.currency,
          type: TransactionType.TRANSFER,
          status: TransactionStatus.CLEARED,
          source: TransactionSource.MANUAL,
          sourceReference: null,
          notes,
          metadata: {},
          fingerprint: transactionFingerprint({ accountId, date, amount: legAmount, description }),
        });
      };

      const from = await leg(fromAccount.id, -amount);
      const to = await leg(toAccount.id, amount);
      const transfer = await repos.transfers.create({
        userId,
        fromTransactionId: from.id,
        toTransactionId: to.id,
      });
      return { ...transfer, from, to };
    });
  }

  /** Links two existing transactions (e.g. both sides imported from statements). */
  async link(userId: string, input: LinkTransferInput): Promise<TransferDetail> {
    return this.store.transaction(async (repos) => {
      const from = await requireTransaction(repos, userId, input.fromTransactionId);
      const to = await requireTransaction(repos, userId, input.toTransactionId);
      if (from.id === to.id || from.accountId === to.accountId) {
        throw DomainError.validation('TRANSFER_SAME_ACCOUNT', 'A transfer needs two different accounts');
      }
      if (from.currency !== to.currency) {
        throw DomainError.validation(
          'TRANSFER_CURRENCY_MISMATCH',
          'Transfers between accounts in different currencies are not supported yet',
        );
      }
      const fromAmount = requireMoney('amount', from.amount);
      const toAmount = requireMoney('amount', to.amount);
      if (fromAmount >= 0n || toAmount <= 0n || absMoney(fromAmount) !== toAmount) {
        throw DomainError.validation(
          'TRANSFER_AMOUNT_MISMATCH',
          'The outflow and inflow must have equal and opposite amounts',
        );
      }
      for (const transaction of [from, to]) {
        if (await repos.transfers.findByTransactionId(userId, transaction.id)) {
          throw DomainError.conflict('TRANSACTION_ALREADY_LINKED', 'Transaction is already part of a transfer');
        }
      }

      const [linkedFrom, linkedTo] = [
        await markAsTransfer(repos, userId, from),
        await markAsTransfer(repos, userId, to),
      ];
      const transfer = await repos.transfers.create({
        userId,
        fromTransactionId: from.id,
        toTransactionId: to.id,
      });
      return { ...transfer, from: linkedFrom, to: linkedTo };
    });
  }

  /** Removes the link; both transactions stay, restored to their previous type. */
  async unlink(userId: string, id: string): Promise<void> {
    await this.store.transaction(async (repos) => {
      const transfer = await requireTransfer(repos, userId, id);
      await repos.transfers.delete(userId, id);
      for (const transactionId of [transfer.fromTransactionId, transfer.toTransactionId]) {
        const transaction = await requireTransaction(repos, userId, transactionId);
        const { [TYPE_BEFORE_TRANSFER]: previous, ...metadata } = transaction.metadata;
        const restored = isTransactionType(previous) ? previous : TransactionType.UNKNOWN;
        await repos.transactions.update(userId, transactionId, { type: restored, metadata });
      }
    });
  }
}

async function requireTransfer(
  repos: Pick<Repositories, 'transfers'>,
  userId: string,
  id: string,
): Promise<TransferRecord> {
  const transfer = await repos.transfers.findById(userId, id);
  if (!transfer) {
    throw DomainError.notFound('TRANSFER_NOT_FOUND', 'Transfer not found');
  }
  return transfer;
}

async function detail(
  repos: Pick<Repositories, 'transactions'>,
  userId: string,
  transfer: TransferRecord,
): Promise<TransferDetail> {
  return {
    ...transfer,
    from: await requireTransaction(repos, userId, transfer.fromTransactionId),
    to: await requireTransaction(repos, userId, transfer.toTransactionId),
  };
}

async function markAsTransfer(
  repos: Repositories,
  userId: string,
  transaction: TransactionRecord,
): Promise<TransactionRecord> {
  if (transaction.type === TransactionType.TRANSFER) return transaction;
  return repos.transactions.update(userId, transaction.id, {
    type: TransactionType.TRANSFER,
    metadata: { ...transaction.metadata, [TYPE_BEFORE_TRANSFER]: transaction.type },
  });
}

function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (Object.values(TransactionType) as string[]).includes(value);
}
