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
  return { core, bank, call, ctx, food };
}

describe('finance tools', () => {
  it('report budget pacing and goal progress for the caller only', async () => {
    const { core, call, food } = await fixture();
    await core.budgets.create(USER_A, { categoryId: food.id, amount: '5000', currency: 'INR' });
    await core.goals.create(USER_A, { name: 'Trip', targetAmount: '12000', currency: 'INR', targetDate: '2026-12-31', savedAmount: '2000' });

    // 3,500 spent in 20 of 31 days → 5,425 projected.
    const budgets = await call('finance_get_budget_status', {});
    expect(budgets).toMatchObject({ month: '2026-08', provenance: { as_of: '2026-08-20', budgets: 1 } });
    expect(budgets.budgets[0]).toMatchObject({ categoryName: 'Food', spent: '3500.00', projected: '5425.00', projectedOverspend: '425.00', status: 'at_risk' });
    expect(budgets.budgets[0].userId).toBeUndefined();
    expect((await call('finance_get_budget_status', { month: '2026-07' })).budgets[0]).toMatchObject({ spent: '2000.00', status: 'on_track' });

    const goals = await call('finance_get_goals', {});
    expect(goals.goals[0]).toMatchObject({ name: 'Trip', remaining: '10000.00', monthsLeft: 5, requiredMonthly: '2000.00' });
    expect((await call('finance_get_goals', {}, USER_B)).goals).toEqual([]);
  });

  it('compute savings opportunities, affordability and what-if without saving anything', async () => {
    const { call, food } = await fixture();
    const savings = await call('finance_get_savings_opportunities', {});
    expect(savings).toMatchObject({ month: '2026-07', provenance: { as_of: '2026-08-20', compared_month: '2026-07' } });
    expect(Array.isArray(savings.opportunities)).toBe(true);

    // Liquid 10,000 + 2 × 1,00,000 − 2,000 − 3,500 − 4 × 649 = 2,01,904.
    const afford = await call('finance_check_affordability', { amount: '250000', buffer_months: 2 });
    expect(afford).toMatchObject({ status: 'not_yet', cashAfter: '-48096.00', bufferMonths: 2, provenance: { averages_over: ['2026-05', '2026-06', '2026-07'] } });
    expect(afford.series).toHaveLength(13);
    expect((await call('finance_check_affordability', { amount: '1000' })).status).toBe('affordable');

    const whatIf = await call('finance_run_what_if', {
      adjustments: [
        { type: 'one_off', month: '2026-10', amount: '10000' },
        { type: 'category', category_id: food.id, mode: 'amount', value: '-500', from_month: '2027-08' },
      ],
    });
    expect(whatIf).toMatchObject({ yearlyImpact: '-9500.00', monthlyChange: '500.00' });
    const bad = await runTool(findTool('finance_run_what_if')!, { core: (await fixture()).core, userId: USER_A, currency: 'INR', today: '2026-08-20' }, { adjustments: [{ type: 'income', mode: 'x', value: '1' }] });
    expect(bad.ok).toBe(false);
    expect(await call('finance_run_what_if', { adjustments: [] }, USER_B)).toMatchObject({ yearlyImpact: '0.00', baseline: { liquid: '0.00' } });
    expect(FINANCE_TOOLS).toHaveLength(25);
  });

  it('report the portfolio, its allocation, its returns and its capital gains for the caller only', async () => {
    const { core, call } = await fixture();
    const fund = await core.holdings.create(USER_A, {
      name: 'Flexi Cap Direct',
      kind: 'MUTUAL_FUND',
      currency: 'INR',
      amc: 'PPFAS',
      marketCap: 'LARGE',
      expenseRatio: '0.63',
      latestPrice: '100',
      latestPriceDate: '2026-08-20',
    });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2024-08-20', type: 'BUY', units: '1000', price: '50' });

    const summary = await call('finance_get_portfolio_summary', {});
    expect(summary).toMatchObject({ totalInvested: '50000.00', currentValue: '100000.00', totalGain: '50000.00', holdingCount: 1 });
    expect(summary.disclaimer).toContain('not advice');
    expect(summary.provenance).toMatchObject({ as_of: '2026-08-20', holdings: 1 });

    const allocation = await call('finance_get_portfolio_allocation', {});
    expect(allocation.assetClass).toEqual([expect.objectContaining({ key: 'EQUITY', percent: 100 })]);
    expect(allocation.costDrag.annualCost).toBe('630.00');

    const returns = await call('finance_get_portfolio_returns', {});
    expect(returns.xirrPercent).toBeCloseTo(41.42, 1);
    expect(returns.benchmark).toBeNull();
    expect(returns.provenance.method).toContain('XIRR');

    const gains = await call('finance_get_capital_gains', {});
    expect(gains).toMatchObject({ financialYear: '2026-27', harvestHeadroom: '125000.00' });
    expect(gains.unrealised.longTerm).toBe('50000.00');
    expect(gains.provenance.method).toBe('FIFO lots');

    expect(await call('finance_get_portfolio_summary', {}, USER_B)).toMatchObject({ holdingCount: 0, currentValue: '0.00' });
  });

  it('report trading metrics and the tax worksheet for the caller only', async () => {
    const { core, call } = await fixture();
    const fill = (date: string, time: string, side: 'BUY' | 'SELL', price: string, userId = USER_A) =>
      core.trading.createTrade(userId, { date, time, symbol: 'INFY', segment: 'EQUITY_INTRADAY', side, quantity: '100', price });
    await fill('2026-06-02', '09:30', 'BUY', '1500');
    await fill('2026-06-02', '14:30', 'SELL', '1520');
    await fill('2026-06-03', '09:30', 'BUY', '1520');
    await fill('2026-06-03', '14:30', 'SELL', '1500');
    // Someone else's trades must not show up in either tool.
    await fill('2026-06-02', '09:30', 'BUY', '1000', USER_B);

    const metrics = await call('finance_get_trading_metrics', {});
    expect(metrics).toMatchObject({ closedTrades: 2, wins: 1, losses: 1, winRate: 50 });
    expect(metrics.bySegment[0].key).toBe('EQUITY_INTRADAY');
    expect(metrics.holdingTime.find((row: { style: string }) => row.style === 'INTRADAY').trades).toBe(2);
    expect(metrics.disclaimer).toContain('not investment advice');
    expect(metrics.provenance).toMatchObject({ as_of: '2026-08-20', closed_trades: 2 });

    const filtered = await call('finance_get_trading_metrics', { segment: 'INDEX_OPTIONS' });
    expect(filtered.closedTrades).toBe(0);

    const tax = await call('finance_get_trading_tax_summary', {});
    expect(tax).toMatchObject({ financialYear: '2026-27', from: '2026-04-01', to: '2027-03-31' });
    expect(tax.speculative.trades).toBe(2);
    expect(tax.nonSpeculative.trades).toBe(0);
    expect(Number(tax.speculative.turnover)).toBeGreaterThan(0);
    expect(tax.audit.aboveThreshold).toBe(false);
    expect(tax.disclaimer).toContain('not tax advice');
    expect(tax.availableYears).toEqual(['2026-27']);

    expect((await call('finance_get_trading_metrics', {}, USER_B)).closedTrades).toBe(0);
  });

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
