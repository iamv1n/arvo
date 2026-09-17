import { AccountType, CategoryType, TransactionType } from '@arvo/types';
import { setup, USER_A, USER_B } from '../__tests__/helpers';

async function fixture() {
  const ctx = setup();
  const { core, store } = ctx;
  const food = store.addSystemCategory('Food', CategoryType.EXPENSE);
  const delivery = store.addSystemCategory('Delivery', CategoryType.EXPENSE, food.id);
  const dining = store.addSystemCategory('Dining', CategoryType.EXPENSE);
  const bank = await ctx.bank(USER_A, '300000');
  const card = await core.accounts.create(USER_A, { name: 'Card', type: AccountType.CREDIT_CARD, currency: 'INR' });
  const add = (date: string, amount: string, type: TransactionType, description: string, extra: Record<string, unknown> = {}) =>
    core.transactions.create(USER_A, { accountId: bank.id, date, amount, type, description, ...extra });

  // May–July: delivery ₹3,000 (irregular amounts), dining ₹3,000, Netflix ₹649.
  for (const m of ['2026-05', '2026-06', '2026-07']) {
    await add(`${m}-05`, '-1000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: delivery.id, merchantName: 'Swiggy' });
    await add(`${m}-11`, '-2000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: delivery.id, merchantName: 'Swiggy' });
    await add(`${m}-08`, '-300', TransactionType.EXPENSE, 'ZOMATO', { categoryId: dining.id, merchantName: 'Zomato' });
    await add(`${m}-25`, '-700', TransactionType.EXPENSE, 'ZOMATO', { categoryId: dining.id, merchantName: 'Zomato' });
    await add(`${m}-15`, '-2000', TransactionType.EXPENSE, 'BLUE TOKAI', { categoryId: dining.id, merchantName: 'Blue Tokai' });
    await add(`${m}-06`, '-649', TransactionType.EXPENSE, 'NETFLIX', { merchantName: 'Netflix' });
  }
  await add('2026-06-12', '-300', TransactionType.FEE, 'ATM FEE');
  await core.transactions.create(USER_A, { accountId: card.id, date: '2026-07-20', amount: '-210', type: TransactionType.INTEREST, description: 'FINANCE CHARGE' });
  // August: delivery doubles, Zomato doubles (dining flat overall), Netflix price goes up, a late fee.
  await add('2026-08-05', '-2000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: delivery.id, merchantName: 'Swiggy' });
  await add('2026-08-11', '-4000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: delivery.id, merchantName: 'Swiggy' });
  await add('2026-08-08', '-600', TransactionType.EXPENSE, 'ZOMATO', { categoryId: dining.id, merchantName: 'Zomato' });
  await add('2026-08-25', '-1400', TransactionType.EXPENSE, 'ZOMATO', { categoryId: dining.id, merchantName: 'Zomato' });
  await add('2026-08-15', '-1000', TransactionType.EXPENSE, 'BLUE TOKAI', { categoryId: dining.id, merchantName: 'Blue Tokai' });
  await add('2026-08-06', '-699', TransactionType.EXPENSE, 'NETFLIX', { merchantName: 'Netflix' });
  await add('2026-08-27', '-590', TransactionType.FEE, 'LATE FEE');
  // September: one big purchase.
  const croma = await add('2026-09-08', '-12000', TransactionType.EXPENSE, 'CROMA HEADPHONES');
  return { ...ctx, food, dining, croma };
}

describe('SavingsService', () => {
  it('ranks evidence-backed opportunities and totals only non-overlapping savings', async () => {
    const { core, food, dining, croma } = await fixture();
    const result = await core.savings.opportunities(USER_A, { currency: 'INR', asOf: '2026-09-10' });
    expect(result).toMatchObject({ month: '2026-08', asOf: '2026-09-10' });
    const summary = result.opportunities.map((o) => [o.kind, o.title, o.monthlySaving, o.includedInTotal]);
    expect(summary).toEqual([
      // Food (with Delivery) 6,000 vs 3,000 average.
      ['category_creep', 'Food', '3000.00', true],
      // Swiggy is the same money as Food's creep, so it is not counted twice.
      ['merchant_creep', 'Swiggy', '3000.00', false],
      // Zomato 2,000 vs 1,000 while Dining overall stayed flat.
      ['merchant_creep', 'Zomato', '1000.00', true],
      // (300 + 210 + 590) / 3.
      ['fees_and_interest', 'Fees and interest charges', '366.67', true],
      ['subscription_price_increase', 'Netflix', '50.00', true],
      ['one_off_spike', 'CROMA HEADPHONES', '0.00', false],
    ]);
    expect(result.totalMonthly).toBe('4416.67');
    expect(result.totalYearly).toBe('53000.04');

    const [foodCreep, , zomato, fees, netflix, spike] = result.opportunities;
    expect(foodCreep).toMatchObject({
      categoryId: food.id,
      confidence: 'high',
      rationale: { current: '6000.00', baseline: '3000.00', changePercent: 100, period: { from: '2026-08-01', to: '2026-08-31' }, basis: 'Aug vs 3-month average' },
      evidence: { query: { from: '2026-08-01', to: '2026-08-31', type: 'EXPENSE,FEE', categoryId: food.id } },
    });
    expect(zomato).toMatchObject({ categoryId: dining.id, rationale: { changePercent: 100 }, evidence: { query: { merchantId: zomato.merchantId } } });
    expect(fees.evidence.query).toEqual({ from: '2026-06-01', to: '2026-08-31', type: 'FEE,INTEREST', direction: 'OUT' });
    expect(netflix.rationale).toMatchObject({ current: '699.00', baseline: '649.00', changePercent: 7.7 });
    expect(netflix.evidence.transactionIds).toHaveLength(2);
    expect(spike).toMatchObject({ informational: true, evidence: { transactionIds: [croma.id] }, rationale: { current: '12000.00' } });
  });

  it('is empty for a user without history', async () => {
    const { core } = await fixture();
    expect(await core.savings.opportunities(USER_B, { currency: 'INR', asOf: '2026-09-10' })).toMatchObject({ totalMonthly: '0.00', opportunities: [] });
  });
});
