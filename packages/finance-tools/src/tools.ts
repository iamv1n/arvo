import { DomainError, type FinanceCore, type TransactionRecord } from '@arvo/finance-core';
import { TransactionType } from '@arvo/types';
import { z } from 'zod';

/*
 * Business-level finance tools. Each tool validates its input, calls Finance Core with the
 * authenticated user's id (never taken from the input), and returns structured results with
 * provenance. Tools contain no financial calculations of their own.
 *
 * Names use underscores because several LLM tool-calling APIs reject dots in tool names.
 */

export interface ToolContext {
  core: FinanceCore;
  /** Resolved from the caller's credentials by the host (MCP server, AI service). */
  userId: string;
  /** The user's base currency. */
  currency: string;
  /** Today's date (YYYY-MM-DD) in the user's timezone; used for relative defaults. */
  today: string;
}

export interface FinanceTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  run(ctx: ToolContext, input: z.infer<S>): Promise<Record<string, unknown>>;
}

const defineTool = <S extends z.ZodObject>(tool: FinanceTool<S>): FinanceTool<S> => tool;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const amount = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/, 'Use a positive decimal like 1500 or 649.50');
const uuid = z.uuid();

// ---- helpers (date arithmetic only) ----

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function monthEnd(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${day.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function period(ctx: ToolContext, input: { from?: string; to?: string }): { from: string; to: string } {
  return { from: input.from ?? monthStart(ctx.today), to: input.to ?? monthEnd(ctx.today) };
}

/** The period of equal length immediately before [from, to]. */
function previousPeriod(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const length = Math.round((end - start) / day) + 1;
  const previousEnd = new Date(start - day);
  const previousStart = new Date(start - length * day);
  return { from: previousStart.toISOString().slice(0, 10), to: previousEnd.toISOString().slice(0, 10) };
}

/** Transaction shape shared with AI clients: no internal fields. */
function presentTransaction(t: TransactionRecord, names: { accounts: Map<string, string>; categories: Map<string, string>; merchants: Map<string, string> }) {
  return {
    id: t.id,
    date: t.date,
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    type: t.type,
    account: names.accounts.get(t.accountId) ?? null,
    account_id: t.accountId,
    category: t.categoryId ? (names.categories.get(t.categoryId) ?? null) : null,
    merchant: t.merchantId ? (names.merchants.get(t.merchantId) ?? null) : null,
  };
}

async function nameMaps(ctx: ToolContext) {
  const [accounts, categories, merchants] = await Promise.all([
    ctx.core.accounts.list(ctx.userId),
    ctx.core.categories.list(ctx.userId),
    ctx.core.merchants.list(ctx.userId),
  ]);
  return {
    accounts: new Map(accounts.map((a) => [a.id, a.name])),
    categories: new Map(categories.map((c) => [c.id, c.name])),
    merchants: new Map(merchants.map((m) => [m.id, m.name])),
  };
}

// ---- tools ----

export const getAccounts = defineTool({
  name: 'finance_get_accounts',
  title: 'Get accounts',
  description:
    "List the user's accounts (bank, credit card, cash, broker, mutual fund, loan) with current balances. Credit card and loan balances are negative when money is owed.",
  inputSchema: z.object({}),
  async run(ctx) {
    const accounts = await ctx.core.accounts.list(ctx.userId);
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        institution: a.institution,
        currency: a.currency,
        balance: a.balance,
        is_active: a.isActive,
      })),
      provenance: { account_count: accounts.length },
    };
  },
});

export const getAccountBalance = defineTool({
  name: 'finance_get_account_balance',
  title: 'Get account balance',
  description: 'Get the current balance of one account: opening balance plus all recorded transactions.',
  inputSchema: z.object({ account_id: uuid.describe('Account id from finance_get_accounts') }),
  async run(ctx, input) {
    const a = await ctx.core.accounts.get(ctx.userId, input.account_id);
    return { account: { id: a.id, name: a.name, type: a.type, currency: a.currency, opening_balance: a.openingBalance, balance: a.balance } };
  },
});

