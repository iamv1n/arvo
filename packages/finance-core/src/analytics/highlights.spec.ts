import { AccountType, CategoryType, TransactionType } from '@arvo/types';
import { setup, USER_A, USER_B } from '../__tests__/helpers';
import type { Highlight } from './highlights.service';

type Kind = Highlight['kind'];
const find = <K extends Kind>(list: Highlight[], kind: K) => list.find((h) => h.kind === kind) as Extract<Highlight, { kind: K }> | undefined;

async function fixture() {
  const ctx = setup();
  const { core, store } = ctx;
  const delivery = store.addSystemCategory('Delivery', CategoryType.EXPENSE);
  const rent = store.addSystemCategory('Rent', CategoryType.EXPENSE);
  const bank = await ctx.bank(USER_A, '300000');
  const add = (date: string, amount: string, type: TransactionType, description: string, extra: Record<string, unknown> = {}) =>
    core.transactions.create(USER_A, { accountId: bank.id, date, amount, type, description, ...extra });

  // Three prior months: salary, rent, delivery ₹3,000 each month, Netflix.
  for (const m of ['2026-05', '2026-06', '2026-07']) {
    await add(`${m}-01`, '100000', TransactionType.INCOME, 'SALARY');
    await add(`${m}-03`, '-30000', TransactionType.EXPENSE, 'RENT', { categoryId: rent.id });
    await add(`${m}-10`, '-3000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: delivery.id, merchantName: 'Swiggy' });
    await add(`${m}-06`, '-649', TransactionType.EXPENSE, 'NETFLIX', { merchantName: 'Netflix' });
  }
  // August (last full month): delivery spikes to ₹6,000.
  await add('2026-08-01', '100000', TransactionType.INCOME, 'SALARY');
  await add('2026-08-03', '-30000', TransactionType.EXPENSE, 'RENT', { categoryId: rent.id });
  await add('2026-08-10', '-6000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: delivery.id, merchantName: 'Swiggy' });
  await add('2026-08-06', '-649', TransactionType.EXPENSE, 'NETFLIX', { merchantName: 'Netflix' });
  await add('2026-08-27', '-590', TransactionType.FEE, 'LATE FEE');
  // September so far (as of the 10th): small purchases on weekends, one big purchase.
  const small = ['2026-09-05', '2026-09-06', '2026-09-06', '2026-09-05', '2026-09-06', '2026-09-05'];
  for (const [i, date] of small.entries()) {
    await add(date, '-250', TransactionType.EXPENSE, `CHAI ${i}`, { categoryId: delivery.id, merchantName: 'Chaayos' });
  }
  await add('2026-09-08', '-12000', TransactionType.EXPENSE, 'CROMA HEADPHONES');
  return { ...ctx, delivery };
}

describe('HighlightsService', () => {
  it('produces deterministic, evidence-backed highlights', async () => {
    const { core, delivery } = await fixture();
    const { highlights, month } = await core.highlights.highlights(USER_A, { currency: 'INR', asOf: '2026-09-10' });
    expect(month).toBe('2026-09');

    // Spent 1,500 + 12,000 in 10 of 30 days → projected 40,500; August spent 37,239.
    expect(find(highlights, 'spending_pace')).toMatchObject({ spentSoFar: '13500.00', projected: '40500.00', lastMonth: '37239.00', difference: '3261.00', dayOfMonth: 10, daysInMonth: 30 });

    // August delivery 6,000 vs average 3,000 → +100%.
    expect(find(highlights, 'category_spike')).toMatchObject({ category: 'Delivery', categoryId: delivery.id, month: '2026-08', amount: '6000.00', average: '3000.00', percentAbove: 100 });

    expect(find(highlights, 'top_merchant')).toMatchObject({ merchant: 'Chaayos', amount: '1500.00', count: 6, perVisit: '250.00' });
    expect(find(highlights, 'biggest_expense')).toMatchObject({ description: 'CROMA HEADPHONES', amount: '12000.00', date: '2026-09-08' });
    expect(find(highlights, 'small_purchases')).toMatchObject({ count: 6, total: '1500.00', threshold: '500.00' });
    // Spending on 5th, 6th and 8th → 7 of 10 days without spending.
    expect(find(highlights, 'no_spend_days')).toMatchObject({ days: 7, daysSoFar: 10 });
    // Rent (₹30,000), regular Swiggy (₹3,000 median) and Netflix (₹649) are monthly commitments.
    expect(find(highlights, 'subscriptions')).toMatchObject({ monthly: '33649.00', yearly: '403788.00', count: 3 });
    expect(find(highlights, 'fees_paid')).toMatchObject({ total: '590.00', count: 1, year: '2026' });
    // Aug savings rate: (100,000 − 37,239) / 100,000 = 62.8%; July (100,000 − 33,649) → 66.4%.
    expect(find(highlights, 'savings_rate')).toMatchObject({ month: '2026-08', rate: 62.8, previousRate: 66.4 });
    const runway = find(highlights, 'cash_runway')!;
    expect(runway.months).toBeGreaterThan(10);
    // Rent and the big purchase fall on weekdays, so weekend days are far cheaper here.
    expect(find(highlights, 'weekend_spending')).toMatchObject({ tone: 'positive' });
    expect(find(highlights, 'weekend_spending')!.ratio).toBeLessThan(0.77);
  });

  it('skips highlights without enough data and never mixes users', async () => {
    const { core } = setup();
    const empty = await core.highlights.highlights(USER_B, { currency: 'INR', asOf: '2026-09-10' });
    expect(empty.highlights).toEqual([]);
    await core.accounts.create(USER_B, { name: 'Wallet', type: AccountType.CASH, currency: 'INR', openingBalance: '100' });
    const stillEmpty = await core.highlights.highlights(USER_B, { currency: 'INR', asOf: '2026-09-10' });
    expect(stillEmpty.highlights.map((h) => h.kind)).toEqual([]);
  });
});
