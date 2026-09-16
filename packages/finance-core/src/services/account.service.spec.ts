import { AccountType, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';

describe('AccountService', () => {
  it('creates an account with a normalized opening balance and currency', async () => {
    const { core } = setup();
    const account = await core.accounts.create(USER_A, {
      name: '  HDFC  ',
      type: AccountType.BANK,
      currency: 'inr',
      openingBalance: '1500.5',
    });
    expect(account).toMatchObject({
      name: 'HDFC',
      currency: 'INR',
      openingBalance: '1500.50',
      balance: '1500.50',
      isActive: true,
      institution: null,
    });
  });

  it('computes balance as opening balance plus all transaction amounts', async () => {
    const { core, bank } = setup();
    const account = await bank(USER_A, '10000');
    const add = (amount: string, type: TransactionType) =>
      core.transactions.create(USER_A, { accountId: account.id, date: '2026-08-01', description: 'x', amount, type });
    await add('50000', TransactionType.INCOME);
    await add('-1234.56', TransactionType.EXPENSE);
    await add('-0.44', TransactionType.FEE);
    expect((await core.accounts.get(USER_A, account.id)).balance).toBe('58765.00');
  });

  it('rejects invalid input', async () => {
    const { core } = setup();
    const base = { name: 'A', type: AccountType.CASH, currency: 'INR' };
    await expectDomainError(core.accounts.create(USER_A, { ...base, name: '  ' }), 'INVALID_INPUT');
    await expectDomainError(core.accounts.create(USER_A, { ...base, currency: 'RUPEES' }), 'INVALID_CURRENCY');
    await expectDomainError(core.accounts.create(USER_A, { ...base, openingBalance: '1.23456' }), 'INVALID_AMOUNT');
  });

  it('does not expose one user’s accounts to another', async () => {
    const { core, bank } = setup();
    const account = await bank(USER_A);
    expect(await core.accounts.list(USER_B)).toEqual([]);
    await expectDomainError(core.accounts.get(USER_B, account.id), 'ACCOUNT_NOT_FOUND');
    await expectDomainError(core.accounts.update(USER_B, account.id, { name: 'hijack' }), 'ACCOUNT_NOT_FOUND');
    await expectDomainError(core.accounts.delete(USER_B, account.id), 'ACCOUNT_NOT_FOUND');
  });

  it('refuses to delete an account with transactions but allows deactivation', async () => {
    const { core, bank } = setup();
    const account = await bank();
    await core.transactions.create(USER_A, {
      accountId: account.id,
      date: '2026-08-01',
      description: 'Coffee',
      amount: '-200',
      type: TransactionType.EXPENSE,
    });
    await expectDomainError(core.accounts.delete(USER_A, account.id), 'ACCOUNT_HAS_TRANSACTIONS');
    const updated = await core.accounts.update(USER_A, account.id, { isActive: false });
    expect(updated.isActive).toBe(false);
    expect(updated.balance).toBe('9800.00');
  });

  it('deletes an empty account', async () => {
    const { core, bank } = setup();
    const account = await bank();
    await core.accounts.delete(USER_A, account.id);
    await expectDomainError(core.accounts.get(USER_A, account.id), 'ACCOUNT_NOT_FOUND');
  });
});