export const getTransactions = defineTool({
  name: 'finance_get_transactions',
  title: 'Get transactions',
  description:
    'List transactions, newest first, with optional filters. Amounts are signed: negative means money left the account.',
  inputSchema: z.object({
    from: date.optional().describe('Start date, inclusive'),
    to: date.optional().describe('End date, inclusive'),
    account_id: uuid.optional(),
    category_id: uuid.optional(),
    types: z.array(z.enum(TransactionType)).optional().describe('e.g. ["EXPENSE"]'),
    direction: z.enum(['IN', 'OUT']).optional().describe('IN = money received, OUT = money spent'),
    min_amount: amount.optional().describe('Minimum absolute amount'),
    max_amount: amount.optional().describe('Maximum absolute amount'),
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
  }),
  async run(ctx, input) {
    const [page, names] = await Promise.all([
      ctx.core.transactions.list(ctx.userId, {
        from: input.from,
        to: input.to,
        accountId: input.account_id,
        categoryId: input.category_id,
        types: input.types,
        direction: input.direction,
        minAmount: input.min_amount,
        maxAmount: input.max_amount,
        limit: input.limit,
        offset: input.offset,
      }),
      nameMaps(ctx),
    ]);
    return {
      transactions: page.items.map((t) => presentTransaction(t, names)),
      total: page.total,
      provenance: { returned: page.items.length, matching_transactions: page.total },
    };
  },
});

