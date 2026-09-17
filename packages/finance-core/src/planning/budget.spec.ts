import { CategoryType, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';

async function fixture() {
  const ctx = setup();
  const { core, store } = ctx;
  const food = store.addSystemCategory('Food', CategoryType.EXPENSE);
  const delivery = store.addSystemCategory('Delivery', CategoryType.EXPENSE, food.id);
  const rent = store.addSystemCategory('Rent', CategoryType.EXPENSE);
  const shopping = store.addSystemCategory('Shopping', CategoryType.EXPENSE);
  const bank = await ctx.bank(USER_A, '500000');
  const add = (date: string, amount: string, type: TransactionType, categoryId: string) =>
    core.transactions.create(USER_A, { accountId: bank.id, date, amount, type, description: 'TXN', categoryId });

  await add('2026-08-12', '-2000', TransactionType.EXPENSE, shopping.id);
  await add('2026-09-02', '-2000', TransactionType.EXPENSE, food.id);
  await add('2026-09-05', '-1500', TransactionType.EXPENSE, delivery.id);
  await add('2026-09-06', '-500', TransactionType.FEE, food.id);
  await add('2026-09-07', '300', TransactionType.REFUND, food.id);
  await add('2026-09-03', '-31000', TransactionType.EXPENSE, rent.id);
  await add('2026-10-01', '-999', TransactionType.EXPENSE, food.id);
  return { ...ctx, food, delivery, rent, shopping };
}

describe('BudgetService', () => {
  it('paces budgets with subcategories, projection, rollover and totals', async () => {
    const { core, food, rent, shopping } = await fixture();
    await core.budgets.create(USER_A, { categoryId: food.id, amount: '10000', currency: 'inr' });
    await core.budgets.create(USER_A, { categoryId: rent.id, amount: '30000', currency: 'INR' });
    await core.budgets.create(USER_A, { categoryId: shopping.id, amount: '5000', currency: 'INR', rollover: true });

    const result = await core.budgets.status(USER_A, { asOf: '2026-09-10' });
    expect(result).toMatchObject({ month: '2026-09', daysInMonth: 30, daysElapsed: 10, percentOfMonthElapsed: 33.3 });
    const by = (name: string) => result.budgets.find((b) => b.categoryName === name)!;

    // Food + Delivery child: 2,000 + 1,500 + 500 fee = 4,000 in 10 days → 12,000 projected.
    expect(by('Food')).toMatchObject({
      limit: '10000.00', spent: '4000.00', remaining: '6000.00', percentUsed: 40, projected: '12000.00',
      projectedOverspend: '2000.00', status: 'at_risk', transactionCount: 3,
    });
    expect(by('Rent')).toMatchObject({ spent: '31000.00', remaining: '-1000.00', percentUsed: 103.3, status: 'over' });
    // August shopping 2,000 of 5,000 → 3,000 carried over.
    expect(by('Shopping')).toMatchObject({ carriedOver: '3000.00', limit: '8000.00', spent: '0.00', status: 'on_track' });
    expect(result.budgets.map((b) => b.categoryName)).toEqual(['Rent', 'Food', 'Shopping']);
    expect(result.totals).toEqual([
      { currency: 'INR', limit: '48000.00', spent: '35000.00', remaining: '13000.00', projected: '105000.00', percentUsed: 72.9 },
    ]);

    // A past month is fully elapsed: projection equals spent.
    const august = await core.budgets.status(USER_A, { asOf: '2026-09-10', month: '2026-08' });
    expect(august.percentOfMonthElapsed).toBe(100);
    expect(august.budgets.find((b) => b.categoryName === 'Shopping')).toMatchObject({ spent: '2000.00', projected: '2000.00', status: 'on_track' });
  });

  it('validates input, rejects duplicates and scopes by user', async () => {
    const { core, food } = await fixture();
    await expectDomainError(core.budgets.create(USER_A, { categoryId: food.id, amount: '0', currency: 'INR' }), 'INVALID_AMOUNT');
    await expectDomainError(core.budgets.create(USER_A, { categoryId: food.id, amount: '10', currency: 'INRX' }), 'INVALID_CURRENCY');
    await expectDomainError(
      core.budgets.create(USER_A, { categoryId: '00000000-0000-4000-8000-000000000999', amount: '10', currency: 'INR' }),
      'CATEGORY_NOT_FOUND',
    );
    const budget = await core.budgets.create(USER_A, { categoryId: food.id, amount: '100', currency: 'INR' });
    await expectDomainError(core.budgets.create(USER_A, { categoryId: food.id, amount: '200', currency: 'INR' }), 'BUDGET_EXISTS');
    expect(await core.budgets.update(USER_A, budget.id, { amount: '250.5', rollover: true })).toMatchObject({ amount: '250.50', rollover: true });
    await expectDomainError(core.budgets.update(USER_B, budget.id, { amount: '1' }), 'BUDGET_NOT_FOUND');
    expect((await core.budgets.status(USER_B, { asOf: '2026-09-10' })).budgets).toEqual([]);
    await expectDomainError(core.budgets.status(USER_A, { asOf: '2026-09-10', month: '2026-13' }), 'INVALID_INPUT');
    await core.budgets.delete(USER_A, budget.id);
    expect(await core.budgets.list(USER_A)).toEqual([]);
  });
});
