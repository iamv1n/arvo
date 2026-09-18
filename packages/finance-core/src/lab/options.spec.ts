import { impliedVolatility, intrinsicValue, lognormalCdf, normalCdf, optionGreeks, optionPrice, yearsBetween } from './black-scholes';
import { calculateFutures } from './futures';
import { analyseStrategy, solveImpliedVolatility, strategyGreeks } from './payoff';
import { calculateSizing, kellyExplainer, riskOfRuin } from './sizing';
import { STRATEGY_TEMPLATES, buildTemplate } from './templates';
import type { MarketAssumptions, StrategyLeg } from './types';

/*
 * The pricing tests check against the textbook case every options library is benchmarked on:
 * S = K = 100, one year, r = 5%, no dividend, 20% volatility. Hull's own worked example gives
 * a call of 10.4506 and a put of 5.5735, and the Greeks follow from there. If a refactor moves
 * any of these, the model has changed.
 */

const BASE = { spot: 100, strike: 100, timeYears: 1, rate: 0.05, dividendYield: 0, volatility: 0.2 };

const ASSUMPTIONS: MarketAssumptions = {
  spot: '24000',
  asOf: '2026-09-19',
  riskFreeRatePercent: '6.5',
  dividendYieldPercent: '0',
  impliedVolatilityPercent: '14',
};

const leg = (over: Partial<StrategyLeg>): StrategyLeg => ({
  kind: 'CALL',
  action: 'BUY',
  lots: 1,
  lotSize: 75,
  strike: '24000',
  premium: '100',
  expiry: '2026-10-29',
  impliedVolatilityPercent: null,
  label: null,
  ...over,
});

describe('normal distribution', () => {
  it('matches known values of the standard normal CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 15);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 13);
    expect(normalCdf(-1.96)).toBeCloseTo(0.024997895148220435, 13);
    expect(normalCdf(8)).toBeCloseTo(1, 14);
    expect(normalCdf(-40)).toBe(0);
  });
});

describe('Black-Scholes', () => {
  it('prices the textbook call and put', () => {
    expect(optionPrice({ ...BASE, right: 'CE' })).toBeCloseTo(10.450584, 6);
    expect(optionPrice({ ...BASE, right: 'PE' })).toBeCloseTo(5.573526, 6);
  });

  it('respects put-call parity', () => {
    const call = optionPrice({ ...BASE, right: 'CE' });
    const put = optionPrice({ ...BASE, right: 'PE' });
    const parity = BASE.spot * Math.exp(-BASE.dividendYield) - BASE.strike * Math.exp(-BASE.rate);
    expect(call - put).toBeCloseTo(parity, 10);
  });

  it('gives the textbook Greeks in trader units', () => {
    const greeks = optionGreeks({ ...BASE, right: 'CE' });
    expect(greeks.delta).toBeCloseTo(0.636831, 6);
    expect(greeks.gamma).toBeCloseTo(0.018762, 6);
    // Theta is quoted per calendar day, vega per volatility point, rho per rate point.
    expect(greeks.theta).toBeCloseTo(-0.017573, 6);
    expect(greeks.vega).toBeCloseTo(0.37524, 5);
    expect(greeks.rho).toBeCloseTo(0.532325, 6);
  });

  it('agrees with a numerical derivative for delta and vega', () => {
    const h = 1e-4;
    const up = optionPrice({ ...BASE, spot: BASE.spot + h, right: 'PE' });
    const down = optionPrice({ ...BASE, spot: BASE.spot - h, right: 'PE' });
    expect((up - down) / (2 * h)).toBeCloseTo(optionGreeks({ ...BASE, right: 'PE' }).delta, 7);
    const volUp = optionPrice({ ...BASE, volatility: BASE.volatility + h, right: 'PE' });
    const volDown = optionPrice({ ...BASE, volatility: BASE.volatility - h, right: 'PE' });
    expect((volUp - volDown) / (2 * h) / 100).toBeCloseTo(optionGreeks({ ...BASE, right: 'PE' }).vega, 7);
  });

  it('collapses to intrinsic value at expiry', () => {
    expect(optionPrice({ ...BASE, timeYears: 0, spot: 110, right: 'CE' })).toBe(10);
    expect(optionPrice({ ...BASE, timeYears: 0, spot: 110, right: 'PE' })).toBe(0);
    expect(intrinsicValue(90, 100, 'PE')).toBe(10);
    const expired = optionGreeks({ ...BASE, timeYears: 0, spot: 110, right: 'CE' });
    expect(expired).toEqual({ delta: 1, gamma: 0, theta: 0, vega: 0, rho: 0 });
  });

  it('counts time on ACT/365 and never goes negative', () => {
    expect(yearsBetween('2026-09-19', '2027-09-19')).toBeCloseTo(1, 10);
    expect(yearsBetween('2026-09-19', '2026-09-19')).toBe(0);
    expect(yearsBetween('2026-09-19', '2026-01-01')).toBe(0);
  });

  it('integrates the lognormal to one', () => {
    expect(lognormalCdf(1e9, 100, 1, 0.05, 0, 0.2)).toBeCloseTo(1, 10);
    expect(lognormalCdf(0, 100, 1, 0.05, 0, 0.2)).toBe(0);
  });
});