export const searchTransactions = defineTool({
  name: 'finance_search_transactions',
  title: 'Search transactions',
  description: 'Search transactions by text in the description or merchant name (case-insensitive), newest first.',
  inputSchema: z.object({
    query: z.string().min(1).max(200),
    from: date.optional(),
    to: date.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async run(ctx, input) {
    const [page, names] = await Promise.all([
      ctx.core.transactions.list(ctx.userId, { search: input.query, from: input.from, to: input.to, limit: input.limit, offset: 0 }),
      nameMaps(ctx),
    ]);
    return {
      transactions: page.items.map((t) => presentTransaction(t, names)),
      total: page.total,
      provenance: { query: input.query, matching_transactions: page.total },
    };
  },
});

export const getCashflow = defineTool({
  name: 'finance_get_cashflow',
  title: 'Get cash flow',
  description:
    'Income, expenses and net cash flow for a period (default: this month), plus a month-by-month breakdown. Transfers between own accounts are excluded.',
  inputSchema: z.object({ from: date.optional(), to: date.optional() }),
  async run(ctx, input) {
    const range = period(ctx, input);
    const [summary, monthly] = await Promise.all([
      ctx.core.analytics.summary(ctx.userId, { ...range, currency: ctx.currency }),
      ctx.core.analytics.monthly(ctx.userId, { ...range, currency: ctx.currency }),
    ]);
    return {
      period: range,
      currency: ctx.currency,
      income: summary.income,
      expenses: summary.expenses,
      net_cashflow: summary.netCashflow,
      savings_rate_percent: summary.savingsRate,
      months: monthly,
      unclassified: summary.unclassified,
      provenance: { transaction_count: summary.transactionCount, from: range.from, to: range.to },
    };
  },
});

export const getSpendingSummary = defineTool({
  name: 'finance_get_spending_summary',
  title: 'Get spending summary',
  description:
    'Total spending for a period (default: this month) broken down by top-level category and subcategory, net of refunds.',
  inputSchema: z.object({ from: date.optional(), to: date.optional(), account_id: uuid.optional() }),
  async run(ctx, input) {
    const range = period(ctx, input);
    const s = await ctx.core.analytics.summary(ctx.userId, { ...range, currency: ctx.currency, accountId: input.account_id });
    return {
      period: range,
      currency: ctx.currency,
      total_spent: s.expenses,
      by_category: s.spendingByTopCategory.map((c) => ({ category: c.name, amount: c.amount, transactions: c.transactionCount })),
      by_subcategory: s.spendingByCategory.slice(0, 20).map((c) => ({
        category: c.name,
        parent: c.parentName,
        amount: c.amount,
        transactions: c.transactionCount,
      })),
      provenance: { transaction_count: s.transactionCount, from: range.from, to: range.to },
    };
  },
});

export const getIncomeSummary = defineTool({
  name: 'finance_get_income_summary',
  title: 'Get income summary',
  description: 'Total income for a period (default: this month) with the income transactions that make it up.',
  inputSchema: z.object({ from: date.optional(), to: date.optional() }),
  async run(ctx, input) {
    const range = period(ctx, input);
    const [s, page, names] = await Promise.all([
      ctx.core.analytics.summary(ctx.userId, { ...range, currency: ctx.currency }),
      ctx.core.transactions.list(ctx.userId, { ...range, types: [TransactionType.INCOME, TransactionType.INTEREST], direction: 'IN', limit: 50, offset: 0 }),
      nameMaps(ctx),
    ]);
    return {
      period: range,
      currency: ctx.currency,
      total_income: s.income,
      income_transactions: page.items.map((t) => presentTransaction(t, names)),
      provenance: { income_transactions: page.total, from: range.from, to: range.to },
    };
  },
});

export const getNetWorth = defineTool({
  name: 'finance_get_net_worth',
  title: 'Get net worth',
  description: 'Net worth = assets minus liabilities, with each account and whether it counts as an asset or a liability.',
  inputSchema: z.object({}),
  async run(ctx) {
    const w = await ctx.core.analytics.netWorth(ctx.userId, ctx.currency);
    return {
      currency: w.currency,
      assets: w.assets,
      liabilities: w.liabilities,
      net_worth: w.netWorth,
      accounts: w.accounts.map((a) => ({ name: a.name, type: a.type, kind: a.kind, balance: a.balance })),
      provenance: { accounts_included: w.accounts.length, accounts_in_other_currencies: w.excludedAccountCount },
    };
  },
});

export const getRecurringExpenses = defineTool({
  name: 'finance_get_recurring_expenses',
  title: 'Get recurring expenses',
  description:
    'Detected subscriptions, EMIs and bills with frequency, monthly cost, next expected date and price increases.',
  inputSchema: z.object({ include_stopped: z.boolean().default(false) }),
  async run(ctx, input) {
    const overview = await ctx.core.insights.recurring(ctx.userId, { currency: ctx.currency, asOf: ctx.today });
    const series = overview.series.filter((s) => !s.isDismissed && (input.include_stopped || s.status === 'ACTIVE'));
    return {
      currency: overview.currency,
      monthly_total: overview.monthlyTotal,
      annual_total: overview.annualTotal,
      recurring: series.map((s) => ({
        name: s.label,
        frequency: s.frequency,
        amount: s.lastAmount,
        monthly_cost: s.monthlyCost,
        last_charged: s.lastSeen,
        next_expected: s.nextExpected,
        status: s.status,
        price_increased: s.priceIncreased,
        previous_amount: s.previousAmount,
        confidence: s.confidence,
      })),
      provenance: { detected_series: series.length, as_of: overview.asOf },
    };
  },
});

export const comparePeriods = defineTool({
  name: 'finance_compare_periods',
  title: 'Compare periods',
  description:
    'Compare income, expenses and category spending between two periods, with the largest expenses of the current period. If the previous period is omitted, the period of equal length just before is used.',
  inputSchema: z.object({
    from: date,
    to: date,
    previous_from: date.optional(),
    previous_to: date.optional(),
  }),
  async run(ctx, input) {
    const previous =
      input.previous_from && input.previous_to ? { from: input.previous_from, to: input.previous_to } : previousPeriod(input.from, input.to);
    const [c, names] = await Promise.all([
      ctx.core.insights.comparePeriods(ctx.userId, { current: { from: input.from, to: input.to }, previous, currency: ctx.currency }),
      nameMaps(ctx),
    ]);
    return {
      currency: c.currency,
      current: c.current,
      previous: c.previous,
      change: c.change,
      category_changes: c.categoryChanges.slice(0, 15),
      largest_expenses: c.largestExpenses.map((t) => presentTransaction(t, names)),
      provenance: {
        current_transactions: c.current.transactionCount,
        previous_transactions: c.previous.transactionCount,
      },
    };
  },
});

export const getFinancialSnapshot = defineTool({
  name: 'finance_get_financial_snapshot',
  title: 'Get financial snapshot',
  description:
    'One structured picture of a month (default: this month): income, expenses, investments, net cash flow, savings rate, balances, net worth, recurring costs and top categories.',
  inputSchema: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional() }),
  async run(ctx, input) {
    const snapshot = await ctx.core.insights.snapshot(ctx.userId, {
      month: input.month ?? ctx.today.slice(0, 7),
      currency: ctx.currency,
      asOf: ctx.today,
    });
    return { snapshot, provenance: { transaction_count: snapshot.transactionCount, month: snapshot.period } };
  },
});

