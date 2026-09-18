import { DomainError } from '../errors';
import { formatMoney, parseMoney } from '../money';
import type { FinanceStore } from '../ports';
import { requireCurrency, requireDate } from '../services/validation';
import { capitalGains, type CapitalGainsConfig, type CapitalGainsResult } from './capital-gains';
import { projectGoals, type GoalProjection } from './goal-projection';
import { rebalance, type RebalanceResult, type RebalanceTarget } from './rebalance';
import type { AssetClass, HoldingRecord, MarketCap } from './types';
import { buildPositions, mergeCashflows, mulDiv, positionCashflows, type Position } from './valuation';
import { xirrPercent, type Cashflow } from './xirr';

/*
 * Read-only portfolio analytics. Every figure is derived from the user's own holdings and
 * their event log, for a stated asOf date, so any report can be reproduced exactly.
 *
 * Advice level 0–2 throughout: this module describes, compares and simulates. It never
 * recommends a trade.
 */

export const PORTFOLIO_DISCLAIMER =
  'Information, not advice. Everything here is computed from the records you entered or imported.';

/** Warn when one holding is more than this share of the portfolio. */
export const CONCENTRATION_WARN_PERCENT = 25;
/** Warn when the top N holdings together are more than this share. */
export const TOP_N_CONCENTRATION = 5;
export const TOP_N_WARN_PERCENT = 60;

export interface HoldingSummary {
  id: string;
  name: string;
  kind: HoldingRecord['kind'];
  assetClass: AssetClass;
  currency: string;
  amc: string | null;
  sector: string | null;
  marketCap: MarketCap | null;
  plan: HoldingRecord['plan'];
  goalId: string | null;
  units: string;
  invested: string;
  withdrawn: string;
  income: string;
  costBasis: string;
  price: string | null;
  priceDate: string | null;
  value: string;
  valueSource: Position['valueSource'];
  unrealisedGain: string;
  /** unrealisedGain ÷ costBasis × 100, one decimal; null when there is no cost. */
  absoluteReturnPercent: number | null;
  xirrPercent: number | null;
  percentOfPortfolio: number;
  warnings: string[];
}

export interface PortfolioSummary {
  asOf: string;
  currency: string;
  /** Money still at stake: invested − withdrawn − income received. */
  netInvested: string;
  totalInvested: string;
  totalWithdrawn: string;
  totalIncome: string;
  currentValue: string;
  totalGain: string;
  absoluteReturnPercent: number | null;
  xirrPercent: number | null;
  holdingCount: number;
  /** Holdings with no usable price, so their value is cost or a stated figure. */
  stalePriceCount: number;
  topHoldings: HoldingSummary[];
  byAssetClass: AllocationSlice[];
  disclaimer: string;
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: string;
  percent: number;
  holdingCount: number;
}

export interface AllocationResult {
  asOf: string;
  currency: string;
  totalValue: string;
  assetClass: AllocationSlice[];
  marketCap: AllocationSlice[];
  sector: AllocationSlice[];
  amc: AllocationSlice[];
  holdings: AllocationSlice[];
  concentration: {
    topHoldingPercent: number;
    topNPercent: number;
    topN: number;
    warnings: string[];
  };
  costDrag: CostDragResult;
  disclaimer: string;
}

export interface CostDragResult {
  /** Annual expense-ratio cost across holdings with a stated ratio. */
  annualCost: string;
  /** Extra annual cost of regular plans versus their direct equivalents. */
  regularPlanExtraCost: string;
  rows: {
    holdingId: string;
    holdingName: string;
    value: string;
    expenseRatio: string;
    annualCost: string;
    plan: HoldingRecord['plan'];
    directExpenseRatio: string | null;
    extraVersusDirect: string | null;
  }[];
  /** Holdings with no expense ratio entered, so they are missing from the total. */
  missingExpenseRatio: number;
  note: string;
}

