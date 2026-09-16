import { TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';

describe('TransferService', () => {
  it('records a bank → credit card payment as two linked TRANSFER legs', async () => {
    const { core, bank, card } = setup();
    const hdfc = await bank(USER_A, '50000');
    const icici = await card();
    await core.transactions.create(USER_A, {
      accountId: icici.id,
      date: '2026-08-03',
      description: 'Amazon',
      amount: '-8000',
      type: TransactionType.EXPENSE,
    });

    const transfer = await core.transfers.create(USER_A, {
      fromAccountId: hdfc.id,
      toAccountId: icici.id,
      amount: '8000',
      date: '2026-08-20',
      description: 'Card bill payment',
    });

    expect(transfer.from).toMatchObject({ accountId: hdfc.id, amount: '-8000.00', type: TransactionType.TRANSFER });
    expect(transfer.to).toMatchObject({ accountId: icici.id, amount: '8000.00', type: TransactionType.TRANSFER });
    expect((await core.accounts.get(USER_A, hdfc.id)).balance).toBe('42000.00');
    expect((await core.accounts.get(USER_A, icici.id)).balance).toBe('0.00');
    expect((await core.transfers.list(USER_A)).total).toBe(1);
    expect(await core.transfers.list(USER_B)).toEqual({ items: [], total: 0 });
    expect((await core.transfers.list(USER_A, { limit: 1, offset: 1 })).items).toEqual([]);
  });

  it('validates transfer input', async () => {
    const { core, bank, card } = setup();
    const a = await bank();
    const b = await card();
    const input = { fromAccountId: a.id, toAccountId: b.id, amount: '100', date: '2026-08-01', description: 'Move' };
    await expectDomainError(core.transfers.create(USER_A, { ...input, toAccountId: a.id }), 'TRANSFER_SAME_ACCOUNT');
    await expectDomainError(core.transfers.create(USER_A, { ...input, amount: '-100' }), 'INVALID_AMOUNT');
    const otherUsers = await bank(USER_B);
    await expectDomainError(core.transfers.create(USER_A, { ...input, toAccountId: otherUsers.id }), 'ACCOUNT_NOT_FOUND');
  });

  describe('linking existing transactions', () => {
    async function imported() {
      const ctx = setup();
      const hdfc = await ctx.bank();
      const icici = await ctx.card();
      const out = await ctx.core.transactions.create(USER_A, {
        accountId: hdfc.id, date: '2026-08-20', description: 'CC PAYMENT', amount: '-8000', type: TransactionType.EXPENSE,
      });
      const inflow = await ctx.core.transactions.create(USER_A, {
        accountId: icici.id, date: '2026-08-21', description: 'PAYMENT RECEIVED', amount: '8000', type: TransactionType.UNKNOWN,
      });
      return { ...ctx, out, inflow };
    }

    it('marks both as transfers and restores previous types on unlink', async () => {
      const { core, out, inflow } = await imported();
      const transfer = await core.transfers.link(USER_A, { fromTransactionId: out.id, toTransactionId: inflow.id });
      expect(transfer.from.type).toBe(TransactionType.TRANSFER);
      expect(transfer.to.type).toBe(TransactionType.TRANSFER);

      await expectDomainError(core.transactions.delete(USER_A, out.id), 'TRANSACTION_IN_TRANSFER');
      await expectDomainError(core.transactions.update(USER_A, out.id, { amount: '-1' }), 'TRANSACTION_IN_TRANSFER');
      await core.transactions.update(USER_A, out.id, { notes: 'October bill' });
      await expectDomainError(
        core.transfers.link(USER_A, { fromTransactionId: out.id, toTransactionId: inflow.id }),
        'TRANSACTION_ALREADY_LINKED',
      );

      await core.transfers.unlink(USER_A, transfer.id);
      const restoredOut = await core.transactions.get(USER_A, out.id);
      expect(restoredOut.type).toBe(TransactionType.EXPENSE);
      expect(restoredOut.metadata).toEqual({});
      expect((await core.transactions.get(USER_A, inflow.id)).type).toBe(TransactionType.UNKNOWN);
      await core.transactions.delete(USER_A, out.id);
    });

    it('requires equal and opposite amounts', async () => {
      const { core, out, inflow } = await imported();
      await core.transactions.update(USER_A, inflow.id, { amount: '7999.99' });
      await expectDomainError(
        core.transfers.link(USER_A, { fromTransactionId: out.id, toTransactionId: inflow.id }),
        'TRANSFER_AMOUNT_MISMATCH',
      );
      await expectDomainError(
        core.transfers.link(USER_A, { fromTransactionId: inflow.id, toTransactionId: out.id }),
        'TRANSFER_AMOUNT_MISMATCH',
      );
    });

    it('cannot link or unlink another user’s data', async () => {
      const { core, out, inflow } = await imported();
      await expectDomainError(
        core.transfers.link(USER_B, { fromTransactionId: out.id, toTransactionId: inflow.id }),
        'TRANSACTION_NOT_FOUND',
      );
      const transfer = await core.transfers.link(USER_A, { fromTransactionId: out.id, toTransactionId: inflow.id });
      await expectDomainError(core.transfers.unlink(USER_B, transfer.id), 'TRANSFER_NOT_FOUND');
    });
  });
});