export const analyzeSpending = defineTool({
  name: 'finance_analyze_spending',
  title: 'Analyze spending',
  description:
    'Explain spending for a period (default: this month): totals, what changed versus the previous equal-length period by category, top merchants and the largest expenses.',
  inputSchema: z.object({ from: date.optional(), to: date.optional() }),
  async run(ctx, input) {
    const range = period(ctx, input);
    const previous = previousPeriod(range.from, range.to);
    const [comparison, merchants, names] = await Promise.all([
      ctx.core.insights.comparePeriods(ctx.userId, { current: range, previous, currency: ctx.currency }),
      ctx.core.insights.spendingByMerchant(ctx.userId, { ...range, currency: ctx.currency }),
      nameMaps(ctx),
    ]);
    return {
      period: range,
      previous_period: previous,
      currency: ctx.currency,
      total_spent: comparison.current.expenses,
      previous_total_spent: comparison.previous.expenses,
      change: comparison.change.expenses,
      change_percent: comparison.change.expensesPercent,
      biggest_category_changes: comparison.categoryChanges.slice(0, 8),
      top_merchants: merchants.slice(0, 10),
      largest_expenses: comparison.largestExpenses.map((t) => presentTransaction(t, names)),
      provenance: { transaction_count: comparison.current.transactionCount, from: range.from, to: range.to },
    };
  },
});

export const analyzeCashflow = defineTool({
  name: 'finance_analyze_cashflow',
  title: 'Analyze cash flow',
  description:
    'Cash flow over the last N months (default 6, including the current month): monthly figures, totals, averages, best and worst months, and how many months were negative.',
  inputSchema: z.object({ months: z.number().int().min(1).max(36).default(6) }),
  async run(ctx, input) {
    const analysis = await ctx.core.insights.cashflowAnalysis(ctx.userId, { months: input.months, currency: ctx.currency, asOf: ctx.today });
    return { ...analysis, provenance: { months: analysis.months.length, from: analysis.from, to: analysis.to } };
  },
});

export const getHighlights = defineTool({
  name: 'finance_get_highlights',
  title: 'Get highlights',
  description:
    'Notable, pre-computed findings about the current month: spending pace and projection, category spikes versus the 3-month average, top merchant, biggest expense, small purchases, no-spend days, weekend spending, subscriptions, fees paid and cash runway. Good starting point for "how am I doing?" or "where can I cut back?".',
  inputSchema: z.object({}),
  async run(ctx) {
    const result = await ctx.core.highlights.highlights(ctx.userId, { currency: ctx.currency, asOf: ctx.today });
    return { ...result, provenance: { as_of: result.asOf, highlights: result.highlights.length } };
  },
});

export const getBudgetStatus = defineTool({
  name: 'finance_get_budget_status',
  title: 'Get budget status',
  description:
    'Category budgets with pacing for a month (default: current month): limit, spent (expenses and fees, including subcategories), remaining, percent used versus percent of month elapsed, projected month-end spend and overspend, and status on_track | at_risk | over. Read-only.',
  inputSchema: z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional().describe('Month to report, YYYY-MM'),
  }),
  async run(ctx, input) {
    const result = await ctx.core.budgets.status(ctx.userId, { asOf: ctx.today, month: input.month });
    return {
      ...result,
      budgets: result.budgets.map(({ userId: _u, ...b }) => b),
      provenance: { as_of: result.asOf, month: result.month, budgets: result.budgets.length },
    };
  },
});

export const getGoals = defineTool({
  name: 'finance_get_goals',
  title: 'Get goals',
  description:
    'Savings goals with progress (linked account balance or saved amount), remaining amount, months left, required monthly contribution and status on_track | behind | achieved based on linear progress since the goal was created. Read-only.',
  inputSchema: z.object({}),
  async run(ctx) {
    const result = await ctx.core.goals.status(ctx.userId, { asOf: ctx.today });
    return {
      ...result,
      goals: result.goals.map(({ userId: _u, ...g }) => g),
      provenance: { as_of: result.asOf, goals: result.goals.length },
    };
  },
});

export const getSavingsOpportunities = defineTool({
  name: 'finance_get_savings_opportunities',
  title: 'Get savings opportunities',
  description:
    'Ranked, deterministic ways to spend less: category and merchant spending above their 3-month average (last full month), subscription price increases, fees and interest, and informational one-off spikes. Each item has an exact estimated monthly saving, confidence, the figures behind it and evidence (transaction filter and ids). totalMonthly excludes informational and overlapping items. Use for "how can I spend less?". Read-only.',
  inputSchema: z.object({}),
  async run(ctx) {
    const result = await ctx.core.savings.opportunities(ctx.userId, { currency: ctx.currency, asOf: ctx.today });
    return { ...result, provenance: { as_of: result.asOf, compared_month: result.month, basis: 'last full month vs 3-month average', opportunities: result.opportunities.length } };
  },
});

