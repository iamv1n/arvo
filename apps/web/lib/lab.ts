'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/*
 * The Strategy Lab's types and queries.
 *
 * They live here rather than in lib/types.ts and lib/queries.ts because the lab is a whole
 * area with a surface of its own, and half of it is stateless: a payoff or a Greek is a
 * mutation in React Query terms (a POST with a body) even though it changes nothing on the
 * server. That is the honest mapping — it is a request whose result depends on a form, not a
 * cache entry keyed by a URL.
 */

// ---- option structures ----

export type LegKind = 'CALL' | 'PUT' | 'FUTURE' | 'UNDERLYING';
export type LegAction = 'BUY' | 'SELL';

export interface StrategyLeg {
  kind: LegKind;
  action: LegAction;
  lots: number;
  lotSize: number;
  strike: string | null;
  premium: string;
  expiry: string | null;
  impliedVolatilityPercent: string | null;
  label: string | null;
}

export interface MarketAssumptions {
  spot: string;
  asOf: string;
  riskFreeRatePercent: string;
  dividendYieldPercent: string;
  impliedVolatilityPercent: string;
}

export interface Greeks {
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  rho: string;
}

export interface LegAnalysis {
  index: number;
  label: string;
  kind: LegKind;
  action: LegAction;
  lots: number;
  lotSize: number;
  quantity: number;
  strike: string | null;
  expiry: string | null;
  timeToExpiryYears: string;
  impliedVolatilityPercent: string;
  premium: string;
  theoreticalValue: string | null;
  unrealisedByModel: string | null;
  cashflow: string;
  greeks: Greeks;
}

export interface PayoffPoint {
  spot: string;
  atExpiry: string;
  today: string | null;
}

export interface PayoffExtreme {
  amount: string | null;
  unlimited: boolean;
  atSpot: string | null;
}

export interface MarginEstimate {
  total: string;
  premiumDebit: string;
  shortLegMargin: string;
  hedgeCredit: string;
  shortNotional: string;
  method: string;
  disclaimer: string;
}

export interface ProbabilityEstimate {
  percent: string;
  method: string;
  caveat: string;
}

export interface PayoffReport {
  assumptions: MarketAssumptions;
  legs: LegAnalysis[];
  netCashflow: string;
  netGreeks: Greeks;
  breakevens: string[];
  maxProfit: PayoffExtreme;
  maxLoss: PayoffExtreme;
  series: PayoffPoint[];
  range: { low: string; high: string };
  probabilityOfProfit: ProbabilityEstimate | null;
  margin: MarginEstimate;
  disclaimer: string;
}

export interface StrategyTemplate {
  id: string;
  name: string;
  outlook: 'DIRECTIONAL_UP' | 'DIRECTIONAL_DOWN' | 'RANGE_BOUND' | 'VOLATILITY_UP' | 'HEDGE';
  summary: string;
  needsFarExpiry: boolean;
  libraryslug: string;
}

export interface ImpliedVolatilityReport {
  impliedVolatilityPercent: string | null;
  status: string;
  message: string;
  iterations: number;
  residual: string;
  daysToExpiry: number;
  intrinsicValue: string;
  timeValue: string;
  greeks: Greeks | null;
  method: string;
  disclaimer: string;
}

// ---- calculators ----

export interface ChargeBreakdown {
  brokerage: string;
  stt: string;
  exchangeCharges: string;
  sebiCharges: string;
  stampDuty: string;
  gst: string;
  dpCharges: string;
  otherCharges: string;
  total: string;
  source: string;
}

export interface FuturesCalculation {
  underlying: string;
  lots: number;
  lotSize: number;
  quantity: number;
  futuresPrice: string;
  spot: string;
  notional: string;
  mtmPerPoint: string;
  mtm: string | null;
  margin: MarginEstimate;
  basis: string;
  basisPercent: string;
  annualisedBasisPercent: string | null;
  daysToExpiry: number | null;
  rollover: { nearPrice: string; farPrice: string; spread: string; spreadCost: string; charges: ChargeBreakdown; total: string } | null;
  roundTripCharges: ChargeBreakdown;
  disclaimer: string;
}

export interface SizingResult {
  method: 'FIXED_FRACTIONAL' | 'FIXED_RISK';
  capital: string;
  riskPerTrade: string;
  riskPercentOfCapital: string;
  stopDistance: string;
  quantity: number;
  lots: number;
  positionValue: string;
  exposurePercent: string;
  riskAtStop: string;
  rewardToRisk: string | null;
  notes: string[];
  disclaimer: string;
}

export interface RiskOfRuinResult {
  percent: string;
  expectancyR: string;
  unitsOfRisk: string;
  kelly: { fullKellyPercent: string; halfKellyPercent: string; quarterKellyPercent: string; warning: string };
  method: string;
  disclaimer: string;
}

// ---- backtests ----

