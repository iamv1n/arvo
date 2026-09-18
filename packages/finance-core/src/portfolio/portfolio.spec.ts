import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import { financialYearOf } from './capital-gains';
import { formatUnits, parseUnits, priceOf, valueOf } from './units';
import { buildPosition, positionCashflows } from './valuation';
import { xirr, xirrPercent } from './xirr';

const ASOF = '2026-09-19';

/** A fund with a known NAV, ready for SIPs. */
async function equityFund(core: ReturnType<typeof setup>['core'], userId = USER_A, overrides: Record<string, unknown> = {}) {
  return core.holdings.create(userId, {
    name: 'Parag Parikh Flexi Cap Direct Growth',
    kind: 'MUTUAL_FUND',
    currency: 'INR',
    isin: 'INF879O01027',
    schemeCode: '122639',
    folio: '12345678/90',
    amc: 'PPFAS',
    marketCap: 'LARGE',
    plan: 'DIRECT',
    expenseRatio: '0.63',
    latestPrice: '80',
    latestPriceDate: ASOF,
    ...overrides,
  });
}

describe('units', () => {
  it('round-trips quantities at 5 decimal places', () => {
    expect(formatUnits(parseUnits('1234.5670'))).toBe('1234.56700');
    expect(formatUnits(parseUnits('0.001'))).toBe('0.00100');
    expect(formatUnits(parseUnits('-2.5'))).toBe('-2.50000');
    expect(() => parseUnits('1.123456')).toThrow(RangeError);
  });

  it('multiplies and divides exactly, rounding half away from zero', () => {
    // 12.345 units at ₹80.5000 = ₹993.7725
    expect(valueOf(parseUnits('12.345'), 805_000n)).toBe(9_937_725n);
    // ₹10,000 buying 123.456 units → NAV 81.0004
    expect(priceOf(100_000_000n, parseUnits('123.456'))).toBe(810_005n);
    expect(priceOf(100n, 0n)).toBe(0n);
  });
});

