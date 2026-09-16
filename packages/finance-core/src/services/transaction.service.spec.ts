import { AccountType, CategoryType, TransactionStatus, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';

const expense = (accountId: string, overrides: Record<string, unknown> = {}) => ({
  accountId,
  date: '2026-08-14',
  description: 'Swiggy order',
  amount: '-450',
  type: TransactionType.EXPENSE,
  ...overrides,
});

describe('TransactionService', () => {
  it('creates a manual transaction with defaults and a fingerprint', async () => {
    const { core, bank } = setup();
    const account = await bank();
    const tx = await core.transactions.create(USER_A, expense(account.id));
    expect(tx).toMatchObject({
      amount: '-450.00',
      currency: 'INR',
      status: TransactionStatus.CLEARED,
      source: 'MANUAL',
      merchantId: null,
      categoryId: null,
      metadata: {},
    });
    expect(tx.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    [TransactionType.EXPENSE, '450', 'AMOUNT_SIGN_MISMATCH'],
    [TransactionType.FEE, '10', 'AMOUNT_SIGN_MISMATCH'],
    [TransactionType.INCOME, '-100', 'AMOUNT_SIGN_MISMATCH'],
    [TransactionType.REFUND, '-100', 'AMOUNT_SIGN_MISMATCH'],
    [TransactionType.UNKNOWN, '0', 'INVALID_AMOUNT'],
  ])('rejects %s with amount %s', async (type, amount, code) => {
    const { core, bank } = setup();
    const account = await bank();
    await expectDomainError(core.transactions.create(USER_A, expense(account.id, { type, amount })), code);
  });

  it('allows interest and unknown rows in either direction', async () => {
    const { core, bank } = setup();
    const account = await bank();
    await core.transactions.create(USER_A, expense(account.id, { type: TransactionType.INTEREST, amount: '-120' }));
    await core.transactions.create(USER_A, expense(account.id, { type: TransactionType.UNKNOWN, amount: '75' }));
  });

  it('validates date, currency and account state', async () => {
    const { core, bank } = setup();
    const account = await bank();
    await expectDomainError(core.transactions.create(USER_A, expense(account.id, { date: '2026-02-30' })), 'INVALID_DATE');
    await expectDomainError(core.transactions.create(USER_A, expense(account.id, { currency: 'USD' })), 'CURRENCY_MISMATCH');
    await core.accounts.update(USER_A, account.id, { isActive: false });
    await expectDomainError(core.transactions.create(USER_A, expense(account.id)), 'ACCOUNT_INACTIVE');
  });

  it('resolves merchants by normalized name', async () => {
    const { core, bank } = setup();
    const account = await bank();
    const first = await core.transactions.create(USER_A, expense(account.id, { merchantName: 'Swiggy' }));
    const second = await core.transactions.create(USER_A, expense(account.id, { merchantName: ' SWIGGY. ' }));
    expect(first.merchantId).not.toBeNull();
    expect(second.merchantId).toBe(first.merchantId);
    expect(await core.merchants.list(USER_A)).toHaveLength(1);
  });

  it('cannot reference another user’s account, category or merchant', async () => {
    const { core, bank } = setup();
    const accountB = await bank(USER_B);
    const accountA = await bank(USER_A);
    const categoryB = await core.categories.create(USER_B, { name: 'Secret', type: CategoryType.EXPENSE });
    const merchantB = await core.merchants.create(USER_B, 'Hidden Shop');
    await expectDomainError(core.transactions.create(USER_A, expense(accountB.id)), 'ACCOUNT_NOT_FOUND');
    await expectDomainError(core.transactions.create(USER_A, expense(accountA.id, { categoryId: categoryB.id })), 'CATEGORY_NOT_FOUND');
    await expectDomainError(core.transactions.create(USER_A, expense(accountA.id, { merchantId: merchantB.id })), 'MERCHANT_NOT_FOUND');
  });

  it('rolls back a merchant created for a transaction that then fails validation', async () => {
    const { core, bank } = setup();
    const account = await bank();
    await expectDomainError(
      core.transactions.create(USER_A, expense(account.id, { merchantName: 'Ghost', categoryId: 'missing' })),
      'CATEGORY_NOT_FOUND',
    );
    expect(await core.merchants.list(USER_A)).toEqual([]);
  });

  it('updates fields, revalidates sign against the merged type and refreshes the fingerprint', async () => {
    const { core, bank } = setup();
    const account = await bank();
    const tx = await core.transactions.create(USER_A, expense(account.id));
    await expectDomainError(core.transactions.update(USER_A, tx.id, { type: TransactionType.INCOME }), 'AMOUNT_SIGN_MISMATCH');
    const updated = await core.transactions.update(USER_A, tx.id, { amount: '-500', notes: 'late night' });
    expect(updated).toMatchObject({ amount: '-500.00', notes: 'late night' });
    expect(updated.fingerprint).not.toBe(tx.fingerprint);
  });

  it('lists with filters, search and clamped pagination', async () => {
    const { core, bank } = setup();
    const account = await bank();
    await core.transactions.create(USER_A, expense(account.id, { date: '2026-07-01', description: 'Rent July' }));
    await core.transactions.create(USER_A, expense(account.id, { date: '2026-08-01', description: 'Rent August' }));
    await core.transactions.create(USER_A, expense(account.id, { date: '2026-08-02', type: TransactionType.INCOME, amount: '100', description: 'Salary' }));
    await core.transactions.create(USER_B, expense((await bank(USER_B)).id));

    const august = await core.transactions.list(USER_A, { from: '2026-08-01', to: '2026-08-31' });
    expect(august.total).toBe(2);
    expect((await core.transactions.list(USER_A, { search: 'rent' })).total).toBe(2);
    expect((await core.transactions.list(USER_A, { types: [TransactionType.INCOME] })).items[0].description).toBe('Salary');
    expect((await core.transactions.list(USER_A, { limit: 10_000 })).total).toBe(3);
    await expectDomainError(core.transactions.list(USER_A, { from: '2026-09-01', to: '2026-08-01' }), 'INVALID_DATE_RANGE');
  });

  it('filters by amount range, direction, merchant presence, category presence and source', async () => {
    const { core, bank } = setup();
    const account = await bank();
    await core.transactions.create(USER_A, expense(account.id, { amount: '-99.50', description: 'Tea', merchantName: 'Chaayos' }));
    await core.transactions.create(USER_A, expense(account.id, { amount: '-1200', description: 'Shoes' }));
    await core.transactions.create(USER_A, expense(account.id, { amount: '5000', type: TransactionType.INCOME, description: 'Refund-ish income' }));
    const list = (filter: Record<string, unknown>) => core.transactions.list(USER_A, filter).then((p) => p.items.map((t) => t.description).sort());

    expect(await list({ minAmount: '100' })).toEqual(['Refund-ish income', 'Shoes']);
    expect(await list({ minAmount: '99.5', maxAmount: '1200' })).toEqual(['Shoes', 'Tea']);
    expect(await list({ direction: 'OUT' })).toEqual(['Shoes', 'Tea']);
    expect(await list({ direction: 'IN' })).toEqual(['Refund-ish income']);
    expect(await list({ withoutMerchant: true })).toEqual(['Refund-ish income', 'Shoes']);
    expect(await list({ uncategorized: true })).toHaveLength(3);
    expect(await list({ sources: ['CSV'] })).toEqual([]);
    await expectDomainError(core.transactions.list(USER_A, { minAmount: '-5' }), 'INVALID_AMOUNT');
    await expectDomainError(core.transactions.list(USER_A, { minAmount: '10', maxAmount: '5' }), 'INVALID_AMOUNT_RANGE');
  });

  it('bulk assigns merchants by name, clears them, and rejects empty changes', async () => {
    const { core, bank } = setup();
    const account = await bank();
    const a = await core.transactions.create(USER_A, expense(account.id, { description: 'UPI 1' }));
    const b = await core.transactions.create(USER_A, expense(account.id, { description: 'UPI 2' }));
    expect(await core.transactions.bulkUpdate(USER_A, [a.id, b.id], { merchantName: 'Blinkit' })).toBe(2);
    const merchantId = (await core.transactions.get(USER_A, a.id)).merchantId;
    expect(merchantId).not.toBeNull();
    expect((await core.transactions.get(USER_A, b.id)).merchantId).toBe(merchantId);
    expect(await core.merchants.list(USER_A)).toHaveLength(1);

    await core.transactions.bulkUpdate(USER_A, [a.id], { merchantId: null });
    expect((await core.transactions.get(USER_A, a.id)).merchantId).toBeNull();
    await expectDomainError(core.transactions.bulkUpdate(USER_A, [a.id], {}), 'INVALID_INPUT');
    await expectDomainError(core.transactions.bulkUpdate(USER_B, [a.id], { merchantName: 'X' }), 'TRANSACTION_NOT_FOUND');
  });

  it('bulk categorizes atomically', async () => {
    const { core, bank, store } = setup();
    const food = store.addSystemCategory('Food');
    const account = await bank();
    const a = await core.transactions.create(USER_A, expense(account.id));
    const b = await core.transactions.create(USER_A, expense(account.id, { description: 'Zomato' }));

    const error = await expectDomainError(core.transactions.bulkCategorize(USER_A, [a.id, 'missing'], food.id), 'TRANSACTION_NOT_FOUND');
    expect(error.details).toEqual({ missing: ['missing'] });
    expect((await core.transactions.get(USER_A, a.id)).categoryId).toBeNull();

    expect(await core.transactions.bulkCategorize(USER_A, [a.id, b.id, a.id], food.id)).toBe(2);
    expect((await core.transactions.get(USER_A, b.id)).categoryId).toBe(food.id);
    expect(await core.transactions.bulkCategorize(USER_A, [a.id], null)).toBe(1);
    expect((await core.transactions.get(USER_A, a.id)).categoryId).toBeNull();
  });

  it('deletes transactions but only for their owner', async () => {
    const { core, bank } = setup();
    const account = await bank();
    const tx = await core.transactions.create(USER_A, expense(account.id));
    await expectDomainError(core.transactions.delete(USER_B, tx.id), 'TRANSACTION_NOT_FOUND');
    await core.transactions.delete(USER_A, tx.id);
    await expectDomainError(core.transactions.get(USER_A, tx.id), 'TRANSACTION_NOT_FOUND');
  });

  it('supports credit-card purchases as negative amounts that grow the liability', async () => {
    const { core, card } = setup();
    const account = await card();
    expect(account.type).toBe(AccountType.CREDIT_CARD);
    await core.transactions.create(USER_A, expense(account.id, { amount: '-2500' }));
    expect((await core.accounts.get(USER_A, account.id)).balance).toBe('-2500.00');
  });
});
