import type { INestApplication } from '@nestjs/common';
import { createTestApp, registerUser } from './app';

type User = Awaited<ReturnType<typeof registerUser>>;

describe('Finance core over HTTP (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  async function createAccounts(user: User) {
    const bank = await user
      .post('/accounts', { name: 'HDFC Savings', type: 'BANK', institution: 'HDFC', openingBalance: '50000' })
      .expect(201);
    const card = await user.post('/accounts', { name: 'ICICI Amazon Pay', type: 'CREDIT_CARD' }).expect(201);
    return { bank: bank.body, card: card.body };
  }

  it('manages accounts, transactions, transfers and balances end to end', async () => {
    const user = await registerUser(app);
    const { bank, card } = await createAccounts(user);
    expect(bank).toMatchObject({ currency: 'INR', openingBalance: '50000.00', balance: '50000.00' });

    const categories = (await user.get('/categories').expect(200)).body.items as { id: string; name: string }[];
    const delivery = categories.find((c) => c.name === 'Delivery')!;
    expect(delivery).toBeDefined();

    const salary = await user
      .post('/transactions', { accountId: bank.id, date: '2026-08-01', description: 'ACME PAYROLL', amount: '120000', type: 'INCOME' })
      .expect(201);
    const swiggy = await user
      .post('/transactions', {
        accountId: card.id,
        date: '2026-08-14',
        description: 'SWIGGY*ORDER 8812',
        amount: '-649.50',
        type: 'EXPENSE',
        merchantName: 'Swiggy',
        categoryId: delivery.id,
      })
      .expect(201);
    expect(swiggy.body).toMatchObject({ amount: '-649.50', currency: 'INR', status: 'CLEARED', source: 'MANUAL' });
    expect(swiggy.body.merchantId).toEqual(expect.any(String));

    const payment = await user
      .post('/transfers', { fromAccountId: bank.id, toAccountId: card.id, amount: '649.50', date: '2026-08-25', description: 'Card bill' })
      .expect(201);
    expect(payment.body.from).toMatchObject({ amount: '-649.50', type: 'TRANSFER' });

    const accounts = (await user.get('/accounts').expect(200)).body.items as { id: string; balance: string }[];
    expect(Object.fromEntries(accounts.map((a) => [a.id, a.balance]))).toEqual({
      [bank.id]: '169350.50',
      [card.id]: '0.00',
    });

    const page = await user.get('/transactions?from=2026-08-01&to=2026-08-31&limit=2').expect(200);
    expect(page.body).toMatchObject({ total: 4, limit: 2, offset: 0 });
    expect(page.body.items.map((t: { date: string }) => t.date)).toEqual(['2026-08-25', '2026-08-25']);

    const bySearch = await user.get('/transactions?search=swiggy').expect(200);
    expect(bySearch.body.items.map((t: { id: string }) => t.id)).toEqual([swiggy.body.id]);
    const incomeOnly = await user.get('/transactions?type=INCOME,REFUND').expect(200);
    expect(incomeOnly.body.items.map((t: { id: string }) => t.id)).toEqual([salary.body.id]);

    const deleteLinked = await user.delete(`/transactions/${payment.body.from.id}`).expect(409);
    expect(deleteLinked.body.error.code).toBe('TRANSACTION_IN_TRANSFER');
    await user.delete(`/transfers/${payment.body.id}`).expect(204);
    await user.delete(`/transactions/${payment.body.from.id}`).expect(204);

    const deleteAccount = await user.delete(`/accounts/${bank.id}`).expect(409);
    expect(deleteAccount.body.error.code).toBe('ACCOUNT_HAS_TRANSACTIONS');
  });

  it('bulk categorizes and maps domain validation errors to 422', async () => {
    const user = await registerUser(app);
    const { bank } = await createAccounts(user);
    const food = await user.post('/categories', { name: 'Street Food', type: 'EXPENSE' }).expect(201);
    const ids: string[] = [];
    for (const description of ['Chai', 'Samosa']) {
      const res = await user
        .post('/transactions', { accountId: bank.id, date: '2026-08-02', description, amount: '-30', type: 'EXPENSE' })
        .expect(201);
      ids.push(res.body.id);
    }
    const bulk = await user.post('/transactions/bulk-categorize', { transactionIds: ids, categoryId: food.body.id }).expect(200);
    expect(bulk.body).toEqual({ updated: 2 });
    expect((await user.get(`/transactions?categoryId=${food.body.id}`)).body.total).toBe(2);

    const sign = await user
      .post('/transactions', { accountId: bank.id, date: '2026-08-02', description: 'x', amount: '30', type: 'EXPENSE' })
      .expect(422);
    expect(sign.body.error.code).toBe('AMOUNT_SIGN_MISMATCH');
    const date = await user
      .post('/transactions', { accountId: bank.id, date: '2026-02-30', description: 'x', amount: '-30', type: 'EXPENSE' })
      .expect(422);
    expect(date.body.error.code).toBe('INVALID_DATE');
  });

  it('rejects a transfer to an inactive account without writing either leg', async () => {
    const user = await registerUser(app);
    const { bank, card } = await createAccounts(user);
    await user.patch(`/accounts/${card.id}`, { isActive: false }).expect(200);
    const res = await user
      .post('/transfers', { fromAccountId: bank.id, toAccountId: card.id, amount: '10', date: '2026-08-01', description: 'x' })
      .expect(409);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect((await user.get('/transactions')).body.total).toBe(0);
  });

  describe('data isolation', () => {
    it('user B cannot read, modify, reference or delete user A’s data', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const { bank, card } = await createAccounts(a);
      const category = await a.post('/categories', { name: 'Private', type: 'EXPENSE' }).expect(201);
      const tx = await a
        .post('/transactions', { accountId: bank.id, date: '2026-08-03', description: 'Secret', amount: '-100', type: 'EXPENSE', merchantName: 'Hidden' })
        .expect(201);
      const transfer = await a
        .post('/transfers', { fromAccountId: bank.id, toAccountId: card.id, amount: '5', date: '2026-08-03', description: 'Move' })
        .expect(201);

      expect((await b.get('/accounts')).body.items).toEqual([]);
      expect((await b.get('/transactions')).body.total).toBe(0);
      expect((await b.get('/merchants')).body.items).toEqual([]);
      expect((await b.get('/transfers')).body.items).toEqual([]);
      expect((await b.get('/categories')).body.items.some((c: { id: string }) => c.id === category.body.id)).toBe(false);

      await b.get(`/accounts/${bank.id}`).expect(404);
      await b.get(`/transactions/${tx.body.id}`).expect(404);
      await b.get(`/transfers/${transfer.body.id}`).expect(404);
      await b.patch(`/accounts/${bank.id}`, { name: 'pwned' }).expect(404);
      await b.patch(`/transactions/${tx.body.id}`, { notes: 'pwned' }).expect(404);
      await b.patch(`/categories/${category.body.id}`, { name: 'pwned' }).expect(404);
      await b.patch(`/merchants/${tx.body.merchantId}`, { name: 'pwned' }).expect(404);
      await b.delete(`/transactions/${tx.body.id}`).expect(404);
      await b.delete(`/transfers/${transfer.body.id}`).expect(404);
      await b.delete(`/accounts/${card.id}`).expect(404);
      await b.post('/transactions/bulk-categorize', { transactionIds: [tx.body.id], categoryId: null }).expect(404);

      const own = await createAccounts(b);
      await b
        .post('/transactions', { accountId: bank.id, date: '2026-08-03', description: 'x', amount: '-1', type: 'EXPENSE' })
        .expect(404);
      await b
        .post('/transactions', { accountId: own.bank.id, date: '2026-08-03', description: 'x', amount: '-1', type: 'EXPENSE', categoryId: category.body.id })
        .expect(404);
      await b
        .post('/transfers', { fromAccountId: own.bank.id, toAccountId: bank.id, amount: '1', date: '2026-08-03', description: 'x' })
        .expect(404);

      const untouched = await a.get(`/transactions/${tx.body.id}`).expect(200);
      expect(untouched.body.notes).toBeNull();
      expect((await a.get(`/accounts/${bank.id}`)).body.name).toBe('HDFC Savings');
    });

    it('ignores user identifiers supplied in request bodies', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const aId = (await a.get('/me')).body.id;
      const res = await b.post('/accounts', { name: 'Sneaky', type: 'CASH', userId: aId }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect((await a.get('/accounts')).body.items).toEqual([]);
    });
  });
});

