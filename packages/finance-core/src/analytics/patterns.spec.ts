import { CategoryType, TransactionType } from '@arvo/types';
import { setup, USER_A, USER_B } from '../__tests__/helpers';

async function fixture() {
  const ctx = setup();
  const { core, store } = ctx;
  const food = store.addSystemCategory('Food', CategoryType.EXPENSE);
  const rent = store.addSystemCategory('Rent', CategoryType.EXPENSE);
  const bank = await ctx.bank(USER_A, '100000');
  const add = (date: string, amount: string, type: TransactionType, description: string, extra: Record<string, unknown> = {}) =>
    core.transactions.create(USER_A, { accountId: bank.id, date, amount, type, description, ...extra });
  for (const m of ['2026-06', '2026-07', '2026-08']) {
    await add(`${m}-02`, '-1000', TransactionType.EXPENSE, 'GROCERY', { categoryId: food.id });
    await add(`${m}-05`, '-20000', TransactionType.EXPENSE, 'RENT', { categoryId: rent.id, merchantName: 'Landlord' });
  }
  await add('2026-09-01', '80000', TransactionType.INCOME, 'SALARY');
  await add('2026-09-02', '-50', TransactionType.EXPENSE, 'CHAI', { categoryId: food.id });
  await add('2026-09-02', '-450', TransactionType.EXPENSE, 'LUNCH', { categoryId: food.id });
  await add('2026-09-05', '-20000', TransactionType.EXPENSE, 'RENT', { categoryId: rent.id, merchantName: 'Landlord' });
  await add('2026-09-06', '-300', TransactionType.FEE, 'ATM FEE');
  await add('2026-09-06', '500', TransactionType.REFUND, 'REFUND', { categoryId: food.id });
  return ctx;
}

describe('PatternsService', () => {
  it('computes daily totals, burn-up, weekday rhythm, size bands, waterfall and upcoming charges', async () => {
    const { core } = await fixture();
    const p = await core.patterns.patterns(USER_A, { currency: 'INR', asOf: '2026-09-10' });

    expect(p.daily).toHaveLength(84);
    expect(p.daily.at(-1)).toEqual({ date: '2026-09-10', spent: '0.00', count: 0 });
    expect(p.daily.find((d) => d.date === '2026-09-02')).toEqual({ date: '2026-09-02', spent: '500.00', count: 2 });
    // Refunds are not spending; the fee is.
    expect(p.daily.find((d) => d.date === '2026-09-06')).toEqual({ date: '2026-09-06', spent: '300.00', count: 1 });

    expect(p.burnUp).toHaveLength(30);
    expect(p.burnUp[0]).toEqual({ day: 1, thisMonth: '0.00', lastMonth: '0.00', average: '0.00' });
    expect(p.burnUp[4]).toEqual({ day: 5, thisMonth: '20500.00', lastMonth: '21000.00', average: '21000.00' });
    expect(p.burnUp[9].thisMonth).toBe('20800.00');
    expect(p.burnUp[10].thisMonth).toBeNull();
    expect(p.burnUp[29]).toMatchObject({ lastMonth: '21000.00', average: '21000.00' });

    // The 84-day window starts 2026-06-19; the only Saturday with spending is 2026-09-05 (rent).
    expect(p.weekdays[6]).toMatchObject({ weekday: 6, count: 1, total: '20000.00' });

    expect(p.sizeBands.map((b) => [b.label, b.count, b.total])).toEqual([
      ['0–100', 1, '50.00'],
      ['100–500', 1, '450.00'],
      ['500–2000', 2, '2000.00'],
      ['2000–10000', 0, '0.00'],
      ['10000+', 3, '60000.00'],
    ]);

    expect(p.waterfall).toEqual([
      { label: 'Income', kind: 'income', amount: '80000.00' },
      { label: 'Rent', kind: 'category', amount: '20000.00' },
      { label: 'Uncategorized', kind: 'category', amount: '300.00' },
      { label: 'Left over', kind: 'remaining', amount: '59700.00' },
    ]);

    expect(p.upcoming).toEqual([{ label: 'Landlord', amount: '20000.00', date: '2026-10-05', frequency: 'MONTHLY', priceIncreased: false }]);
    expect(p.totals).toMatchObject({ windowDays: 84, busiestDay: { date: '2026-07-05', spent: '20000.00', count: 1 } });
  });

  it('returns empty patterns for users without data', async () => {
    const { core } = setup();
    const p = await core.patterns.patterns(USER_B, { currency: 'INR', asOf: '2026-09-10' });
    expect(p.totals).toMatchObject({ spent: '0.00', transactions: 0, busiestDay: null });
    expect(p.upcoming).toEqual([]);
  });
});
