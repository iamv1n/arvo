import { AccountType, CategoryType, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import type { TransactionRecord } from '../records';
import { monthRange, shiftMonth } from './insights.service';
import { detectRecurring, groupKey } from './recurring';

const tx = (overrides: Partial<TransactionRecord>): TransactionRecord => ({
  id: overrides.id ?? `${overrides.date}-${overrides.description}`,
  userId: USER_A,
  accountId: 'acc',
  date: '2026-01-01',
  description: 'X',
  merchantId: null,
  categoryId: null,
  amount: '-100',
  currency: 'INR',
  type: TransactionType.EXPENSE,
  status: 'CLEARED' as never,
  source: 'MANUAL' as never,
  sourceReference: null,
  notes: null,
  metadata: {},
  fingerprint: 'f',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

describe('detectRecurring', () => {
  const netflix = (date: string, amount = '-649') => tx({ date, amount, merchantId: 'netflix', description: 'NETFLIX.COM', categoryId: 'streaming' });

  it('detects a monthly subscription, its next date, monthly cost and a price increase', () => {
    const series = detectRecurring(
      [netflix('2026-04-05'), netflix('2026-05-05'), netflix('2026-06-06'), netflix('2026-07-05'), netflix('2026-08-05', '-799')],
      { asOf: '2026-08-20', merchantNames: new Map([['netflix', 'Netflix']]) },
    );
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      label: 'Netflix',
      frequency: 'MONTHLY',
      expectedAmount: '649.00',
      monthlyCost: '649.00',
      lastAmount: '799.00',
      previousAmount: '649.00',
      lastSeen: '2026-08-05',
      nextExpected: '2026-09-05',
      occurrences: 5,
      priceIncreased: true,
      status: 'ACTIVE',
      categoryId: 'streaming',
    });
    // regular 1.0, similar 4/5 (799 is 23% above 649), depth 5/6
    expect(series[0].confidence).toBe(0.9);
  });

  it('groups descriptions with changing reference numbers and normalizes weekly and yearly costs', () => {
    const weekly = ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29'].map((date, i) =>
      tx({ date, description: `CULT FIT SESSION REF${1000 + i}`, amount: '-300' }),
    );
    const yearly = ['2024-03-10', '2025-03-10', '2026-03-10'].map((date) => tx({ date, description: 'AMAZON PRIME ANNUAL', amount: '-1499' }));
    const series = detectRecurring([...weekly, ...yearly], { asOf: '2026-08-01' });
    expect(series.map((s) => [s.label, s.frequency, s.monthlyCost, s.nextExpected])).toEqual([
      ['Amazon Prime Annual', 'YEARLY', '124.92', '2027-03-10'],
      ['Cult Fit Session Ref', 'WEEKLY', '1300.00', '2026-08-05'],
    ]);
    expect(groupKey(weekly[0])).toBe(groupKey(weekly[3]));
  });

  it('ignores variable spending with a regular rhythm, and flags price increases only on stable prices', () => {
    const fuel = ['2026-04-11', '2026-05-11', '2026-06-11', '2026-07-11', '2026-08-11'].map((date, i) =>
      tx({ date, description: 'INDIAN OIL FUEL', amount: ['-1500', '-2800', '-1900', '-2600', '-1650'][i] }),
    );
    const cabs = ['2026-07-04', '2026-07-12', '2026-07-19', '2026-07-27', '2026-08-03'].map((date, i) =>
      tx({ date, description: 'UBER TRIP', amount: ['-160', '-720', '-310', '-540', '-205'][i] }),
    );
    const noisyRent = ['2026-05-02', '2026-06-02', '2026-07-02', '2026-08-02'].map((date, i) =>
      tx({ date, description: 'RENT', amount: ['-30000', '-33000', '-29000', '-33500'][i] }),
    );
    const series = detectRecurring([...fuel, ...cabs, ...noisyRent], { asOf: '2026-08-15' });
    expect(series.map((s) => [s.label, s.priceIncreased])).toEqual([['Rent', false]]);
  });

  it('marks series that stopped and ignores irregular, income and too-short histories', () => {
    const stopped = ['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10'].map((date) => tx({ date, description: 'GYM MEMBERSHIP', amount: '-2000' }));
    const irregular = ['2026-01-02', '2026-01-09', '2026-03-20', '2026-03-22', '2026-06-30'].map((date) => tx({ date, description: 'ZOMATO', amount: '-400' }));
    const income = ['2026-05-01', '2026-06-01', '2026-07-01'].map((date) => tx({ date, description: 'SALARY', amount: '120000', type: TransactionType.INCOME }));
    const short = ['2026-06-01', '2026-07-01'].map((date) => tx({ date, description: 'NEW APP', amount: '-99' }));
    const series = detectRecurring([...stopped, ...irregular, ...income, ...short], { asOf: '2026-08-15' });
    expect(series.map((s) => [s.label, s.status])).toEqual([['Gym Membership', 'STOPPED']]);
  });

  it('is deterministic regardless of input order', () => {
    const items = ['2026-04-05', '2026-05-05', '2026-06-05'].map((date) => netflix(date));
    expect(detectRecurring([...items].reverse(), { asOf: '2026-06-10' })).toEqual(detectRecurring(items, { asOf: '2026-06-10' }));
  });
});