export type BarTimeframe = 'DAY' | 'MINUTE';

export interface BacktestStats {
  startingCapital: string;
  endingCapital: string;
  netPnl: string;
  returnPercent: string;
  cagrPercent: string | null;
  maxDrawdownPercent: string;
  maxDrawdownAmount: string;
  sharpe: string | null;
  trades: number;
  wins: number;
  losses: number;
  winRatePercent: string;
  averageWin: string;
  averageLoss: string;
  expectancy: string;
  profitFactor: string | null;
  totalCharges: string;
  chargesPercentOfGross: string | null;
  exposurePercent: string;
  averageBarsHeld: string;
  from: string | null;
  to: string | null;
  bars: number;
}

export interface BacktestTrade {
  number: number;
  direction: 'LONG' | 'SHORT';
  entryDate: string;
  entryTime: string | null;
  entryPrice: string;
  exitDate: string;
  exitTime: string | null;
  exitPrice: string;
  quantity: number;
  reason: string;
  grossPnl: string;
  charges: ChargeBreakdown;
  netPnl: string;
  rMultiple: string | null;
  barsHeld: number;
  equityAfter: string;
}

export interface BacktestResult {
  spec: StrategySpec;
  stats: BacktestStats;
  trades: BacktestTrade[];
  equityCurve: { date: string; equity: string; drawdownPercent: string }[];
  perYear: { year: string; trades: number; netPnl: string; winRatePercent: string; returnPercent: string }[];
  walkForward: { splitPercent: string; splitDate: string; inSample: BacktestStats; outOfSample: BacktestStats; verdict: string } | null;
  overfittingWarning: string | null;
  assumptions: string[];
  disclaimer: string;
  elapsedMs: number;
}

export interface BacktestSummary {
  id: string;
  strategyId: string | null;
  name: string;
  symbol: string;
  timeframe: BarTimeframe;
  from: string | null;
  to: string | null;
  stats: BacktestStats;
  overfittingWarning: string | null;
  createdAt: string;
}

export type IndicatorKind =
  | 'SMA'
  | 'EMA'
  | 'RSI'
  | 'MACD'
  | 'VWAP'
  | 'ATR'
  | 'BOLLINGER'
  | 'SUPERTREND'
  | 'PREV_DAY_HIGH'
  | 'PREV_DAY_LOW'
  | 'PREV_DAY_CLOSE'
  | 'OPENING_RANGE_HIGH'
  | 'OPENING_RANGE_LOW';

export type Operand =
  | { type: 'PRICE'; field: 'OPEN' | 'HIGH' | 'LOW' | 'CLOSE' | 'VOLUME' }
  | { type: 'INDICATOR'; indicator: { kind: IndicatorKind; period?: number; multiplier?: number; output?: string } }
  | { type: 'CONSTANT'; value: number };

export type CompareOp = 'GT' | 'GTE' | 'LT' | 'LTE' | 'CROSSES_ABOVE' | 'CROSSES_BELOW';

export type Condition =
  | { type: 'AND'; operands: Condition[] }
  | { type: 'OR'; operands: Condition[] }
  | { type: 'COMPARE'; left: Operand; op: CompareOp; right: Operand }
  | { type: 'TIME_AFTER'; time: string }
  | { type: 'TIME_BEFORE'; time: string }
  | { type: 'ALWAYS' };

export interface ExitRule {
  type: 'PERCENT' | 'POINTS' | 'ATR';
  value: number;
  period?: number;
}

export interface StrategySpec {
  name: string;
  symbol: string;
  timeframe: BarTimeframe;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  startingCapital: string;
  entry: Condition;
  exit: Condition | null;
  stopLoss: ExitRule | null;
  target: ExitRule | null;
  trailingStop: ExitRule | null;
  maxBarsInTrade: number | null;
  intradaySquareOffTime: string | null;
  maxPositions: number;
  sizing: { method: 'FIXED_QUANTITY' | 'FIXED_RISK' | 'FIXED_FRACTIONAL'; quantity?: number; percent?: number; lotSize: number };
  execution: {
    fill: 'NEXT_BAR_OPEN' | 'SAME_BAR_CLOSE';
    slippageType: 'POINTS' | 'BPS';
    slippage: number;
    segment: string;
    exchange: string;
    broker: string;
  };
}