export interface ReturnsResult {
  asOf: string;
  currency: string;
  netInvested: string;
  currentValue: string;
  totalGain: string;
  absoluteReturnPercent: number | null;
  xirrPercent: number | null;
  byAssetClass: { assetClass: AssetClass; value: string; netInvested: string; xirrPercent: number | null; absoluteReturnPercent: number | null }[];
  byHolding: { holdingId: string; holdingName: string; value: string; netInvested: string; xirrPercent: number | null; absoluteReturnPercent: number | null }[];
  benchmark: BenchmarkComparison | null;
  availableBenchmarks: string[];
  disclaimer: string;
}

export interface BenchmarkComparison {
  series: string;
  /** What the same cashflows would be worth in the index today. */
  value: string;
  xirrPercent: number | null;
  /** Portfolio XIRR minus benchmark XIRR, in percentage points. */
  differencePercent: number | null;
  from: string;
  to: string;
  warnings: string[];
  note: string;
}

export interface OverlapResult {
  asOf: string;
  currency: string;
  /** Pairs of funds whose disclosures the user imported. */
  pairs: {
    aHoldingId: string;
    aName: string;
    bHoldingId: string;
    bName: string;
    /** Sum of the smaller weight of each common stock, one decimal. */
    overlapPercent: number;
    commonCount: number;
    topCommon: { name: string; aWeight: string; bWeight: string }[];
  }[];
  /** Funds with no disclosure imported, so they are not in any pair. */
  missingDisclosures: { holdingId: string; name: string }[];
  note: string;
}

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  EQUITY: 'Equity',
  DEBT: 'Debt',
  GOLD: 'Gold',
  REAL_ESTATE: 'Real estate',
  CASH: 'Cash',
  OTHER: 'Other',
};

export class PortfolioService {
  constructor(private readonly store: FinanceStore) {}

  /** Positions for a date, plus the base currency filter. Shared by every report below. */
  private async positions(userId: string, input: { asOf: string; currency: string }): Promise<{ asOf: string; currency: string; positions: Position[] }> {
    const asOf = requireDate('asOf', input.asOf);
    const currency = requireCurrency(input.currency);
    const [holdings, transactions] = await Promise.all([
      this.store.holdings.findAll(userId),
      this.store.holdingTransactions.findAll(userId),
    ]);
    const positions = buildPositions(
      holdings.filter((h) => h.currency === currency),
      transactions,
      asOf,
    );
    return { asOf, currency, positions };
  }

  async summary(userId: string, input: { asOf: string; currency: string }): Promise<PortfolioSummary> {
    const { asOf, currency, positions } = await this.positions(userId, input);
    const live = positions.filter((p) => p.value > 0n || p.invested > 0n);
    const totalValue = sumBy(live, (p) => p.value);
    const rows = live.map((p) => toSummary(p, totalValue)).sort((a, b) => Number(b.value) - Number(a.value));

    const invested = sumBy(live, (p) => p.invested);
    const withdrawn = sumBy(live, (p) => p.withdrawn);
    const income = sumBy(live, (p) => p.income);
    const netInvested = invested - withdrawn - income;
    const gain = totalValue - netInvested;

    return {
      asOf,
      currency,
      netInvested: formatMoney(netInvested),
      totalInvested: formatMoney(invested),
      totalWithdrawn: formatMoney(withdrawn),
      totalIncome: formatMoney(income),
      currentValue: formatMoney(totalValue),
      totalGain: formatMoney(gain),
      absoluteReturnPercent: percentChange(gain, netInvested),
      xirrPercent: xirrPercent(mergeCashflows(live)),
      holdingCount: live.length,
      stalePriceCount: live.filter((p) => p.valueSource === 'COST' && p.units > 0n).length,
      topHoldings: rows.slice(0, 10),
      byAssetClass: slices(live, totalValue, (p) => p.holding.assetClass, (key) => ASSET_CLASS_LABELS[key as AssetClass] ?? key),
      disclaimer: PORTFOLIO_DISCLAIMER,
    };
  }

