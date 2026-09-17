import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import { goalMonthsLeft } from './goal.service';

// The in-memory store stamps every record with createdAt 2026-01-01.
describe('GoalService', () => {
  it('computes progress, required contribution and status from a fixed asOf', async () => {
    const { core, bank } = setup();
    const savings = await bank(USER_A, '80000');
    await core.goals.create(USER_A, { name: 'Emergency fund', targetAmount: '120000', currency: 'INR', targetDate: '2026-12-31', savedAmount: '50000' });
    await core.goals.create(USER_A, { name: 'Trip', targetAmount: '100000', currency: 'INR', targetDate: '2026-12-31', accountId: savings.id });
    await core.goals.create(USER_A, { name: 'Laptop', targetAmount: '60000', currency: 'INR', targetDate: '2026-06-30', savedAmount: '60000' });

    const { goals } = await core.goals.status(USER_A, { asOf: '2026-07-01' });
    expect(goals.map((g) => g.name)).toEqual(['Laptop', 'Emergency fund', 'Trip']);
    const [laptop, emergency, trip] = goals;
    // 181 of 364 days elapsed → expected 59,670.33; saved 50,000 → behind.
    expect(emergency).toMatchObject({
      current: '50000.00', remaining: '70000.00', percent: 41.7, expected: '59670.33', expectedPercent: 49.7,
      monthsLeft: 6, requiredMonthly: '11666.67', status: 'behind', accountName: null,
    });
    // Linked account balance counts as progress: 80,000 of 100,000 vs 49,725.27 expected.
    expect(trip).toMatchObject({ current: '80000.00', remaining: '20000.00', percent: 80, requiredMonthly: '3333.33', status: 'on_track', accountName: 'HDFC Savings' });
    expect(laptop).toMatchObject({ remaining: '0.00', percent: 100, monthsLeft: 0, requiredMonthly: '0.00', status: 'achieved' });
  });

  it('counts months left including a partial month', () => {
    expect(goalMonthsLeft('2026-09-17', '2027-03-31')).toBe(7);
    expect(goalMonthsLeft('2026-09-17', '2027-03-17')).toBe(6);
    expect(goalMonthsLeft('2026-09-17', '2026-09-20')).toBe(1);
    expect(goalMonthsLeft('2026-09-17', '2026-09-16')).toBe(0);
  });

  it('validates input and scopes goals by user', async () => {
    const { core, bank } = setup();
    const other = await bank(USER_B);
    const base = { name: 'Car', targetAmount: '500000', currency: 'INR', targetDate: '2027-12-31' };
    await expectDomainError(core.goals.create(USER_A, { ...base, targetAmount: '-5' }), 'INVALID_AMOUNT');
    await expectDomainError(core.goals.create(USER_A, { ...base, targetDate: '2027-02-30' }), 'INVALID_DATE');
    await expectDomainError(core.goals.create(USER_A, { ...base, name: ' ' }), 'INVALID_INPUT');
    await expectDomainError(core.goals.create(USER_A, { ...base, accountId: other.id }), 'ACCOUNT_NOT_FOUND');
    const usd = await core.accounts.create(USER_A, { name: 'USD', type: other.type, currency: 'USD' });
    await expectDomainError(core.goals.create(USER_A, { ...base, accountId: usd.id }), 'CURRENCY_MISMATCH');

    const goal = await core.goals.create(USER_A, base);
    expect(await core.goals.update(USER_A, goal.id, { savedAmount: '1000.5', name: 'New car' })).toMatchObject({ savedAmount: '1000.50', name: 'New car' });
    await expectDomainError(core.goals.update(USER_B, goal.id, { name: 'x' }), 'GOAL_NOT_FOUND');
    expect((await core.goals.status(USER_B, { asOf: '2026-07-01' })).goals).toEqual([]);
    await core.goals.delete(USER_A, goal.id);
    expect((await core.goals.status(USER_A, { asOf: '2026-07-01' })).goals).toEqual([]);
  });
});