export interface SavedStrategy {
  id: string;
  name: string;
  description: string | null;
  spec: StrategySpec;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---- market data ----

export interface BarSeries {
  symbol: string;
  timeframe: BarTimeframe;
  bars: number;
  from: string;
  to: string;
}

export interface Bar {
  date: string;
  time: string | null;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BarImportBatch {
  id: string;
  filename: string;
  symbol: string;
  timeframe: BarTimeframe;
  status: 'READY' | 'COMMITTED' | 'FAILED';
  rowCount: number;
  warnings: string[];
  error: string | null;
  from: string | null;
  to: string | null;
  createdAt: string;
}

// ---- paper trading ----

export interface PaperAccount {
  id: string;
  name: string;
  startingCapital: string;
  cash: string;
  createdAt: string;
}

export interface PaperOrder {
  id: string;
  accountId: string;
  symbol: string;
  timeframe: BarTimeframe;
  side: 'BUY' | 'SELL';
  quantity: string;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice: string | null;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  placedDate: string;
  placedTime: string | null;
  filledDate: string | null;
  filledTime: string | null;
  fillPrice: string | null;
  message: string | null;
}

export interface PaperPosition {
  symbol: string;
  quantity: number;
  averagePrice: string;
  lastPrice: string | null;
  lastPriceDate: string | null;
  unrealisedPnl: string | null;
  realisedPnl: string;
}

export interface PaperAccountView {
  account: PaperAccount;
  positions: PaperPosition[];
  orders: PaperOrder[];
  equity: string;
  totalPnl: string;
  realisedPnl: string;
  unrealisedPnl: string | null;
  charges: string;
  disclaimer: string;
}

// ---- library ----

export interface LibraryIndexEntry {
  slug: string;
  title: string;
  category: 'OPTION_STRUCTURE' | 'RISK' | 'METHOD';
  summary: string;
  readingMinutes: number;
  templates: string[];
}

export interface LibraryEntry extends LibraryIndexEntry {
  markdown: string;
}

// ---- queries ----

export const labKeys = {
  all: ['lab'] as const,
  templates: ['lab', 'templates'] as const,
  library: ['lab', 'library'] as const,
  strategies: ['lab', 'strategies'] as const,
  backtests: ['lab', 'backtests'] as const,
  series: ['lab', 'series'] as const,
  barImports: ['lab', 'bar-imports'] as const,
  paper: ['lab', 'paper'] as const,
};

export const useTemplates = () =>
  useQuery({
    queryKey: labKeys.templates,
    queryFn: () => api<{ templates: StrategyTemplate[]; disclaimer: string }>('/lab/templates'),
    staleTime: Infinity,
  });

export const useLibrary = () =>
  useQuery({
    queryKey: labKeys.library,
    queryFn: () => api<{ entries: LibraryIndexEntry[]; disclaimer: string }>('/lab/library'),
    staleTime: Infinity,
  });

export const useLibraryEntry = (slug: string | null) =>
  useQuery({
    queryKey: [...labKeys.library, slug],
    queryFn: () => api<{ entry: LibraryEntry }>(`/lab/library/${slug as string}`),
    enabled: Boolean(slug),
    staleTime: Infinity,
  });

export const useStrategies = () =>
  useQuery({ queryKey: labKeys.strategies, queryFn: () => api<{ items: SavedStrategy[] }>('/lab/strategies').then((r) => r.items) });

export const useBacktests = () =>
  useQuery({ queryKey: labKeys.backtests, queryFn: () => api<{ items: BacktestSummary[] }>('/lab/backtests').then((r) => r.items) });

export const useBacktest = (id: string | null) =>
  useQuery({
    queryKey: [...labKeys.backtests, id],
    queryFn: () => api<{ id: string; result: BacktestResult }>(`/lab/backtests/${id as string}`),
    enabled: Boolean(id),
  });

export const useBarSeries = () =>
  useQuery({ queryKey: labKeys.series, queryFn: () => api<{ series: BarSeries[] }>('/lab/market-data').then((r) => r.series) });

export const useBarImports = () =>
  useQuery({ queryKey: labKeys.barImports, queryFn: () => api<{ items: BarImportBatch[] }>('/lab/market-data/imports').then((r) => r.items) });

export const useBarImport = (id: string | null) =>
  useQuery({
    queryKey: [...labKeys.barImports, id],
    queryFn: () => api<{ batch: BarImportBatch; head: Bar[]; tail: Bar[] }>(`/lab/market-data/imports/${id as string}`),
    enabled: Boolean(id),
  });

export const usePaperAccounts = () =>
  useQuery({ queryKey: labKeys.paper, queryFn: () => api<{ items: PaperAccount[] }>('/lab/paper').then((r) => r.items) });

export const usePaperAccount = (id: string | null) =>
  useQuery({
    queryKey: [...labKeys.paper, id],
    queryFn: () => api<PaperAccountView>(`/lab/paper/${id as string}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

/** Any lab write refreshes every lab query; the area is small enough that this is cheaper than
 *  keeping a precise dependency map correct. */
export function useLabMutation<TInput, TResult = unknown>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labKeys.all }),
  });
}

/** A stateless compute: a POST whose result belongs to the form, not to a cache. */
export function useCompute<TBody, TResult>(path: string) {
  return useMutation({ mutationFn: (body: TBody) => api<TResult>(path, { method: 'POST', body }) });
}
