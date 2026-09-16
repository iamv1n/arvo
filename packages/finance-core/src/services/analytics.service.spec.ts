import { AccountType, CategoryType, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import { monthsBetween } from './analytics.service';

async function fixture() {
  const ctx = setup();
  const { core, store } = ctx;
  const food = store.addSystemCategory('Food');
  const delivery = store.addSystemCategory('Delivery', CategoryType.EXPENSE, food.id);
  const groceries = store.addSystemCategory('Groceries', CategoryType.EXPENSE, food.id);
  const shopping = store.addSystemCategory('Shopping');
  const bank = await ctx.bank(USER_A, '100000');
  const card = await ctx.card();
  const add = (accountId: string, date: string, amount: string, type: TransactionType, categoryId?: string) =>
    core.transactions.create(USER_A, { accountId, date, description: `${type} ${amount}`, amount, type, categoryId });

  // July
  await add(bank.id, '2026-07-01', '120000', TransactionType.INCOME);
  await add(card.id, '2026-07-10', '-3000', TransactionType.EXPENSE, groceries.id);
  // August
  await add(bank.id, '2026-08-01', '120000', TransactionType.INCOME);
  await add(bank.id, '2026-08-31', '150.25', TransactionType.INTEREST);
  await add(card.id, '2026-08-05', '-649.50', TransactionType.EXPENSE, delivery.id);
  await add(card.id, '2026-08-06', '-2400', TransactionType.EXPENSE, groceries.id);
  await add(card.id, '2026-08-07', '-10000', TransactionType.EXPENSE, shopping.id);
  await add(card.id, '2026-08-09', '4000', TransactionType.REFUND, shopping.id);
  await add(card.id, '2026-08-09', '-236', TransactionType.FEE);
  await add(bank.id, '2026-08-12', '-500', TransactionType.UNKNOWN);
  await core.transfers.create(USER_A, {
    fromAccountId: bank.id, toAccountId: card.id, amount: '15000', date: '2026-08-20', description: 'Card bill',
  });
  // Other user and other currency are excluded
  const other = await ctx.bank(USER_B);
  await core.transactions.create(USER_B, {
    accountId: other.id, date: '2026-08-02', description: 'x', amount: '999999', type: TransactionType.INCOME,
  });
  const usd = await core.accounts.create(USER_A, { name: 'US', type: AccountType.BANK, currency: 'USD', openingBalance: '10' });
  await core.transactions.create(USER_A, {
    accountId: usd.id, date: '2026-08-02', description: 'x', amount: '-5', type: TransactionType.EXPENSE,
  });
  return { ...ctx, bank, card, food, delivery, groceries, shopping };
}

const AUGUST = { from: '2026-08-01', to: '2026-08-31', currency: 'INR' };

describe('AnalyticsService', () => {
  it('computes income, expenses and cashflow excluding transfers, with refunds reducing expenses', async () => {
    const { core } = await fixture();
    const summary = await core.analytics.summary(USER_A, AUGUST);
    expect(summary).toMatchObject({
      income: '120150.25',
      // 649.50 + 2400 + 10000 − 4000 + 236
      expenses: '9285.50',
      netCashflow: '110864.75',
      savingsRate: 92.3,
      transfersVolume: '15000.00',
      unclassified: { inflow: '0.00', outflow: '500.00', transactionCount: 1 },
      transactionCount: 10,
    });
  });

  it('breaks spending down by category and rolls subcategories up', async () => {
    const { core, food, shopping } = await fixture();
    const summary = await core.analytics.summary(USER_A, AUGUST);
    expect(summary.spendingByCategory.map((c) => [c.name, c.parentName, c.amount])).toEqual([
      ['Shopping', null, '6000.00'],
      ['Groceries', 'Food', '2400.00'],
      ['Delivery', 'Food', '649.50'],
      ['Uncategorized', null, '236.00'],
    ]);
    expect(summary.spendingByTopCategory.map((c) => [c.categoryId, c.amount, c.transactionCount])).toEqual([
      [shopping.id, '6000.00', 2],
      [food.id, '3049.50', 2],
      [null, '236.00', 1],
    ]);
  });

  it('produces a continuous monthly series', async () => {
    const { core } = await fixture();
    const series = await core.analytics.monthly(USER_A, { from: '2026-06-01', to: '2026-08-31', currency: 'INR' });
    expect(series).toEqual([
      { month: '2026-06', income: '0.00', expenses: '0.00', netCashflow: '0.00' },
      { month: '2026-07', income: '120000.00', expenses: '3000.00', netCashflow: '117000.00' },
      { month: '2026-08', income: '120150.25', expenses: '9285.50', netCashflow: '110864.75' },
    ]);
  });

  it('computes net worth as assets minus liabilities in one currency', async () => {
    const { core } = await fixture();
    const worth = await core.analytics.netWorth(USER_A, 'INR');
    // bank: 100000 + 120000 + 120000 + 150.25 − 500 − 15000 = 324650.25
    // card: −3000 − 649.50 − 2400 − 10000 + 4000 − 236 + 15000 = 2714.50 (overpaid → negative liability)
    expect(worth).toMatchObject({
      assets: '324650.25',
      liabilities: '-2714.50',
      netWorth: '327364.75',
      excludedAccountCount: 1,
    });
    expect(worth.accounts.map((a) => a.kind)).toEqual(['ASSET', 'LIABILITY']);
  });

  it('returns zeros without income and validates the period', async () => {
    const { core } = setup();
    const empty = await core.analytics.summary(USER_A, AUGUST);
    expect(empty).toMatchObject({ income: '0.00', expenses: '0.00', savingsRate: null, spendingByCategory: [] });
    await expectDomainError(core.analytics.summary(USER_A, { ...AUGUST, from: '2026-09-01' }), 'INVALID_DATE_RANGE');
    await expectDomainError(core.analytics.summary(USER_A, { ...AUGUST, currency: 'rupee' }), 'INVALID_CURRENCY');
  });

  it('enumerates months across year boundaries', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