describe('InsightsService', () => {
  async function fixture() {
    const ctx = setup();
    const { core, store } = ctx;
    const food = store.addSystemCategory('Food');
    const delivery = store.addSystemCategory('Delivery', CategoryType.EXPENSE, food.id);
    const shopping = store.addSystemCategory('Shopping');
    const bank = await ctx.bank(USER_A, '100000');
    const broker = await core.accounts.create(USER_A, { name: 'Zerodha', type: AccountType.BROKER, currency: 'INR' });
    const add = (date: string, amount: string, type: TransactionType, extra: Record<string, unknown> = {}) =>
      core.transactions.create(USER_A, { accountId: bank.id, date, description: String(extra.description ?? type), amount, type, ...extra });

    await add('2026-07-01', '100000', TransactionType.INCOME);
    await add('2026-07-10', '-2000', TransactionType.EXPENSE, { categoryId: delivery.id, merchantName: 'Swiggy' });
    await add('2026-07-15', '-5000', TransactionType.EXPENSE, { categoryId: shopping.id, merchantName: 'Amazon' });
    await add('2026-08-01', '100000', TransactionType.INCOME);
    await add('2026-08-10', '-3500', TransactionType.EXPENSE, { categoryId: delivery.id, merchantName: 'Swiggy' });
    await add('2026-08-12', '-1500', TransactionType.EXPENSE, { categoryId: delivery.id, merchantName: 'Zomato' });
    await add('2026-08-20', '-12000', TransactionType.EXPENSE, { categoryId: shopping.id, merchantName: 'Croma', description: 'CROMA TV' });
    await add('2026-08-21', '1000', TransactionType.REFUND, { categoryId: shopping.id, merchantName: 'Amazon' });
    await core.transfers.create(USER_A, { fromAccountId: bank.id, toAccountId: broker.id, amount: '15000', date: '2026-08-05', description: 'SIP' });
    for (const month of ['2026-05', '2026-06', '2026-07', '2026-08']) {
      await add(`${month}-06`, '-649', TransactionType.EXPENSE, { merchantName: 'Netflix', description: 'NETFLIX.COM' });
    }
    return { ...ctx, food, delivery, shopping, bank, broker };
  }

  it('compares months with category deltas and the largest expenses behind the change', async () => {
    const { core, food, shopping } = await fixture();
    const comparison = await core.insights.compareMonths(USER_A, '2026-08', 'INR');
    expect(comparison.current).toMatchObject({ income: '100000.00', expenses: '16649.00' });
    expect(comparison.previous).toMatchObject({ income: '100000.00', expenses: '7649.00' });
    expect(comparison.change).toMatchObject({ expenses: '9000.00', expensesPercent: 117.7 });
    expect(comparison.categoryChanges.map((c) => [c.categoryId, c.current, c.previous, c.change, c.changePercent])).toEqual([
      [shopping.id, '11000.00', '5000.00', '6000.00', 120],
      [food.id, '5000.00', '2000.00', '3000.00', 150],
      [null, '649.00', '649.00', '0.00', 0],
    ]);
    expect(comparison.largestExpenses.map((t) => t.amount)).toEqual(['-12000.00', '-3500.00', '-1500.00', '-649.00']);
  });

  it('ranks spending by merchant net of refunds', async () => {
    const { core } = await fixture();
    const merchants = await core.insights.spendingByMerchant(USER_A, { ...monthRange('2026-08'), currency: 'INR' });
    expect(merchants.map((m) => [m.name, m.amount, m.transactionCount])).toEqual([
      ['Croma', '12000.00', 1],
      ['Swiggy', '3500.00', 1],
      ['Zomato', '1500.00', 1],
      ['Netflix', '649.00', 1],
      ['Amazon', '-1000.00', 1],
    ]);
  });

  it('persists recurring series, keeps dismissals across re-detection, and totals active costs', async () => {
    const { core } = await fixture();
    const first = await core.insights.recurring(USER_A, { currency: 'INR', asOf: '2026-08-20' });
    expect(first.series.map((s) => [s.label, s.frequency, s.monthlyCost])).toEqual([['Netflix', 'MONTHLY', '649.00']]);
    expect(first).toMatchObject({ monthlyTotal: '649.00', annualTotal: '7788.00' });

    await core.insights.setRecurringDismissed(USER_A, first.series[0].id, true);
    const again = await core.insights.recurring(USER_A, { currency: 'INR', asOf: '2026-08-20' });
    expect(again.series[0]).toMatchObject({ id: first.series[0].id, isDismissed: true });
    expect(again.monthlyTotal).toBe('0.00');

    await expectDomainError(core.insights.setRecurringDismissed(USER_B, first.series[0].id, false), 'RECURRING_NOT_FOUND');
    expect((await core.insights.recurring(USER_B, { currency: 'INR', asOf: '2026-08-20' })).series).toEqual([]);
  });

  it('builds a monthly financial snapshot with investments separated from spending', async () => {
    const { core } = await fixture();
    const snapshot = await core.insights.snapshot(USER_A, { month: '2026-08', currency: 'INR', asOf: '2026-08-31' });
    expect(snapshot).toMatchObject({
      period: '2026-08',
      income: '100000.00',
      expenses: '16649.00',
      investments: '15000.00',
      netCashflow: '83351.00',
      savingsRate: 83.4,
      recurringExpenses: '649.00',
      topCategories: [
        { name: 'Shopping', amount: '11000.00' },
        { name: 'Food', amount: '5000.00' },
        { name: 'Uncategorized', amount: '649.00' },
      ],
    });
    // bank 100000 + 200000 − 7000 − 16000 + ... see ledger; assets include the broker account.
    expect(snapshot.netWorth).toBe(snapshot.accountBalance);
    await expectDomainError(core.insights.snapshot(USER_A, { month: '2026-13', currency: 'INR', asOf: '2026-08-31' }), 'INVALID_INPUT');
  });

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
});
