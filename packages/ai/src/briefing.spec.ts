import { assembleBriefing, briefingNarrative, formatAmount, weekStartOf } from './briefing';
import { FakeProvider } from './providers/fake';
import { fixture, USER_A, USER_B } from './__tests__/fixture';

describe('weekly briefing', () => {
  it('assembles a deterministic structure from Finance Core as of a fixed date', async () => {
    const { core, food } = await fixture();
    await core.budgets.create(USER_A, { categoryId: food.id, amount: '5000', currency: 'INR' });
    await core.goals.create(USER_A, { name: 'Trip', targetAmount: '120000', currency: 'INR', targetDate: '2026-12-31', savedAmount: '0' });

    const asOf = '2026-08-20';
    const briefing = await assembleBriefing(core, USER_A, { currency: 'INR', asOf, upload: { overdue: false, daysSinceLastImport: 3 } });
    expect(briefing).toMatchObject({ version: 1, weekStart: '2026-08-17', weekEnd: '2026-08-23', asOf, currency: 'INR' });
    // 4,500 in 20 of 31 days → 6,975 projected, 1,975 over.
    expect(briefing.budgets).toMatchObject({ month: '2026-08', count: 1, total: { limit: '5000.00', spent: '4500.00', projected: '6975.00' } });
    expect(briefing.budgets.attention[0]).toMatchObject({ categoryName: 'Food', projectedOverspend: '1975.00', status: 'at_risk' });
    expect(briefing.decision).toEqual({ kind: 'budget_over', text: 'Food is pacing ₹1,975 over its ₹5,000 budget. Cut back for the rest of the month or raise the limit.' });
    expect(briefing.goals[0]).toMatchObject({ name: 'Trip', remaining: '120000.00' });
    expect(briefing.savings.top.length).toBeLessThanOrEqual(3);
    expect(briefing.upcoming.every((u) => u.date >= asOf && u.date <= '2026-08-27')).toBe(true);
    expect(briefing.provenance).toMatchObject({ as_of: asOf, budgets: 1, goals: 1 });

    // Same inputs, same briefing.
    expect(await assembleBriefing(core, USER_A, { currency: 'INR', asOf, upload: { overdue: false, daysSinceLastImport: 3 } })).toEqual(briefing);
  });

  it('falls back to an upload decision for an empty ledger and narrates with a provider', async () => {
    const { core } = await fixture();
    const briefing = await assembleBriefing(core, USER_B, { currency: 'INR', asOf: '2026-08-20', upload: { overdue: true, daysSinceLastImport: null } });
    expect(briefing.decision.kind).toBe('upload');
    expect(briefing.budgets.total).toBeNull();
    const provider = new FakeProvider();
    expect(await briefingNarrative(provider, briefing)).toMatch(/week in brief/);
    expect(provider.requests[0]!.tools).toBeUndefined();
  });

  it('formats amounts Indian style and finds Mondays', () => {
    expect(formatAmount('125000.00', 'INR')).toBe('₹1,25,000');
    expect(formatAmount('1234567.5', 'INR')).toBe('₹12,34,567.50');
    expect(formatAmount('-649.00', 'INR')).toBe('−₹649');
    expect(formatAmount('1250000', 'USD')).toBe('USD 1,250,000');
    expect(weekStartOf('2026-08-17')).toBe('2026-08-17');
    expect(weekStartOf('2026-08-23')).toBe('2026-08-17');
  });
});