describe('implied volatility', () => {
  it('recovers the volatility a price was made with', () => {
    for (const volatility of [0.05, 0.12, 0.2, 0.55, 1.4]) {
      for (const right of ['CE', 'PE'] as const) {
        const price = optionPrice({ ...BASE, volatility, right });
        const solved = impliedVolatility(price, { ...BASE, right });
        expect(solved.status).toBe('SOLVED');
        expect(solved.volatility).toBeCloseTo(volatility, 8);
      }
    }
  });

  it('converges in a handful of iterations near the money', () => {
    const price = optionPrice({ ...BASE, right: 'CE' });
    expect(impliedVolatility(price, { ...BASE, right: 'CE' }).iterations).toBeLessThanOrEqual(8);
  });

  it('solves deep out of the money, where Newton alone would diverge', () => {
    const inputs = { ...BASE, strike: 130, timeYears: 0.25, volatility: 0.45 };
    const price = optionPrice({ ...inputs, right: 'CE' });
    const solved = impliedVolatility(price, { ...inputs, right: 'CE' });
    expect(solved.status).toBe('SOLVED');
    expect(solved.volatility).toBeCloseTo(0.45, 8);
  });

  it('refuses a premium outside the no-arbitrage bounds instead of guessing', () => {
    expect(impliedVolatility(0.001, { ...BASE, spot: 200, right: 'CE' }).status).toBe('BELOW_INTRINSIC');
    expect(impliedVolatility(1_000, { ...BASE, right: 'CE' }).status).toBe('ABOVE_BOUND');
    expect(impliedVolatility(5, { ...BASE, timeYears: 0, right: 'CE' }).status).toBe('EXPIRED');
  });

  it('reports the solve over HTTP-shaped input with its time value split out', () => {
    const report = solveImpliedVolatility({
      spot: '24000',
      strike: '23800',
      expiry: '2026-10-29',
      asOf: '2026-09-19',
      right: 'CE',
      premium: '420',
      riskFreeRatePercent: '6.5',
      dividendYieldPercent: '0',
    });
    expect(report.status).toBe('SOLVED');
    expect(report.daysToExpiry).toBe(40);
    expect(report.intrinsicValue).toBe('200.00');
    expect(report.timeValue).toBe('220.00');
    expect(Number(report.impliedVolatilityPercent)).toBeGreaterThan(5);
    expect(report.greeks?.delta).toBeDefined();
  });
});