describe('xirr', () => {
  it('matches a spreadsheet on a known series', () => {
    // ₹10,000 invested, ₹11,000 back exactly 365 days later → 10%.
    expect(xirr([{ date: '2025-01-01', amount: '-10000' }, { date: '2026-01-01', amount: '11000' }])).toBeCloseTo(0.1, 6);
    // A three-instalment SIP worth ₹34,000 after a year.
    const rate = xirr([
      { date: '2025-01-01', amount: '-10000' },
      { date: '2025-04-01', amount: '-10000' },
      { date: '2025-07-01', amount: '-10000' },
      { date: '2026-01-01', amount: '34000' },
    ]);
    expect(rate).not.toBeNull();
    expect(xirrPercent([
      { date: '2025-01-01', amount: '-10000' },
      { date: '2026-01-01', amount: '11000' },
    ])).toBe(10);
  });

  it('falls back to bisection on a heavy loss and refuses impossible series', () => {
    // −95% in a year: Newton overshoots the −99.99% floor, bisection finds it.
    const rate = xirr([{ date: '2025-01-01', amount: '-100000' }, { date: '2026-01-01', amount: '5000' }]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(-0.9);
    expect(xirr([{ date: '2025-01-01', amount: '-1000' }])).toBeNull();
    expect(xirr([{ date: '2025-01-01', amount: '-1000' }, { date: '2026-01-01', amount: '-1000' }])).toBeNull();
  });
});

describe('HoldingService', () => {
  it('creates holdings, derives the amount from units and price, and scopes them per user', async () => {
    const { core } = setup();
    const fund = await equityFund(core);
    expect(fund).toMatchObject({ assetClass: 'EQUITY', isin: 'INF879O01027', plan: 'DIRECT', expenseRatio: '0.63' });

    const sip = await core.holdings.addTransaction(USER_A, fund.id, { date: '2026-01-01', type: 'SIP', units: '200', price: '50' });
    expect(sip).toMatchObject({ amount: '10000.00', price: '50.00', units: '200.00000', charges: '0.00' });

    // Only two of units / price / amount are needed.
    const buy = await core.holdings.addTransaction(USER_A, fund.id, { date: '2026-02-01', type: 'BUY', units: '100', amount: '6000' });
    expect(buy.price).toBe('60.00');

    await expectDomainError(core.holdings.addTransaction(USER_A, fund.id, { date: '2026-02-01', type: 'BUY', amount: '5000' }), 'UNITS_REQUIRED');
    await expectDomainError(
      core.holdings.addTransaction(USER_A, fund.id, { date: '2026-02-01', type: 'DIVIDEND', units: '5', amount: '500' }),
      'UNITS_NOT_ALLOWED',
    );
    await expectDomainError(core.holdings.create(USER_A, { name: 'X', kind: 'MUTUAL_FUND', currency: 'INR', isin: 'NOPE' }), 'INVALID_ISIN');
    await expectDomainError(core.holdings.create(USER_A, { name: ' ', kind: 'EQUITY', currency: 'INR' }), 'INVALID_INPUT');

    expect(await core.holdings.list(USER_B)).toEqual([]);
    await expectDomainError(core.holdings.require(USER_B, fund.id), 'HOLDING_NOT_FOUND');
    await expectDomainError(core.holdings.addTransaction(USER_B, fund.id, { date: '2026-01-01', type: 'BUY', units: '1', price: '1' }), 'HOLDING_NOT_FOUND');
  });

  it('records manual value updates for instruments with no unit price', async () => {
    const { core } = setup();
    const epf = await core.holdings.create(USER_A, { name: 'EPF — Employer', kind: 'EPF', currency: 'INR', folio: 'KN/BNG/1234' });
    expect(epf.assetClass).toBe('DEBT');
    await core.holdings.addTransaction(USER_A, epf.id, { date: '2026-04-30', type: 'CONTRIBUTION', amount: '25000' });
    await core.holdings.addTransaction(USER_A, epf.id, { date: '2026-05-31', type: 'CONTRIBUTION', amount: '25000' });
    await core.holdings.addTransaction(USER_A, epf.id, { date: '2026-06-30', type: 'VALUE_UPDATE', amount: '53000' });

    const { position } = await core.holdings.detail(USER_A, epf.id, ASOF);
    expect(position.valueSource).toBe('STATED');
    expect(position.value).toBe(530_000_000n);
    expect(position.invested).toBe(500_000_000n);
  });
});

describe('positions and FIFO lots', () => {
  it('matches sales against the oldest lots and keeps the rest open', async () => {
    const { core, store } = setup();
    const fund = await equityFund(core, USER_A, { latestPrice: '100', name: 'Fund A' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2024-01-10', type: 'BUY', units: '100', price: '50' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2025-06-10', type: 'BUY', units: '100', price: '75' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2026-08-10', type: 'SELL', units: '120', price: '100', charges: '20' });

    const transactions = await store.holdingTransactions.findByHolding(USER_A, fund.id);
    const holding = (await store.holdings.findById(USER_A, fund.id))!;
    const position = buildPosition(holding, transactions, ASOF);

    expect(position.units).toBe(parseUnits('80'));
    // 120 units sold: 100 from the ₹50 lot, 20 from the ₹75 lot.
    expect(position.realised).toHaveLength(2);
    expect(position.realised[0]).toMatchObject({ buyDate: '2024-01-10', cost: 50_000_000n });
    expect(position.realised[1]).toMatchObject({ buyDate: '2025-06-10', cost: 15_000_000n });
    // Proceeds ₹12,000 less ₹20 charges, split 100:20.
    expect(position.realised[0].proceeds + position.realised[1].proceeds).toBe(119_800_000n);
    expect(position.lots).toEqual([{ date: '2025-06-10', units: parseUnits('80'), cost: 60_000_000n }]);
    expect(position.value).toBe(80_000_000n);
    expect(position.unrealisedGain).toBe(20_000_000n);
    expect(positionCashflows(position).at(-1)).toEqual({ date: ASOF, amount: '8000.0000' });
  });

  it('ignores transactions after the valuation date', async () => {
    const { core } = setup();
    const fund = await equityFund(core, USER_A, { latestPrice: '100' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2026-01-01', type: 'BUY', units: '10', price: '50' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2027-01-01', type: 'BUY', units: '10', price: '50' });
    const { position } = await core.holdings.detail(USER_A, fund.id, ASOF);
    expect(position.units).toBe(parseUnits('10'));
  });
});

describe('PortfolioService', () => {
  const build = async () => {
    const { core } = setup();
    const fund = await equityFund(core, USER_A, { latestPrice: '100', name: 'Flexi Cap Direct' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2024-09-19', type: 'BUY', units: '1000', price: '50' });
    const debt = await core.holdings.create(USER_A, {
      name: 'SBI Corporate Bond Regular',
      kind: 'MUTUAL_FUND',
      assetClass: 'DEBT',
      currency: 'INR',
      amc: 'SBI',
      plan: 'REGULAR',
      expenseRatio: '1.2',
      directExpenseRatio: '0.35',
      latestPrice: '20',
      latestPriceDate: ASOF,
    });
    await core.holdings.addTransaction(USER_A, debt.id, { date: '2025-09-19', type: 'BUY', units: '2500', price: '18' });
    return { core, fund, debt };
  };

  it('summarises value, gain and XIRR from a fixed asOf', async () => {
    const { core } = await build();
    const summary = await core.portfolio.summary(USER_A, { asOf: ASOF, currency: 'INR' });
    // ₹50,000 + ₹45,000 invested; worth ₹100,000 + ₹50,000.
    expect(summary).toMatchObject({
      asOf: ASOF,
      currency: 'INR',
      totalInvested: '95000.00',
      netInvested: '95000.00',
      currentValue: '150000.00',
      totalGain: '55000.00',
      holdingCount: 2,
    });
    expect(summary.absoluteReturnPercent).toBe(57.89);
    expect(summary.xirrPercent).toBeGreaterThan(30);
    expect(summary.byAssetClass.map((s) => [s.key, s.percent])).toEqual([
      ['EQUITY', 66.67],
      ['DEBT', 33.33],
    ]);
    expect(summary.disclaimer).toContain('not advice');
  });

  it('breaks allocation down and flags concentration and cost drag', async () => {
    const { core } = await build();
    const allocation = await core.portfolio.allocation(USER_A, { asOf: ASOF, currency: 'INR' });
    expect(allocation.totalValue).toBe('150000.00');
    expect(allocation.assetClass).toHaveLength(2);
    expect(allocation.amc.map((s) => s.key).sort()).toEqual(['PPFAS', 'SBI']);
    expect(allocation.marketCap).toEqual([expect.objectContaining({ key: 'LARGE', percent: 66.67 })]);
    expect(allocation.concentration.topHoldingPercent).toBe(66.67);
    expect(allocation.concentration.warnings[0]).toContain('66.67%');
    // ₹100,000 × 0.63% + ₹50,000 × 1.2%
    expect(allocation.costDrag.annualCost).toBe('1230.00');
    // Regular plan at 1.2% versus a 0.35% direct plan on ₹50,000.
    expect(allocation.costDrag.regularPlanExtraCost).toBe('425.00');
  });

  it('compares returns with an imported index using the same cashflows', async () => {
    const { core, store } = setup();
    const fund = await equityFund(core, USER_A, { latestPrice: '100' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2024-09-19', type: 'BUY', units: '1000', price: '50' });
    await store.portfolioData.replaceBenchmark(USER_A, 'NIFTY 50 TRI', [
      { date: '2024-09-19', value: '25000' },
      { date: ASOF, value: '30000' },
    ]);

    const returns = await core.portfolio.returns(USER_A, { asOf: ASOF, currency: 'INR' });
    expect(returns.availableBenchmarks).toEqual(['NIFTY 50 TRI']);
    // ₹50,000 at 25,000 → 2 index units; at 30,000 they are worth ₹60,000.
    expect(returns.benchmark).toMatchObject({ series: 'NIFTY 50 TRI', value: '60000.00' });
    // Two years: the index compounds ₹50,000 to ₹60,000 (9.54%), the fund to ₹100,000 (41.42%).
    expect(returns.benchmark!.xirrPercent).toBeCloseTo(9.54, 1);
    expect(returns.xirrPercent).toBeCloseTo(41.42, 1);
    expect(returns.benchmark!.differencePercent).toBeCloseTo(31.9, 0);
    expect(returns.byHolding[0].holdingId).toBe(fund.id);
  });

  it('keeps every report scoped to the signed-in user', async () => {
    const { core } = await build();
    const summary = await core.portfolio.summary(USER_B, { asOf: ASOF, currency: 'INR' });
    expect(summary).toMatchObject({ currentValue: '0.00', holdingCount: 0 });
    const allocation = await core.portfolio.allocation(USER_B, { asOf: ASOF, currency: 'INR' });
    expect(allocation.holdings).toEqual([]);
  });
});

describe('capital gains', () => {
  it('splits realised gains by holding period and leaves harvesting headroom', async () => {
    const { core } = setup();
    const fund = await equityFund(core, USER_A, { latestPrice: '120', name: 'Flexi Cap' });
    // Long-term: bought two years before the sale.
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2023-05-01', type: 'BUY', units: '1000', price: '50' });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2026-05-01', type: 'SELL', units: '500', price: '100' });
    // Short-term: bought and sold inside the same year.
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2026-04-10', type: 'BUY', units: '100', price: '90' });

    const gains = await core.portfolio.capitalGains(USER_A, { asOf: ASOF, currency: 'INR' });
    expect(gains.financialYear).toBe('2026-27');
    // 500 units bought at ₹50 sold at ₹100 → ₹25,000 long-term.
    expect(gains.realised).toMatchObject({ longTerm: '25000.00', shortTerm: '0.00', exemptLongTerm: '25000.00', taxableLongTerm: '0.00' });
    expect(gains.harvestHeadroom).toBe('100000.00');
    // 500 old units at ₹120 (₹35,000 gain) plus 100 new ones at ₹120 (₹3,000 gain).
    expect(gains.unrealised.longTerm).toBe('35000.00');
    expect(gains.unrealised.shortTerm).toBe('3000.00');
    expect(gains.harvestSuggestions[0]).toMatchObject({ buyDate: '2023-05-01', gain: '35000.00' });
    expect(gains.disclaimer).toContain('not advice');
  });

  it('tracks ELSS lock-ins from each purchase date', async () => {
    const { core } = setup();
    const elss = await equityFund(core, USER_A, { name: 'Quant ELSS Tax Saver', lockInMonths: 36, latestPrice: '100' });
    await core.holdings.addTransaction(USER_A, elss.id, { date: '2024-06-01', type: 'SIP', units: '100', price: '80' });
    await core.holdings.addTransaction(USER_A, elss.id, { date: '2022-06-01', type: 'SIP', units: '100', price: '60' });
    const gains = await core.portfolio.capitalGains(USER_A, { asOf: ASOF, currency: 'INR' });
    expect(gains.lockIns).toEqual([expect.objectContaining({ buyDate: '2024-06-01', unlocksOn: '2027-06-01' })]);
  });

  it('puts a sale in the financial year it happened', () => {
    expect(financialYearOf('2026-03-31')).toBe('2025-26');
    expect(financialYearOf('2026-04-01')).toBe('2026-27');
  });
});

describe('rebalance', () => {
  it('produces the minimum trades to reach a target, with tax and lock-in warnings', async () => {
    const { core } = setup();
    const equity = await equityFund(core, USER_A, { latestPrice: '100', name: 'Flexi Cap' });
    await core.holdings.addTransaction(USER_A, equity.id, { date: '2024-01-01', type: 'BUY', units: '800', price: '50' });
    const debt = await core.holdings.create(USER_A, { name: 'Liquid Fund', kind: 'MUTUAL_FUND', assetClass: 'DEBT', currency: 'INR', latestPrice: '10' });
    await core.holdings.addTransaction(USER_A, debt.id, { date: '2024-01-01', type: 'BUY', units: '2000', price: '10' });

    // ₹80,000 equity and ₹20,000 debt; target 60/40 means moving ₹20,000.
    const result = await core.portfolio.rebalance(USER_A, {
      asOf: ASOF,
      currency: 'INR',
      targets: [{ assetClass: 'EQUITY', percent: '60' }, { assetClass: 'DEBT', percent: '40' }],
    });
    expect(result.totalValue).toBe('100000.00');
    expect(result.classes).toEqual([
      expect.objectContaining({ assetClass: 'DEBT', currentPercent: 20, targetPercent: 40, difference: '20000.00' }),
      expect.objectContaining({ assetClass: 'EQUITY', currentPercent: 80, targetPercent: 60, difference: '-20000.00' }),
    ]);
    expect(result.trades).toEqual([
      expect.objectContaining({ action: 'SELL', assetClass: 'EQUITY', amount: '20000.00', units: '200.00000' }),
      expect.objectContaining({ action: 'BUY', assetClass: 'DEBT', amount: '20000.00', units: '2000.00000' }),
    ]);
    // A quarter of the ₹40,000 unrealised long-term gain is realised: ₹10,000 at 12.5%.
    expect(result.trades[0].estimatedGain).toBe('10000.00');
    expect(result.trades[0].estimatedTax).toBe('1250.00');
    expect(result.disclaimer).toContain('not a recommendation');

    await expectDomainError(
      core.portfolio.rebalance(USER_A, { asOf: ASOF, currency: 'INR', targets: [{ assetClass: 'EQUITY', percent: '70' }] }),
      'TARGETS_MUST_SUM_TO_100',
    );
  });

  it('leaves classes inside the drift band alone', async () => {
    const { core } = setup();
    const equity = await equityFund(core, USER_A, { latestPrice: '100' });
    await core.holdings.addTransaction(USER_A, equity.id, { date: '2024-01-01', type: 'BUY', units: '1000', price: '50' });
    const result = await core.portfolio.rebalance(USER_A, { asOf: ASOF, currency: 'INR', targets: [{ assetClass: 'EQUITY', percent: '100' }] });
    expect(result.trades).toEqual([]);
  });
});

describe('goal projection', () => {
  it('is reproducible and reports its assumptions', async () => {
    const { core } = setup();
    const goal = await core.goals.create(USER_A, { name: 'House', targetAmount: '2000000', currency: 'INR', targetDate: '2031-09-19' });
    const fund = await equityFund(core, USER_A, { latestPrice: '100', goalId: goal.id });
    await core.holdings.addTransaction(USER_A, fund.id, { date: '2024-01-01', type: 'BUY', units: '10000', price: '50' });

    const first = await core.portfolio.goalProjection(USER_A, { asOf: ASOF, currency: 'INR', monthlyContributions: { [goal.id]: '10000' } });
    const second = await core.portfolio.goalProjection(USER_A, { asOf: ASOF, currency: 'INR', monthlyContributions: { [goal.id]: '10000' } });
    expect(first.goals[0]).toEqual(second.goals[0]);
    expect(first.goals[0]).toMatchObject({
      goalName: 'House',
      currentValue: '1000000.00',
      monthsLeft: 60,
      monthlyContribution: '10000.00',
      blend: [{ assetClass: 'EQUITY', percent: 100 }],
    });
    expect(first.goals[0].assumptions).toMatchObject({ paths: 2000, blendReturnPercent: 12, blendVolatilityPercent: 18 });
    expect(first.goals[0].probability).toBeGreaterThan(50);
    expect(Number(first.goals[0].p10)).toBeLessThan(Number(first.goals[0].p50));
    expect(Number(first.goals[0].p50)).toBeLessThan(Number(first.goals[0].p90));
    expect(first.goals[0].disclaimer).toContain('not advice');
  });
});

describe('fund overlap', () => {
  it('reports common holdings and the funds with no disclosure imported', async () => {
    const { core, store } = setup();
    const a = await equityFund(core, USER_A, { name: 'Fund A', isin: 'INF879O01027', latestPrice: '100' });
    const b = await equityFund(core, USER_A, { name: 'Fund B', isin: 'INF109K01Z48', schemeCode: '120503', latestPrice: '100' });
    const c = await equityFund(core, USER_A, { name: 'Fund C', isin: 'INF209K01UN8', schemeCode: '119551', latestPrice: '100' });
    for (const fund of [a, b, c]) {
      await core.holdings.addTransaction(USER_A, fund.id, { date: '2024-01-01', type: 'BUY', units: '100', price: '50' });
    }
    await store.portfolioData.replaceFundHoldings(USER_A, a.id, [
      { userId: USER_A, holdingId: a.id, name: 'HDFC Bank', isin: 'INE040A01034', weight: '8.5', asOf: ASOF },
      { userId: USER_A, holdingId: a.id, name: 'Infosys', isin: 'INE009A01021', weight: '5.0', asOf: ASOF },
    ]);
    await store.portfolioData.replaceFundHoldings(USER_A, b.id, [
      { userId: USER_A, holdingId: b.id, name: 'HDFC Bank', isin: 'INE040A01034', weight: '6.0', asOf: ASOF },
      { userId: USER_A, holdingId: b.id, name: 'Infosys', isin: 'INE009A01021', weight: '7.5', asOf: ASOF },
      { userId: USER_A, holdingId: b.id, name: 'ITC', isin: 'INE154A01025', weight: '3.0', asOf: ASOF },
    ]);

    const overlap = await core.portfolio.overlap(USER_A, { asOf: ASOF, currency: 'INR' });
    // min(8.5, 6.0) + min(5.0, 7.5) = 11.0
    expect(overlap.pairs).toEqual([expect.objectContaining({ overlapPercent: 11, commonCount: 2 })]);
    expect(overlap.missingDisclosures).toEqual([{ holdingId: c.id, name: 'Fund C' }]);
  });
});