  async allocation(userId: string, input: { asOf: string; currency: string }): Promise<AllocationResult> {
    const { asOf, currency, positions } = await this.positions(userId, input);
    const live = positions.filter((p) => p.value > 0n);
    const totalValue = sumBy(live, (p) => p.value);

    const holdings = slices(live, totalValue, (p) => p.holding.id, (_key, members) => members[0].holding.name);
    const topHoldingPercent = holdings[0]?.percent ?? 0;
    const topNPercent = Math.round(holdings.slice(0, TOP_N_CONCENTRATION).reduce((sum, s) => sum + s.percent, 0) * 10) / 10;
    const warnings: string[] = [];
    if (topHoldingPercent > CONCENTRATION_WARN_PERCENT) {
      warnings.push(`${holdings[0].label} is ${topHoldingPercent}% of the portfolio, above the ${CONCENTRATION_WARN_PERCENT}% single-holding mark`);
    }
    if (topNPercent > TOP_N_WARN_PERCENT && holdings.length > TOP_N_CONCENTRATION) {
      warnings.push(`The largest ${TOP_N_CONCENTRATION} holdings are ${topNPercent}% of the portfolio`);
    }

    return {
      asOf,
      currency,
      totalValue: formatMoney(totalValue),
      assetClass: slices(live, totalValue, (p) => p.holding.assetClass, (key) => ASSET_CLASS_LABELS[key as AssetClass] ?? key),
      marketCap: slices(
        live.filter((p) => p.holding.marketCap !== null),
        totalValue,
        (p) => p.holding.marketCap as string,
        (key) => ({ LARGE: 'Large cap', MID: 'Mid cap', SMALL: 'Small cap' })[key as MarketCap] ?? key,
      ),
      sector: slices(live.filter((p) => p.holding.sector !== null), totalValue, (p) => p.holding.sector as string, (key) => key),
      amc: slices(live.filter((p) => p.holding.amc !== null), totalValue, (p) => p.holding.amc as string, (key) => key),
      holdings,
      concentration: { topHoldingPercent, topNPercent, topN: TOP_N_CONCENTRATION, warnings },
      costDrag: costDrag(live),
      disclaimer: PORTFOLIO_DISCLAIMER,
    };
  }

  async returns(userId: string, input: { asOf: string; currency: string; benchmark?: string }): Promise<ReturnsResult> {
    const { asOf, currency, positions } = await this.positions(userId, input);
    const live = positions.filter((p) => p.value > 0n || p.invested > 0n);
    const totalValue = sumBy(live, (p) => p.value);
    const netInvested = sumBy(live, (p) => p.netInvested);
    const gain = totalValue - netInvested;

    const classes = new Map<AssetClass, Position[]>();
    for (const position of live) {
      const list = classes.get(position.holding.assetClass);
      if (list) list.push(position);
      else classes.set(position.holding.assetClass, [position]);
    }

    const series = await this.store.portfolioData.listBenchmarkSeries(userId);
    const benchmarkName = input.benchmark ?? series[0]?.series;
    const benchmark = benchmarkName ? await this.compareWithBenchmark(userId, benchmarkName, live, asOf) : null;
    const portfolioXirr = xirrPercent(mergeCashflows(live));

    return {
      asOf,
      currency,
      netInvested: formatMoney(netInvested),
      currentValue: formatMoney(totalValue),
      totalGain: formatMoney(gain),
      absoluteReturnPercent: percentChange(gain, netInvested),
      xirrPercent: portfolioXirr,
      byAssetClass: [...classes.entries()]
        .map(([assetClass, members]) => {
          const value = sumBy(members, (p) => p.value);
          const net = sumBy(members, (p) => p.netInvested);
          return {
            assetClass,
            value: formatMoney(value),
            netInvested: formatMoney(net),
            xirrPercent: xirrPercent(mergeCashflows(members)),
            absoluteReturnPercent: percentChange(value - net, net),
          };
        })
        .sort((a, b) => Number(b.value) - Number(a.value)),
      byHolding: live
        .map((p) => ({
          holdingId: p.holding.id,
          holdingName: p.holding.name,
          value: formatMoney(p.value),
          netInvested: formatMoney(p.netInvested),
          xirrPercent: xirrPercent(positionCashflows(p)),
          absoluteReturnPercent: percentChange(p.unrealisedGain, p.costBasis),
        }))
        .sort((a, b) => Number(b.value) - Number(a.value)),
      benchmark:
        benchmark && portfolioXirr !== null && benchmark.xirrPercent !== null
          ? { ...benchmark, differencePercent: Math.round((portfolioXirr - benchmark.xirrPercent) * 100) / 100 }
          : benchmark,
      availableBenchmarks: series.map((s) => s.series),
      disclaimer: PORTFOLIO_DISCLAIMER,
    };
  }