describe('payoff engine', () => {
  it('prices a long call: capped loss, unlimited profit, breakeven at strike plus premium', () => {
    const report = analyseStrategy([leg({ premium: '100' })], ASSUMPTIONS);
    expect(report.maxLoss).toEqual({ amount: '-7500.00', unlimited: false, atSpot: expect.any(String) });
    expect(report.maxProfit.unlimited).toBe(true);
    expect(report.breakevens).toHaveLength(1);
    expect(Number(report.breakevens[0])).toBeCloseTo(24100, 1);
    expect(report.netCashflow).toBe('-7500.00');
  });

  it('prices a short put: bounded loss at zero, because the underlying cannot go below it', () => {
    const report = analyseStrategy([leg({ kind: 'PUT', action: 'SELL', strike: '24000', premium: '150' })], ASSUMPTIONS);
    expect(report.maxProfit).toMatchObject({ amount: '11250.00', unlimited: false });
    expect(report.maxLoss.unlimited).toBe(false);
    expect(Number(report.maxLoss.amount)).toBeCloseTo(-(24000 - 150) * 75, 0);
    expect(report.netCashflow).toBe('11250.00');
  });

  it('caps both ends of a vertical spread and finds the single breakeven', () => {
    const report = analyseStrategy(
      [leg({ strike: '24000', premium: '300' }), leg({ action: 'SELL', strike: '24200', premium: '180' })],
      ASSUMPTIONS,
    );
    // Net debit 120 a unit on a 200-wide spread: lose 120, make 80.
    expect(report.netCashflow).toBe('-9000.00');
    expect(report.maxLoss).toMatchObject({ amount: '-9000.00', unlimited: false });
    expect(report.maxProfit).toMatchObject({ amount: '6000.00', unlimited: false });
    expect(Number(report.breakevens[0])).toBeCloseTo(24120, 1);
  });

  it('nets the Greeks across legs and cancels a synthetic', () => {
    const { net } = strategyGreeks(
      [leg({ kind: 'CALL', action: 'BUY', strike: '24000', premium: '300' }), leg({ kind: 'PUT', action: 'BUY', strike: '24000', premium: '300' })],
      ASSUMPTIONS,
    );
    // A long straddle is close to delta-flat and long everything else. It is not exactly flat:
    // at 6.5% and 40 days the forward sits above spot, so the call delta is a little over half.
    expect(Math.abs(Number(net.delta))).toBeLessThan(0.2 * 75);
    expect(Number(net.gamma)).toBeGreaterThan(0);
    expect(Number(net.vega)).toBeGreaterThan(0);
    expect(Number(net.theta)).toBeLessThan(0);
  });

  it('is deterministic', () => {
    const once = analyseStrategy([leg({}), leg({ action: 'SELL', strike: '24300', premium: '40' })], ASSUMPTIONS);
    const twice = analyseStrategy([leg({}), leg({ action: 'SELL', strike: '24300', premium: '40' })], ASSUMPTIONS);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });

  it('draws a calendar as a curve, not a straight line, because the far leg keeps its time value', () => {
    const report = analyseStrategy(
      [
        leg({ action: 'SELL', strike: '24000', premium: '200', expiry: '2026-10-29' }),
        leg({ action: 'BUY', strike: '24000', premium: '340', expiry: '2026-11-26' }),
      ],
      ASSUMPTIONS,
    );
    // Best at the short strike, falling away on both sides: two breakevens, bounded both ways.
    expect(report.breakevens).toHaveLength(2);
    expect(report.maxProfit.unlimited).toBe(false);
    expect(report.maxLoss.unlimited).toBe(false);
  });

  it('estimates margin transparently and labels it', () => {
    const naked = analyseStrategy([leg({ action: 'SELL', strike: '24000', premium: '300' })], ASSUMPTIONS);
    expect(naked.margin.hedgeCredit).toBe('0.00');
    // 15% of 24000 x 75.
    expect(naked.margin.total).toBe('270000.00');
    expect(naked.margin.disclaimer).toContain('SPAN');

    const spread = analyseStrategy(
      [leg({ action: 'SELL', strike: '24000', premium: '300' }), leg({ action: 'BUY', strike: '24200', premium: '180' })],
      ASSUMPTIONS,
    );
    expect(Number(spread.margin.total)).toBeLessThan(Number(naked.margin.total));
    expect(Number(spread.margin.hedgeCredit)).toBeGreaterThan(0);
  });

  it('estimates probability of profit from the lognormal and says it is an estimate', () => {
    const report = analyseStrategy([leg({ kind: 'PUT', action: 'SELL', strike: '22000', premium: '40' })], ASSUMPTIONS);
    const pop = Number(report.probabilityOfProfit?.percent);
    // A put 8% out of the money with 40 days at 14% volatility expires worthless most of the time.
    expect(pop).toBeGreaterThan(85);
    expect(pop).toBeLessThan(100);
    expect(report.probabilityOfProfit?.caveat).toContain('not a forecast');
  });

  it('rejects structures it cannot price', () => {
    expect(() => analyseStrategy([], ASSUMPTIONS)).toThrow(/at least one leg/);
    expect(() => analyseStrategy([leg({ strike: null })], ASSUMPTIONS)).toThrow(/strike/);
    expect(() => analyseStrategy([leg({ lots: 0 })], ASSUMPTIONS)).toThrow(/whole number/);
    expect(() => analyseStrategy([leg({})], { ...ASSUMPTIONS, spot: '0' })).toThrow(/above zero/);
  });

  it('carries the education disclaimer on every report', () => {
    expect(analyseStrategy([leg({})], ASSUMPTIONS).disclaimer).toContain('not investment advice');
  });
});