export const checkAffordability = defineTool({
  name: 'finance_check_affordability',
  title: 'Check affordability (simulate purchase)',
  description:
    'Simulates a purchase: can the user pay this amount (today or on a date within 12 months) and keep a cash buffer of N months of expenses? Uses bank and cash balances, average income and expenses of the last 3 full months and active goal contributions. Returns status affordable | tight | not_yet, cash after purchase, buffer months left, months to recover, first affordable month and a 12-month balance projection with and without the purchase. Read-only; nothing is saved.',
  inputSchema: z.object({
    amount: amount.describe('Purchase amount, e.g. 70000'),
    date: date.optional().describe('Purchase date, YYYY-MM-DD (default today)'),
    buffer_months: z.number().min(0).max(24).optional().describe('Months of expenses to keep as a safety buffer (default 3)'),
  }),
  async run(ctx, input) {
    const result = await ctx.core.scenarios.affordability(ctx.userId, {
      currency: ctx.currency,
      asOf: ctx.today,
      amount: input.amount,
      date: input.date,
      bufferMonths: input.buffer_months,
    });
    return { ...result, provenance: { as_of: result.asOf, averages_over: result.baseline.months } };
  },
});

const signedValue = z.string().regex(/^[+-]?\d{1,15}(\.\d{1,4})?$/, 'Use a signed decimal like -5000 or 10.5');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const runWhatIf = defineTool({
  name: 'finance_run_what_if',
  title: 'Run what-if scenario',
  description:
    'Projects liquid cash 12 months ahead under adjustments versus the baseline (last 3 full months). Adjustments: category (monthly spend change by amount, positive = spend more, or by percent, e.g. -50 halves it), income (monthly change by amount or percent) — both optionally from a month — and one_off (an expense in a month). Returns monthly change, yearly impact, end balances, the lowest point and the series. Category ids are listed in baseline.categories of finance_check_affordability or in this tool result. Read-only; nothing is saved.',
  inputSchema: z.object({
    adjustments: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('category'), category_id: uuid, mode: z.enum(['amount', 'percent']), value: signedValue, from_month: month.optional() }),
          z.object({ type: z.literal('income'), mode: z.enum(['amount', 'percent']), value: signedValue, from_month: month.optional() }),
          z.object({ type: z.literal('one_off'), month, amount, label: z.string().max(80).optional() }),
        ]),
      )
      .max(20),
  }),
  async run(ctx, input) {
    const adjustments = input.adjustments.map((a) =>
      a.type === 'category'
        ? { type: a.type, categoryId: a.category_id, mode: a.mode, value: a.value, fromMonth: a.from_month }
        : a.type === 'income'
          ? { type: a.type, mode: a.mode, value: a.value, fromMonth: a.from_month }
          : a,
    );
    const result = await ctx.core.scenarios.whatIf(ctx.userId, { currency: ctx.currency, asOf: ctx.today, adjustments });
    return { ...result, provenance: { as_of: result.asOf, averages_over: result.baseline.months } };
  },
});

// ---- portfolio (advice level 0-2: analysis, education, simulation) ----

export const getPortfolioSummary = defineTool({
  name: 'finance_get_portfolio_summary',
  title: 'Get portfolio summary',
  description:
    'The investment portfolio on a date: total invested, money taken out, current value, absolute return and XIRR (money-weighted, actual/365), the split by asset class and the ten largest holdings with their own gain and XIRR. Values come from the latest price the user entered or imported, or from a stated value for things with no unit price (EPF, PPF, property). Use for "how are my investments doing?". Read-only; never a recommendation to buy or sell.',
  inputSchema: z.object({ as_of: date.optional().describe('Valuation date, YYYY-MM-DD (default today)') }),
  async run(ctx, input) {
    const result = await ctx.core.portfolio.summary(ctx.userId, { asOf: input.as_of ?? ctx.today, currency: ctx.currency });
    return { ...result, provenance: { as_of: result.asOf, holdings: result.holdingCount, holdings_without_a_price: result.stalePriceCount } };
  },
});