  /**
   * "What if the same money had gone into the index instead?" Each investment buys index
   * units at that day's level and each redemption sells them, so the comparison faces the
   * same timing the investor faced — not a lump sum on day one.
   */
  private async compareWithBenchmark(userId: string, series: string, positions: Position[], asOf: string): Promise<BenchmarkComparison | null> {
    const points = await this.store.portfolioData.findBenchmarkPoints(userId, series);
    if (points.length === 0) return null;
    const levels = points.map((p) => ({ date: p.date, value: parseMoney(p.value) })).sort((a, b) => a.date.localeCompare(b.date));

    const flows = mergeCashflows(positions, false);
    const warnings: string[] = [];
    let units = 0n;
    const replicated: Cashflow[] = [];

    for (const flow of flows) {
      const level = levelOn(levels, flow.date);
      if (level === null) {
        warnings.push(`No ${series} level on or before ${flow.date}; that cashflow was left out`);
        continue;
      }
      const amount = parseMoney(flow.amount);
      // amount is negative when investing: buying index units.
      units += mulDiv(-amount, 100000n, level);
      if (units < 0n) units = 0n;
      replicated.push(flow);
    }

    const finalLevel = levelOn(levels, asOf);
    if (finalLevel === null || replicated.length === 0) return null;
    const value = mulDiv(units, finalLevel, 100000n);
    replicated.push({ date: asOf, amount: formatMoney(value) });

    return {
      series,
      value: formatMoney(value),
      xirrPercent: xirrPercent(replicated),
      differencePercent: null,
      from: levels[0].date,
      to: levels[levels.length - 1].date,
      warnings,
      note: 'The same cashflows on the same dates, invested in this index instead. Index levels come from the file you imported; TRI series include dividends, price series do not.',
    };
  }

  async capitalGains(
    userId: string,
    input: { asOf: string; currency: string; financialYear?: string; config?: Partial<CapitalGainsConfig> },
  ): Promise<CapitalGainsResult> {
    const { asOf, currency, positions } = await this.positions(userId, input);
    return capitalGains(positions, { asOf, currency, financialYear: input.financialYear, config: input.config });
  }

  async rebalance(
    userId: string,
    input: { asOf: string; currency: string; targets: RebalanceTarget[]; driftBandPercent?: number },
  ): Promise<RebalanceResult> {
    const { asOf, currency, positions } = await this.positions(userId, input);
    return rebalance(positions, { asOf, currency, targets: input.targets, driftBandPercent: input.driftBandPercent });
  }

  async goalProjection(
    userId: string,
    input: { asOf: string; currency: string; monthlyContributions?: Record<string, string> },
  ): Promise<{ asOf: string; currency: string; goals: GoalProjection[]; unmappedHoldings: number }> {
    const { asOf, currency, positions } = await this.positions(userId, input);
    const goals = await this.store.goals.findAll(userId);
    const projections = projectGoals(
      goals
        .filter((g) => g.currency === currency)
        .map((g) => ({
          id: g.id,
          name: g.name,
          targetAmount: g.targetAmount,
          targetDate: g.targetDate,
          currency: g.currency,
          monthlyContribution: input.monthlyContributions?.[g.id] ?? '0',
        })),
      positions,
      asOf,
    );
    return {
      asOf,
      currency,
      goals: projections.sort((a, b) => a.targetDate.localeCompare(b.targetDate)),
      unmappedHoldings: positions.filter((p) => p.value > 0n && p.holding.goalId === null).length,
    };
  }

