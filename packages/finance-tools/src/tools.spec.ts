import { FinanceCore } from '@arvo/finance-core';
import { InMemoryStore } from '@arvo/finance-core/testing';
import { AccountType, CategoryType, TransactionType } from '@arvo/types';
import { z } from 'zod';
import { FINANCE_TOOLS, findTool, runTool, type ToolContext } from './tools';

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

async function fixture() {
  const store = new InMemoryStore();
  const core = new FinanceCore(store);
  const food = store.addSystemCategory('Food', CategoryType.EXPENSE);
  const bank = await core.accounts.create(USER_A, { name: 'HDFC', type: AccountType.BANK, currency: 'INR', openingBalance: '10000' });
  const add = (date: string, amount: string, type: TransactionType, description: string, extra: Record<string, unknown> = {}) =>
    core.transactions.create(USER_A, { accountId: bank.id, date, amount, type, description, ...extra });
  await add('2026-07-01', '100000', TransactionType.INCOME, 'SALARY');
  await add('2026-07-10', '-2000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: food.id, merchantName: 'Swiggy' });
  await add('2026-08-01', '100000', TransactionType.INCOME, 'SALARY');
  await add('2026-08-10', '-3500', TransactionType.EXPENSE, 'SWIGGY', { categoryId: food.id, merchantName: 'Swiggy' });
  for (const month of ['05', '06', '07', '08']) await add(`2026-${month}-05`, '-649', TransactionType.EXPENSE, 'NETFLIX', { merchantName: 'Netflix' });

  const ctx = (userId = USER_A): ToolContext => ({ core, userId, currency: 'INR', today: '2026-08-20' });
  const call = async (name: string, input: unknown, userId?: string) => {
    const result = await runTool(findTool(name)!, ctx(userId), input);
    if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    // Loosely typed on purpose: tests assert on the JSON shape tools return.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result.data as Record<string, any>;
  };
  return { core, bank, call, ctx };
}

describe('finance tools', () => {
  it('have unique, provider-safe names and JSON-schema-convertible inputs', () => {
    const names = FINANCE_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of FINANCE_TOOLS) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(tool.description.length).toBeGreaterThan(20);
      const schema = z.toJSONSchema(tool.inputSchema) as { type: string };
      expect(schema.type).toBe('object');
    }
  });

  it('summarize cashflow and spending with provenance, defaulting to the current month', async () => {
    const { call } = await fixture();
    const cashflow = await call('finance_get_cashflow', {});
    expect(cashflow).toMatchObject({
      period: { from: '2026-08-01', to: '2026-08-31' },
      income: '100000.00',
      expenses: '4149.00',
      net_cashflow: '95851.00',
      provenance: { transaction_count: 3 },
    });
    const spending = await call('finance_get_spending_summary', { from: '2026-08-01', to: '2026-08-31' });
    expect(spending.by_category).toEqual([
      { category: 'Food', amount: '3500.00', transactions: 1 },
      { category: 'Uncategorized', amount: '649.00', transactions: 1 },
    ]);
  });

  it('compares periods, defaulting to the preceding equal-length period', async () => {
    const { call } = await fixture();
    const result = await call('finance_compare_periods', { from: '2026-08-01', to: '2026-08-31' });
    expect(result.previous).toMatchObject({ from: '2026-07-01', to: '2026-07-31', expenses: '2649.00' });
    expect(result.change).toMatchObject({ expenses: '1500.00' });
    expect(result.largest_expenses[0]).toMatchObject({ description: 'SWIGGY', merchant: 'Swiggy', category: 'Food', amount: '-3500.00' });
    expect(result.largest_expenses[0]).not.toHaveProperty('userId');
  });

  it('lists transactions and recurring expenses without internal fields', async () => {
    const { call } = await fixture();
    const tx = await call('finance_get_transactions', { types: ['EXPENSE'], min_amount: '1000', limit: 10 });
    expect(tx.total).toBe(2);
    expect(Object.keys(tx.transactions[0]).sort()).toEqual(
      ['account', 'account_id', 'amount', 'category', 'currency', 'date', 'description', 'id', 'merchant', 'type'].sort(),
    );
    const recurring = await call('finance_get_recurring_expenses', {});
    expect(recurring.recurring.map((r: { name: string; monthly_cost: string }) => [r.name, r.monthly_cost])).toEqual([['Netflix', '649.00']]);
    const cashflow = await call('finance_analyze_cashflow', { months: 2 });
    expect(cashflow.averages).toMatchObject({ income: '100000.00' });
  });

  it('never exposes another user’s data, even with a guessed id', async () => {
    const { call, bank } = await fixture();
    expect((await call('finance_get_accounts', {}, USER_B)).accounts).toEqual([]);
    expect((await call('finance_get_cashflow', { from: '2026-08-01', to: '2026-08-31' }, USER_B)).income).toBe('0.00');
    const { ctx } = await fixture();
    const result = await runTool(findTool('finance_get_account_balance')!, ctx(USER_B), { account_id: bank.id });
    expect(result).toMatchObject({ ok: false, error: { code: 'ACCOUNT_NOT_FOUND' } });
  });

  it('reject invalid input with structured errors', async () => {
    const { ctx } = await fixture();
    const bad = await runTool(findTool('finance_get_transactions')!, ctx(), { limit: 1000, from: 'last month' });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_TOOL_INPUT' } });
    const paths = (bad as { error: { details: { path: string }[] } }).error.details.map((d) => d.path).sort();
    expect(paths).toEqual(['from', 'limit']);
    const domain = await runTool(findTool('finance_get_cashflow')!, ctx(), { from: '2026-09-01', to: '2026-08-01' });
    expect(domain).toMatchObject({ ok: false, error: { code: 'INVALID_DATE_RANGE' } });
  });
});