export const getPortfolioAllocation = defineTool({
  name: 'finance_get_portfolio_allocation',
  title: 'Get portfolio allocation',
  description:
    'How the portfolio is split: by asset class, by market cap and sector and AMC where the user recorded them, and per holding. Includes concentration (largest holding, largest five) with warnings, and the annual expense-ratio cost plus the extra a regular plan costs over its direct equivalent. Use for "am I too concentrated?" or "what am I paying in fees?". Read-only; information, not advice.',
  inputSchema: z.object({ as_of: date.optional().describe('Valuation date, YYYY-MM-DD (default today)') }),
  async run(ctx, input) {
    const result = await ctx.core.portfolio.allocation(ctx.userId, { asOf: input.as_of ?? ctx.today, currency: ctx.currency });
    return { ...result, provenance: { as_of: result.asOf, total_value: result.totalValue, holdings: result.holdings.length } };
  },
});

export const getPortfolioReturns = defineTool({
  name: 'finance_get_portfolio_returns',
  title: 'Get portfolio returns and benchmark comparison',
  description:
    'XIRR and absolute return overall, per asset class and per holding. When the user has imported an index series (for example Nifty 50 TRI), it also replays the same cashflows on the same dates into that index and reports what they would be worth, its XIRR, and the difference in percentage points. Use for "am I beating the index?". Read-only; a comparison, not advice.',
  inputSchema: z.object({
    as_of: date.optional().describe('Valuation date, YYYY-MM-DD (default today)'),
    benchmark: z.string().max(80).optional().describe('Index series name; defaults to the first one imported'),
  }),
  async run(ctx, input) {
    const result = await ctx.core.portfolio.returns(ctx.userId, { asOf: input.as_of ?? ctx.today, currency: ctx.currency, benchmark: input.benchmark });
    return {
      ...result,
      provenance: { as_of: result.asOf, method: 'XIRR, actual/365, Newton with bisection fallback', benchmark: result.benchmark?.series ?? null },
    };
  },
});

export const getCapitalGains = defineTool({
  name: 'finance_get_capital_gains',
  title: 'Get capital gains (realised and unrealised)',
  description:
    'Capital gains from FIFO lots for an Indian financial year (1 April to 31 March): realised short-term and long-term gains with the section 112A exemption applied, an estimated tax at the configured rates, unrealised gains on open lots, the exemption headroom left, tax-harvesting candidates and ELSS-style lock-ins still running. Use for "what will I owe?" or "how much room is left under the LTCG exemption?". Read-only; information, not tax advice.',
  inputSchema: z.object({
    as_of: date.optional().describe('Valuation date, YYYY-MM-DD (default today)'),
    financial_year: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-YY, e.g. 2026-27').optional(),
  }),
  async run(ctx, input) {
    const result = await ctx.core.portfolio.capitalGains(ctx.userId, {
      asOf: input.as_of ?? ctx.today,
      currency: ctx.currency,
      financialYear: input.financial_year,
    });
    return { ...result, provenance: { as_of: result.asOf, financial_year: result.financialYear, method: 'FIFO lots', rates: result.config } };
  },
});

export const FINANCE_TOOLS: FinanceTool[] = [
  getAccounts,
  getAccountBalance,
  getTransactions,
  searchTransactions,
  getCashflow,
  getSpendingSummary,
  getIncomeSummary,
  getNetWorth,
  getRecurringExpenses,
  comparePeriods,
  getFinancialSnapshot,
  analyzeSpending,
  analyzeCashflow,
  getHighlights,
  getBudgetStatus,
  getGoals,
  getSavingsOpportunities,
  checkAffordability,
  runWhatIf,
  getPortfolioSummary,
  getPortfolioAllocation,
  getPortfolioReturns,
  getCapitalGains,
] as unknown as FinanceTool[];

export class ToolInputError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export type ToolResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

/** Validates input and runs a tool, converting expected failures into structured errors. */
export async function runTool(tool: FinanceTool, ctx: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'INVALID_TOOL_INPUT',
        message: 'The tool input is invalid',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  }
  try {
    return { ok: true, data: await tool.run(ctx, parsed.data) };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error: { code: error.code, message: error.message, details: error.details } };
    }
    throw error;
  }
}

export function findTool(name: string): FinanceTool | undefined {
  return FINANCE_TOOLS.find((t) => t.name === name);
}