describe('Analytics over HTTP (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('summarizes a period from Postgres aggregates, excluding transfers', async () => {
    const user = await registerUser(app);
    const bank = (await user.post('/accounts', { name: 'Bank', type: 'BANK', openingBalance: '1000' })).body;
    const card = (await user.post('/accounts', { name: 'Card', type: 'CREDIT_CARD' })).body;
    const tx = (accountId: string, date: string, amount: string, type: string) =>
      user.post('/transactions', { accountId, date, description: type, amount, type }).expect(201);
    await tx(bank.id, '2026-07-31', '50000', 'INCOME');
    await tx(bank.id, '2026-08-01', '60000', 'INCOME');
    await tx(card.id, '2026-08-10', '-1000.10', 'EXPENSE');
    await tx(card.id, '2026-08-11', '200.05', 'REFUND');
    await user.post('/transfers', { fromAccountId: bank.id, toAccountId: card.id, amount: '800.05', date: '2026-08-20', description: 'pay' }).expect(201);

    const summary = await user.get('/analytics/summary?from=2026-08-01&to=2026-08-31').expect(200);
    expect(summary.body).toMatchObject({ currency: 'INR', income: '60000.00', expenses: '800.05', netCashflow: '59199.95', transfersVolume: '800.05' });

    const monthly = await user.get('/analytics/monthly?from=2026-07-01&to=2026-08-31').expect(200);
    expect(monthly.body.items.map((p: { income: string }) => p.income)).toEqual(['50000.00', '60000.00']);

    const worth = await user.get('/analytics/net-worth').expect(200);
    expect(worth.body).toMatchObject({ assets: '110199.95', liabilities: '0.00', netWorth: '110199.95' });

    const other = await registerUser(app);
    expect((await other.get('/analytics/summary?from=2026-08-01&to=2026-08-31')).body.income).toBe('0.00');
  });
});