  /**
   * Common stocks between every pair of funds whose portfolio disclosure the user imported.
   * Funds without a disclosure are listed separately rather than silently dropped.
   */
  async overlap(userId: string, input: { asOf: string; currency: string }): Promise<OverlapResult> {
    const { asOf, currency, positions } = await this.positions(userId, input);
    const funds = positions.filter((p) => p.value > 0n && (p.holding.kind === 'MUTUAL_FUND' || p.holding.kind === 'ETF'));
    const disclosures = new Map<string, { name: string; weight: number }[]>();
    const missing: { holdingId: string; name: string }[] = [];

    for (const fund of funds) {
      const rows = await this.store.portfolioData.findFundHoldings(userId, fund.holding.id);
      if (rows.length === 0) missing.push({ holdingId: fund.holding.id, name: fund.holding.name });
      else disclosures.set(fund.holding.id, rows.map((r) => ({ name: (r.isin ?? r.name).toUpperCase(), weight: Number(r.weight) })));
    }

    const ids = [...disclosures.keys()];
    const pairs: OverlapResult['pairs'] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = disclosures.get(ids[i])!;
        const b = new Map(disclosures.get(ids[j])!.map((r) => [r.name, r.weight]));
        const common = a
          .filter((row) => b.has(row.name))
          .map((row) => ({ name: row.name, aWeight: row.weight, bWeight: b.get(row.name)! }));
        const overlapPercent = Math.round(common.reduce((sum, row) => sum + Math.min(row.aWeight, row.bWeight), 0) * 10) / 10;
        pairs.push({
          aHoldingId: ids[i],
          aName: funds.find((f) => f.holding.id === ids[i])!.holding.name,
          bHoldingId: ids[j],
          bName: funds.find((f) => f.holding.id === ids[j])!.holding.name,
          overlapPercent,
          commonCount: common.length,
          topCommon: common
            .sort((x, y) => Math.min(y.aWeight, y.bWeight) - Math.min(x.aWeight, x.bWeight))
            .slice(0, 8)
            .map((row) => ({ name: row.name, aWeight: row.aWeight.toFixed(2), bWeight: row.bWeight.toFixed(2) })),
        });
      }
    }

    return {
      asOf,
      pairs: pairs.sort((a, b) => b.overlapPercent - a.overlapPercent),
      missingDisclosures: missing,
      currency,
      note:
        'Overlap is the sum of the smaller weight of each stock both funds hold, from the disclosure files you imported. Import a fund\'s monthly portfolio CSV to include it.',
    };
  }
}

/** Expense-ratio drag and the regular-versus-direct difference, both from user-entered ratios. */
export function costDrag(positions: Position[]): CostDragResult {
  const rows: CostDragResult['rows'] = [];
  let annualCost = 0n;
  let extra = 0n;
  let missing = 0;

  for (const position of positions) {
    const ratio = position.holding.expenseRatio;
    if (ratio === null) {
      if (position.holding.kind === 'MUTUAL_FUND' || position.holding.kind === 'ETF') missing++;
      continue;
    }
    const cost = percentOfMoney(position.value, ratio);
    annualCost += cost;
    const direct = position.holding.directExpenseRatio;
    const difference =
      position.holding.plan === 'REGULAR' && direct !== null ? percentOfMoney(position.value, formatMoney(parseMoney(ratio) - parseMoney(direct))) : null;
    if (difference !== null && difference > 0n) extra += difference;
    rows.push({
      holdingId: position.holding.id,
      holdingName: position.holding.name,
      value: formatMoney(position.value),
      expenseRatio: ratio,
      annualCost: formatMoney(cost),
      plan: position.holding.plan,
      directExpenseRatio: direct,
      extraVersusDirect: difference === null ? null : formatMoney(difference),
    });
  }

  return {
    annualCost: formatMoney(annualCost),
    regularPlanExtraCost: formatMoney(extra),
    rows: rows.sort((a, b) => Number(b.annualCost) - Number(a.annualCost)),
    missingExpenseRatio: missing,
    note: 'Expense ratios are the ones you entered. The annual cost is this year\'s value times the ratio; funds deduct it from NAV daily, so you never see it as a charge.',
  };
}