describe('templates', () => {
  it('builds every template without throwing', () => {
    for (const template of STRATEGY_TEMPLATES) {
      const built = buildTemplate({
        template: template.id,
        spot: '24000',
        strikeStep: '50',
        lotSize: 75,
        lots: 1,
        expiry: '2026-10-29',
        farExpiry: '2026-11-26',
        asOf: '2026-09-19',
        impliedVolatilityPercent: '14',
      });
      expect(built.legs.length).toBe(template.legs.length);
      expect(built.note).toContain('not quotes');
      expect(() => analyseStrategy(built.legs, built.assumptions)).not.toThrow();
    }
  });

  it('puts the iron condor wings where they belong and keeps the risk defined', () => {
    const built = buildTemplate({
      template: 'IRON_CONDOR',
      spot: '24013',
      strikeStep: '50',
      lotSize: 75,
      lots: 1,
      expiry: '2026-10-29',
      farExpiry: null,
      asOf: '2026-09-19',
      impliedVolatilityPercent: '14',
    });
    // Spot rounds to the 24000 strike; the wings sit two and four steps either side.
    expect(built.legs.map((l) => l.strike)).toEqual(['23800.00', '23900.00', '24100.00', '24200.00']);
    const report = analyseStrategy(built.legs, built.assumptions);
    expect(report.maxProfit.unlimited).toBe(false);
    expect(report.maxLoss.unlimited).toBe(false);
    expect(report.breakevens).toHaveLength(2);
    // The credit received is the most it can make; the wing width less the credit the most it loses.
    expect(Number(report.maxProfit.amount)).toBeCloseTo(Number(report.netCashflow), 2);
  });

  it('refuses a calendar without a second expiry', () => {
    expect(() =>
      buildTemplate({
        template: 'CALENDAR_CALL',
        spot: '24000',
        strikeStep: '50',
        lotSize: 75,
        lots: 1,
        expiry: '2026-10-29',
        farExpiry: null,
        asOf: '2026-09-19',
        impliedVolatilityPercent: '14',
      }),
    ).toThrow(/later expiry/);
  });
});

describe('futures calculator', () => {
  const input = {
    underlying: 'NIFTY',
    segment: 'INDEX_FUTURES' as const,
    exchange: 'NFO' as const,
    date: '2026-09-19',
    lots: 2,
    lotSize: 75,
    futuresPrice: '24100',
    spot: '24000',
    side: 'BUY' as const,
    expiry: '2026-10-29',
    markPrice: '24150',
    marginPercentOfNotional: '12',
    rollover: { nearPrice: '24100', farPrice: '24160' },
  };

  it('works out notional, MTM and basis', () => {
    const result = calculateFutures(input);
    expect(result.quantity).toBe(150);
    expect(result.notional).toBe('3615000.00');
    expect(result.mtmPerPoint).toBe('150.00');
    expect(result.mtm).toBe('7500.00');
    expect(result.basis).toBe('100.00');
    expect(result.daysToExpiry).toBe(40);
    // 100/24000 over 40 days, annualised on ACT/365.
    expect(Number(result.annualisedBasisPercent)).toBeCloseTo(3.802, 2);
    expect(result.margin.total).toBe('433800.00');
  });

  it('flips the MTM and the roll cost for a short', () => {
    const short = calculateFutures({ ...input, side: 'SELL' });
    expect(short.mtm).toBe('-7500.00');
    expect(short.mtmPerPoint).toBe('-150.00');
    // A long pays the 60-point spread to roll up; a short receives it.
    expect(Number(short.rollover?.spreadCost)).toBeLessThan(0);
    expect(Number(calculateFutures(input).rollover?.spreadCost)).toBeGreaterThan(0);
  });

  it('charges the roll through the Phase 11 statutory engine', () => {
    const result = calculateFutures(input);
    expect(Number(result.rollover?.charges.stt)).toBeGreaterThan(0);
    expect(Number(result.rollover?.charges.total)).toBeGreaterThan(0);
    expect(result.rollover?.charges.source).toBe('ESTIMATED');
    expect(Number(result.rollover?.total)).toBeCloseTo(Number(result.rollover?.spreadCost) + Number(result.rollover?.charges.total), 2);
  });

  it('leaves the basis annualisation out when there is no expiry', () => {
    expect(calculateFutures({ ...input, expiry: null }).annualisedBasisPercent).toBeNull();
  });
});