describe('Insights over HTTP (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('compares periods, ranks merchants, detects recurring charges and builds a snapshot', async () => {
    const user = await registerUser(app);
    const bank = (await user.post('/accounts', { name: 'Bank', type: 'BANK', openingBalance: '50000' })).body;
    const categories = (await user.get('/categories')).body.items as { id: string; name: string }[];
    const streaming = categories.find((c) => c.name === 'Streaming')!;
    const add = (date: string, amount: string, description: string, extra: Record<string, unknown> = {}) =>
      user.post('/transactions', { accountId: bank.id, date, description, amount, type: 'EXPENSE', ...extra }).expect(201);

    const today = new Date();
    const month = (offset: number) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
      return d.toISOString().slice(0, 7);
    };
    for (const offset of [-3, -2, -1, 0]) {
      await add(`${month(offset)}-01`, '-649', 'NETFLIX.COM', { merchantName: 'Netflix', categoryId: streaming.id });
    }
    await add(`${month(-1)}-10`, '-2000', 'SWIGGY', { merchantName: 'Swiggy' });
    await add(`${month(0)}-01`, '-9000', 'CROMA TV', { merchantName: 'Croma' });

    const last = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const compare = await user
      .get(`/analytics/compare?from=${month(0)}-01&to=${last(month(0))}&previousFrom=${month(-1)}-01&previousTo=${last(month(-1))}`)
      .expect(200);
    expect(compare.body.change).toMatchObject({ expenses: '7000.00' });
    expect(compare.body.largestExpenses[0]).toMatchObject({ amount: '-9000.00' });

    const merchants = await user.get(`/analytics/merchants?from=${month(-3)}-01&to=${last(month(0))}`).expect(200);
    expect(merchants.body.items.map((m: { name: string; amount: string }) => [m.name, m.amount])).toEqual([
      ['Croma', '9000.00'],
      ['Netflix', '2596.00'],
      ['Swiggy', '2000.00'],
    ]);

    const recurring = await user.get('/analytics/recurring').expect(200);
    expect(recurring.body.series).toHaveLength(1);
    expect(recurring.body.series[0]).toMatchObject({ label: 'Netflix', frequency: 'MONTHLY', monthlyCost: '649.00', status: 'ACTIVE' });
    expect(recurring.body.series[0]).not.toHaveProperty('userId');
    expect(recurring.body.monthlyTotal).toBe('649.00');

    const dismissed = await user.patch(`/analytics/recurring/${recurring.body.series[0].id}`, { isDismissed: true }).expect(200);
    expect(dismissed.body.isDismissed).toBe(true);
    expect((await user.get('/analytics/recurring')).body.monthlyTotal).toBe('0.00');
    const other = await registerUser(app);
    await other.patch(`/analytics/recurring/${recurring.body.series[0].id}`, { isDismissed: false }).expect(404);

    const snapshot = await user.get(`/analytics/snapshot?month=${month(0)}`).expect(200);
    expect(snapshot.body).toMatchObject({ period: month(0), expenses: '9649.00', currency: 'INR' });
  });
});