function toSummary(position: Position, totalValue: bigint): HoldingSummary {
  return {
    id: position.holding.id,
    name: position.holding.name,
    kind: position.holding.kind,
    assetClass: position.holding.assetClass,
    currency: position.holding.currency,
    amc: position.holding.amc,
    sector: position.holding.sector,
    marketCap: position.holding.marketCap,
    plan: position.holding.plan,
    goalId: position.holding.goalId,
    units: formatUnitsString(position.units),
    invested: formatMoney(position.invested),
    withdrawn: formatMoney(position.withdrawn),
    income: formatMoney(position.income),
    costBasis: formatMoney(position.costBasis),
    price: position.price === null ? null : formatMoney(position.price),
    priceDate: position.priceDate,
    value: formatMoney(position.value),
    valueSource: position.valueSource,
    unrealisedGain: formatMoney(position.unrealisedGain),
    absoluteReturnPercent: percentChange(position.unrealisedGain, position.costBasis),
    xirrPercent: xirrPercent(positionCashflows(position)),
    percentOfPortfolio: percentOf(position.value, totalValue),
    warnings: position.warnings,
  };
}

function slices(
  positions: Position[],
  totalValue: bigint,
  keyOf: (position: Position) => string,
  labelOf: (key: string, members: Position[]) => string,
): AllocationSlice[] {
  const groups = new Map<string, Position[]>();
  for (const position of positions) {
    const key = keyOf(position);
    const list = groups.get(key);
    if (list) list.push(position);
    else groups.set(key, [position]);
  }
  return [...groups.entries()]
    .map(([key, members]) => {
      const value = sumBy(members, (p) => p.value);
      return {
        key,
        label: labelOf(key, members),
        value: formatMoney(value),
        percent: percentOf(value, totalValue),
        holdingCount: members.length,
      };
    })
    .sort((a, b) => Number(b.value) - Number(a.value));
}

/** Nearest index level on or before `date`. */
function levelOn(levels: { date: string; value: bigint }[], date: string): bigint | null {
  let found: bigint | null = null;
  for (const level of levels) {
    if (level.date > date) break;
    found = level.value;
  }
  return found;
}

const sumBy = (positions: Position[], pick: (position: Position) => bigint) => positions.reduce((sum, p) => sum + pick(p), 0n);

function percentChange(gain: bigint, base: bigint): number | null {
  if (base <= 0n) return null;
  return percentOf(gain, base);
}

/** value ÷ total × 100 with two decimals, rounded half away from zero. */
function percentOf(value: bigint, total: bigint): number {
  if (total === 0n) return 0;
  const negative = (value < 0n) !== (total < 0n);
  const abs = (value < 0n ? -value : value) * 10_000n;
  const den = total < 0n ? -total : total;
  const scaled = (abs * 2n + den) / (2n * den);
  return Number(negative ? -scaled : scaled) / 100;
}

function percentOfMoney(amount: bigint, percent: string): bigint {
  const basisPoints = parseMoney(percent) / 100n;
  return (amount * basisPoints + 5000n) / 10000n;
}

function formatUnitsString(units: bigint): string {
  const abs = units < 0n ? -units : units;
  return `${units < 0n ? '-' : ''}${abs / 100000n}.${(abs % 100000n).toString().padStart(5, '0')}`;
}

export { DomainError };