describe('position sizing', () => {
  it('sizes by a fraction of capital', () => {
    const result = calculateSizing({
      capital: '500000',
      riskPercent: '1',
      riskAmount: null,
      entryPrice: '1000',
      stopPrice: '980',
      lotSize: 1,
      targetPrice: '1060',
    });
    expect(result.method).toBe('FIXED_FRACTIONAL');
    expect(result.riskPerTrade).toBe('5000.00');
    expect(result.quantity).toBe(250);
    expect(result.riskAtStop).toBe('5000.00');
    expect(result.rewardToRisk).toBe('3.00');
  });

  it('floors to whole lots and says when one lot is already too big', () => {
    const result = calculateSizing({
      capital: '200000',
      riskPercent: '1',
      riskAmount: null,
      entryPrice: '24000',
      stopPrice: '23900',
      lotSize: 75,
      targetPrice: null,
    });
    expect(result.quantity).toBe(0);
    expect(result.lots).toBe(0);
    expect(result.notes.join(' ')).toContain('already too big');
  });

  it('takes a flat risk amount and reports the implied percentage', () => {
    const result = calculateSizing({
      capital: '1000000',
      riskPercent: '5',
      riskAmount: '2500',
      entryPrice: '500',
      stopPrice: '490',
      lotSize: 1,
      targetPrice: null,
    });
    expect(result.method).toBe('FIXED_RISK');
    expect(result.riskPercentOfCapital).toBe('0.25');
    expect(result.quantity).toBe(250);
  });

  it('warns when the position needs leverage', () => {
    const result = calculateSizing({
      capital: '100000',
      riskPercent: '2',
      riskAmount: null,
      entryPrice: '1000',
      stopPrice: '999',
      lotSize: 1,
      targetPrice: null,
    });
    expect(result.notes.join(' ')).toContain('leverage');
  });

  it('refuses a stop sitting on the entry', () => {
    expect(() =>
      calculateSizing({ capital: '100000', riskPercent: '1', riskAmount: null, entryPrice: '100', stopPrice: '100', lotSize: 1, targetPrice: null }),
    ).toThrow(/away from the entry/);
  });
});

describe('risk of ruin', () => {
  const input = { winRatePercent: '50', payoffRatio: '2', riskPercent: '2', ruinDrawdownPercent: '100' };

  it('is negligible for a good edge at small size', () => {
    const result = riskOfRuin(input);
    expect(Number(result.expectancyR)).toBeCloseTo(0.5, 6);
    expect(Number(result.percent)).toBeLessThan(0.01);
    expect(result.unitsOfRisk).toBe('50.00');
  });

  it('rises sharply with position size', () => {
    const small = Number(riskOfRuin({ ...input, riskPercent: '1' }).percent);
    const medium = Number(riskOfRuin({ ...input, riskPercent: '10' }).percent);
    const large = Number(riskOfRuin({ ...input, riskPercent: '25' }).percent);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it('is certain when the edge is negative', () => {
    expect(riskOfRuin({ ...input, winRatePercent: '30', payoffRatio: '1' }).percent).toBe('100.000000');
  });

  it('matches the coin-flip closed form', () => {
    // Even money, 60% win rate, one unit a bet, 10 units of capital: classical gambler's ruin
    // gives (q/p)^N = (0.4/0.6)^10.
    const result = riskOfRuin({ winRatePercent: '60', payoffRatio: '1', riskPercent: '10', ruinDrawdownPercent: '100' });
    expect(Number(result.percent) / 100).toBeCloseTo(Math.pow(0.4 / 0.6, 10), 8);
  });

  it('explains Kelly and warns about it', () => {
    const kelly = kellyExplainer(50, 2);
    expect(kelly.fullKellyPercent).toBe('25.00');
    expect(kelly.halfKellyPercent).toBe('12.50');
    expect(kelly.quarterKellyPercent).toBe('6.25');
    expect(kelly.warning).toContain('not a size to trade');
    expect(kellyExplainer(30, 1).warning).toContain('negative expectancy');
  });

  it('rejects impossible inputs', () => {
    expect(() => riskOfRuin({ ...input, winRatePercent: '120' })).toThrow(/between 0 and 100/);
    expect(() => riskOfRuin({ ...input, payoffRatio: '0' })).toThrow(/above zero/);
    expect(() => riskOfRuin({ ...input, riskPercent: '0' })).toThrow(/between 0 and 100/);
  });
});
