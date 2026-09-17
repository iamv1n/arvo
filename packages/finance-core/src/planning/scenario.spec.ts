import { AccountType, CategoryType, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import { normalizeAdjustments } from './projection';

const asOf = '2026-09-17';
const INR = { currency: 'INR', asOf };

async function fixture() {
  const ctx = setup();
  const { core, store } = ctx;
  const rent = store.addSystemCategory('Rent', CategoryType.EXPENSE);
  const food = store.addSystemCategory('Food', CategoryType.EXPENSE);
  const delivery = store.addSystemCategory('Delivery', CategoryType.EXPENSE, food.id);
  const bank = await ctx.bank(USER_A, '200000');
  await core.accounts.create(USER_A, { name: 'Wallet', type: AccountType.CASH, currency: 'INR', openingBalance: '0' });
  await core.accounts.create(USER_A, { name: 'Broker', type: AccountType.BROKER, currency: 'INR', openingBalance: '999999' });
  const add = (date: string, amount: string, type: TransactionType, categoryId?: string) =>
    core.transactions.create(USER_A, { accountId: bank.id, date, amount, type, description: 'TXN', categoryId });
  // June–August: income 1,00,000, rent 30,000, delivery 10,000 → expenses 40,000.
  for (const m of ['2026-06', '2026-07', '2026-08']) {
    await add(`${m}-01`, '100000', TransactionType.INCOME);
    await add(`${m}-03`, '-30000', TransactionType.EXPENSE, rent.id);
    await add(`${m}-15`, '-10000', TransactionType.EXPENSE, delivery.id);
  }
  // Goal needing 1,20,000 over 6 months → 20,000 a month. Surplus = 1,00,000 − 40,000 − 20,000 = 40,000.
  await core.goals.create(USER_A, { name: 'Emergency', targetAmount: '120000', currency: 'INR', targetDate: '2027-03-17' });
  return { ...ctx, rent, food, delivery };
}

describe('ScenarioService', () => {
  it('builds the baseline from liquid cash, 3 full months and goals', async () => {
    const { core, food, delivery, rent } = await fixture();
    const baseline = await core.scenarios.baseline(USER_A, INR);
    expect(baseline).toMatchObject({
      liquid: '380000.00', monthlyIncome: '100000.00', monthlyExpenses: '40000.00', goalContributions: '20000.00',
      monthlySurplus: '40000.00', months: ['2026-06', '2026-07', '2026-08'],
    });
    expect(baseline.categories).toEqual([
      { categoryId: rent.id, name: 'Rent', monthly: '30000.00' },
      { categoryId: delivery.id, name: 'Delivery', monthly: '10000.00' },
      { categoryId: food.id, name: 'Food', monthly: '10000.00' },
    ]);
  });

  it('checks affordability against the buffer with and without the purchase', async () => {
    const { core } = await fixture();
    const tight = await core.scenarios.affordability(USER_A, { ...INR, amount: '300000' });
    expect(tight).toMatchObject({
      status: 'tight', date: asOf, bufferMonths: 3, bufferTarget: '120000.00', cashBefore: '380000.00', cashAfter: '80000.00',
      bufferMonthsAfter: 2, monthsToRecover: 1, affordableFrom: '2026-10',
    });
    expect(tight.series).toHaveLength(13);
    expect(tight.series[0]).toEqual({ month: '2026-09', without: '380000.00', with: '80000.00' });
    expect(tight.series[12]).toEqual({ month: '2027-09', without: '860000.00', with: '560000.00' });

    const notYet = await core.scenarios.affordability(USER_A, { ...INR, amount: '500000', bufferMonths: 6 });
    // Buffer 2,40,000; after −1,20,000 → 3,60,000 short → 9 months of 40,000.
    expect(notYet).toMatchObject({ status: 'not_yet', cashAfter: '-120000.00', bufferMonthsAfter: -3, monthsToRecover: 9, affordableFrom: '2027-06' });

    const later = await core.scenarios.affordability(USER_A, { ...INR, amount: '100000', date: '2026-12-05' });
    expect(later).toMatchObject({ status: 'affordable', cashBefore: '500000.00', cashAfter: '400000.00', monthsToRecover: 0, affordableFrom: '2026-12' });
    expect(later.series.slice(2, 4)).toEqual([
      { month: '2026-11', without: '460000.00', with: '460000.00' },
      { month: '2026-12', without: '500000.00', with: '400000.00' },
    ]);

    await expectDomainError(core.scenarios.affordability(USER_A, { ...INR, amount: '0' }), 'INVALID_AMOUNT');
    await expectDomainError(core.scenarios.affordability(USER_A, { ...INR, amount: '10', date: '2026-09-16' }), 'INVALID_DATE');
    await expectDomainError(core.scenarios.affordability(USER_A, { ...INR, amount: '10', date: '2027-10-01' }), 'INVALID_DATE');
    await expectDomainError(core.scenarios.affordability(USER_A, { ...INR, amount: '10', bufferMonths: 30 }), 'INVALID_INPUT');
    // No income or cash: never affordable.
    expect(await core.scenarios.affordability(USER_B, { ...INR, amount: '10' })).toMatchObject({ status: 'not_yet', monthsToRecover: null, affordableFrom: null });
  });

  it('projects what-if adjustments against the baseline', async () => {
    const { core, rent, delivery } = await fixture();
    const result = await core.scenarios.whatIf(USER_A, {
      ...INR,
      adjustments: [
        { type: 'category', categoryId: rent.id, mode: 'amount', value: '10000' },
        { type: 'category', categoryId: delivery.id, mode: 'percent', value: '-50' },
        { type: 'income', mode: 'percent', value: '-10', fromMonth: '2027-01' },
        { type: 'one_off', month: '2026-12', amount: '50000', label: 'Wedding' },
      ],
    });
    expect(result.adjustments.map((a) => [a.label, a.monthlyImpact])).toEqual([
      ['Rent', '-10000.00'], ['Delivery', '5000.00'], ['Income', '-10000.00'], ['Wedding', '-50000.00'],
    ]);
    expect(result).toMatchObject({ monthlyChange: '-15000.00', scenarioSurplus: '25000.00' });
    // Months 1–12: −5,000 each; income cut from month 4 (Jan) → 9 × −10,000; one-off −50,000.
    expect(result.endBalance).toEqual({ baseline: '860000.00', scenario: '660000.00' });
    expect(result.yearlyImpact).toBe('-200000.00');
    expect(result.series[3]).toEqual({ month: '2026-12', baseline: '500000.00', scenario: '435000.00' });
    expect(result.lowest).toEqual({ month: '2026-09', amount: '380000.00' });

    const empty = await core.scenarios.whatIf(USER_A, { ...INR, adjustments: [] });
    expect(empty.series.every((p) => p.baseline === p.scenario)).toBe(true);
  });

  it('validates adjustments', async () => {
    const { core } = await fixture();
    expect(() => normalizeAdjustments(asOf, [{ type: 'income', mode: 'amount', value: '-5000.5' }])).not.toThrow();
    expect(normalizeAdjustments(asOf, [{ type: 'income', mode: 'amount', value: '-5000.5' }])).toEqual([{ type: 'income', mode: 'amount', value: '-5000.50' }]);
    for (const bad of [
      { type: 'nope' },
      { type: 'income', mode: 'x', value: '1' },
      { type: 'income', mode: 'percent', value: '-150' },
      { type: 'one_off', month: '2026-08', amount: '10' },
      { type: 'one_off', month: '2026-10', amount: '-10' },
      { type: 'category', mode: 'amount', value: '1' },
    ]) {
      expect(() => normalizeAdjustments(asOf, [bad])).toThrow();
    }
    await expectDomainError(
      core.scenarios.whatIf(USER_A, { ...INR, adjustments: [{ type: 'category', categoryId: '00000000-0000-4000-8000-000000000999', mode: 'amount', value: '1' }] }),
      'CATEGORY_NOT_FOUND',
    );
  });

  it('saves, runs and compares scenarios per user', async () => {
    const { core, rent } = await fixture();
    const raise = await core.scenarios.create(USER_A, { ...INR, name: 'Rent hike', adjustments: [{ type: 'category', categoryId: rent.id, mode: 'amount', value: '10000' }] });
    const bonus = await core.scenarios.create(USER_A, { ...INR, name: ' Bonus ', description: 'Diwali', adjustments: [{ type: 'income', mode: 'amount', value: '20000' }] });
    expect(bonus).toMatchObject({ name: 'Bonus', description: 'Diwali' });
    await expectDomainError(core.scenarios.create(USER_A, { ...INR, name: 'x', adjustments: 'nope' }), 'INVALID_ADJUSTMENT');

    const run = await core.scenarios.run(USER_A, raise.id, INR);
    expect(run).toMatchObject({ yearlyImpact: '-120000.00', scenario: { name: 'Rent hike' } });

    const comparison = await core.scenarios.compare(USER_A, [raise.id, bonus.id], INR);
    expect(comparison.months).toHaveLength(13);
    expect(comparison.baselineSeries[12]).toBe('860000.00');
    expect(comparison.scenarios.map((s) => [s.name, s.yearlyImpact, s.endBalance])).toEqual([
      ['Rent hike', '-120000.00', '740000.00'],
      ['Bonus', '240000.00', '1100000.00'],
    ]);
    await expectDomainError(core.scenarios.compare(USER_A, [], INR), 'INVALID_INPUT');

    expect(await core.scenarios.update(USER_A, bonus.id, { ...INR, name: 'Big bonus', description: null })).toMatchObject({ name: 'Big bonus', description: null });
    await expectDomainError(core.scenarios.run(USER_B, raise.id, INR), 'SCENARIO_NOT_FOUND');
    await expectDomainError(core.scenarios.compare(USER_B, [raise.id], INR), 'SCENARIO_NOT_FOUND');
    await expectDomainError(core.scenarios.delete(USER_B, raise.id), 'SCENARIO_NOT_FOUND');
    expect(await core.scenarios.list(USER_B)).toEqual([]);
    await core.scenarios.delete(USER_A, raise.id);
    expect((await core.scenarios.list(USER_A)).map((s) => s.name)).toEqual(['Big bonus']);
  });
});
