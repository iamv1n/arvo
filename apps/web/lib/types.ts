import type { AccountType, CategoryType, TransactionSource, TransactionStatus, TransactionType } from '@arvo/types';

/** Response shapes of the Arvo API. Amounts are signed decimal strings. */

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string;
  timezone: string;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  openingBalance: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  type: CategoryType;
  isSystem: boolean;
}

export interface Merchant {
  id: string;
  name: string;
  normalizedName: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  merchantId: string | null;
  categoryId: string | null;
  amount: string;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  source: TransactionSource;
  sourceReference: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Transfer {
  id: string;
  from: Transaction;
  to: Transaction;
  createdAt: string;
}

export interface CategorySpend {
  categoryId: string | null;
  name: string;
  parentId: string | null;
  parentName: string | null;
  amount: string;
  transactionCount: number;
}

export interface PeriodSummary {
  from: string;
  to: string;
  currency: string;
  income: string;
  expenses: string;
  netCashflow: string;
  savingsRate: number | null;
  transfersVolume: string;
  unclassified: { inflow: string; outflow: string; transactionCount: number };
  spendingByCategory: CategorySpend[];
  spendingByTopCategory: CategorySpend[];
  transactionCount: number;
}

export interface MonthlyPoint {
  month: string;
  income: string;
  expenses: string;
  netCashflow: string;
}

export interface NetWorth {
  currency: string;
  assets: string;
  liabilities: string;
  netWorth: string;
  accounts: { id: string; name: string; type: AccountType; kind: 'ASSET' | 'LIABILITY'; balance: string }[];
  excludedAccountCount: number;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export type TwoFactorMethod = 'totp' | 'email' | 'recovery';

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  methods: TwoFactorMethod[];
  expiresIn: number;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export type ImportStatus = 'PENDING' | 'PROCESSING' | 'REVIEW' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ImportRowStatus = 'VALID' | 'INVALID' | 'POSSIBLE_DUPLICATE' | 'AMBIGUOUS';
export type ImportRowDecision = 'PENDING' | 'ACCEPT' | 'REJECT';

export interface ColumnMapping {
  tableIndex: number;
  headerRowIndex: number;
  date: number;
  description: number[];
  amount?: number;
  debit?: number;
  credit?: number;
  direction?: number;
  currency?: number;
  reference?: number;
  balance?: number;
  dateFormat: string;
  invertAmounts: boolean;
}

export interface Detection {
  tables: { index: number; name: string; rowCount: number; headerRowIndex: number; headers: string[]; sampleRows: string[][] }[];
  suggestedMapping: ColumnMapping | null;
  mappingSource: 'PRESET' | 'REMEMBERED' | 'AUTO' | 'NONE';
  dateFormatCandidates: string[];
  warnings: string[];
}

export interface ImportBatch {
  id: string;
  accountId: string;
  filename: string;
  fileType: 'CSV' | 'XLSX' | 'PDF';
  fileSize: number;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  mapping: ColumnMapping | null;
  detection: Detection | null;
  duplicateOfBatchId: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportSummary {
  batch: ImportBatch;
  counts: {
    total: number;
    byStatus: Record<ImportRowStatus, number>;
    byDecision: Record<ImportRowDecision, number>;
    committed: number;
  };
  errors: { rowNumber: number | null; code: string; message: string }[];
}

export interface ImportRow {
  id: string;
  rowNumber: number;
  raw: string[];
  date: string | null;
  description: string | null;
  amount: string | null;
  currency: string | null;
  type: import('@arvo/types').TransactionType | null;
  merchantName: string | null;
  categoryId: string | null;
  categorizationSource: 'RULE' | 'MERCHANT' | 'HISTORY' | 'AI' | 'USER' | null;
  sourceReference: string | null;
  status: ImportRowStatus;
  decision: ImportRowDecision;
  duplicateOfTransactionId: string | null;
  issues: { field: string; code: string; message: string }[];
  transactionId: string | null;
}

export interface PeriodComparison {
  currency: string;
  current: { from: string; to: string; income: string; expenses: string; netCashflow: string; transactionCount: number };
  previous: { from: string; to: string; income: string; expenses: string; netCashflow: string; transactionCount: number };
  change: { income: string; expenses: string; netCashflow: string; expensesPercent: number | null };
  categoryChanges: { categoryId: string | null; name: string; current: string; previous: string; change: string; changePercent: number | null }[];
  largestExpenses: Transaction[];
}

export interface MerchantSpend {
  merchantId: string | null;
  name: string;
  amount: string;
  transactionCount: number;
}

export interface RecurringSeries {
  id: string;
  label: string;
  merchantId: string | null;
  categoryId: string | null;
  accountId: string;
  currency: string;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  expectedAmount: string;
  monthlyCost: string;
  lastAmount: string;
  previousAmount: string | null;
  lastSeen: string;
  nextExpected: string;
  occurrences: number;
  priceIncreased: boolean;
  confidence: number;
  status: 'ACTIVE' | 'STOPPED';
  isDismissed: boolean;
  transactionIds: string[];
}

export interface RecurringOverview {
  currency: string;
  asOf: string;
  series: RecurringSeries[];
  monthlyTotal: string;
  annualTotal: string;
  priceIncreases: number;
}

export type HighlightTone = 'positive' | 'negative' | 'neutral' | 'warning';
interface HighlightBase {
  id: string;
  tone: HighlightTone;
  evidence?: Record<string, string>;
}
export type Highlight =
  | (HighlightBase & { kind: 'spending_pace'; spentSoFar: string; projected: string; lastMonth: string; difference: string; dayOfMonth: number; daysInMonth: number })
  | (HighlightBase & { kind: 'category_spike'; category: string; categoryId: string | null; month: string; amount: string; average: string; percentAbove: number })
  | (HighlightBase & { kind: 'top_merchant'; merchant: string; merchantId: string; amount: string; count: number; perVisit: string })
  | (HighlightBase & { kind: 'biggest_expense'; description: string; amount: string; date: string; transactionId: string })
  | (HighlightBase & { kind: 'small_purchases'; count: number; total: string; threshold: string; days: number })
  | (HighlightBase & { kind: 'no_spend_days'; days: number; daysSoFar: number })
  | (HighlightBase & { kind: 'weekend_spending'; weekendPerDay: string; weekdayPerDay: string; ratio: number; days: number })
  | (HighlightBase & { kind: 'subscriptions'; monthly: string; yearly: string; count: number; priceIncreases: string[] })
  | (HighlightBase & { kind: 'fees_paid'; total: string; count: number; year: string })
  | (HighlightBase & { kind: 'cash_runway'; months: number; liquid: string; averageMonthlyExpenses: string })
  | (HighlightBase & { kind: 'savings_rate'; rate: number; previousRate: number | null; month: string });

export interface HighlightsResult {
  currency: string;
  asOf: string;
  month: string;
  highlights: Highlight[];
}

export interface DailySpend {
  date: string;
  spent: string;
  count: number;
}
export interface BurnUpPoint {
  day: number;
  thisMonth: string | null;
  lastMonth: string | null;
  average: string;
}
export interface WeekdaySpend {
  weekday: number;
  total: string;
  average: string;
  count: number;
}
export interface SizeBand {
  label: string;
  min: string;
  max: string | null;
  count: number;
  total: string;
}
export interface WaterfallStep {
  label: string;
  kind: 'income' | 'category' | 'other' | 'remaining';
  amount: string;
}
export interface UpcomingCharge {
  label: string;
  amount: string;
  date: string;
  frequency: string;
  priceIncreased: boolean;
}
export interface SpendingPatterns {
  currency: string;
  asOf: string;
  month: string;
  daily: DailySpend[];
  burnUp: BurnUpPoint[];
  weekdays: WeekdaySpend[];
  sizeBands: SizeBand[];
  waterfall: WaterfallStep[];
  upcoming: UpcomingCharge[];
  totals: { windowDays: number; spent: string; transactions: number; averagePerDay: string; busiestDay: DailySpend | null };
}

export type BudgetStatus = 'on_track' | 'at_risk' | 'over';

export interface BudgetPacing {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  currency: string;
  rollover: boolean;
  limit: string;
  carriedOver: string;
  spent: string;
  remaining: string;
  percentUsed: number;
  percentOfMonthElapsed: number;
  projected: string;
  projectedOverspend: string;
  status: BudgetStatus;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetStatusResult {
  month: string;
  asOf: string;
  daysInMonth: number;
  daysElapsed: number;
  percentOfMonthElapsed: number;
  budgets: BudgetPacing[];
  totals: { currency: string; limit: string; spent: string; remaining: string; projected: string; percentUsed: number }[];
}

export type GoalStatus = 'on_track' | 'behind' | 'achieved';

export interface GoalProgress {
  id: string;
  name: string;
  targetAmount: string;
  currency: string;
  targetDate: string;
  accountId: string | null;
  accountName: string | null;
  savedAmount: string;
  current: string;
  remaining: string;
  percent: number;
  expected: string;
  expectedPercent: number;
  monthsLeft: number;
  requiredMonthly: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export type SavingsKind = 'category_creep' | 'merchant_creep' | 'subscription_price_increase' | 'fees_and_interest' | 'one_off_spike';

export interface SavingsOpportunity {
  id: string;
  kind: SavingsKind;
  title: string;
  monthlySaving: string;
  includedInTotal: boolean;
  informational: boolean;
  confidence: 'high' | 'medium' | 'low';
  rationale: { current: string; baseline: string | null; changePercent: number | null; period: { from: string; to: string }; basis: string };
  categoryId: string | null;
  merchantId: string | null;
  evidence: { query: Record<string, string>; transactionIds: string[] };
}

export interface SavingsOpportunitiesResult {
  currency: string;
  asOf: string;
  month: string;
  totalMonthly: string;
  totalYearly: string;
  opportunities: SavingsOpportunity[];
}

export interface PlanningBaseline {
  currency: string;
  asOf: string;
  liquid: string;
  monthlyIncome: string;
  monthlyExpenses: string;
  goalContributions: string;
  monthlySurplus: string;
  months: string[];
  categories: { categoryId: string; name: string; monthly: string }[];
}

export type AffordabilityStatus = 'affordable' | 'tight' | 'not_yet';

export interface AffordabilityResult {
  currency: string;
  asOf: string;
  amount: string;
  date: string;
  bufferMonths: number;
  status: AffordabilityStatus;
  baseline: PlanningBaseline;
  bufferTarget: string;
  cashBefore: string;
  cashAfter: string;
  bufferMonthsAfter: number | null;
  monthsToRecover: number | null;
  affordableFrom: string | null;
  series: { month: string; without: string; with: string }[];
}

export type ScenarioAdjustment =
  | { type: 'category'; categoryId: string; mode: 'amount' | 'percent'; value: string; fromMonth?: string }
  | { type: 'income'; mode: 'amount' | 'percent'; value: string; fromMonth?: string }
  | { type: 'one_off'; month: string; amount: string; label?: string };

export interface WhatIfResult {
  currency: string;
  asOf: string;
  baseline: PlanningBaseline;
  adjustments: { adjustment: ScenarioAdjustment; label: string; monthlyImpact: string }[];
  monthlyChange: string;
  scenarioSurplus: string;
  yearlyImpact: string;
  endBalance: { baseline: string; scenario: string };
  lowest: { month: string; amount: string };
  series: { month: string; baseline: string; scenario: string }[];
}

export interface Scenario {
  id: string;
  name: string;
  description: string | null;
  adjustments: ScenarioAdjustment[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioComparison {
  currency: string;
  asOf: string;
  baseline: PlanningBaseline;
  months: string[];
  baselineSeries: string[];
  scenarios: { id: string; name: string; monthlyChange: string; yearlyImpact: string; endBalance: string; series: string[] }[];
}

export type ReminderFrequency = 'off' | 'every_15_days' | 'monthly';

export interface ReminderSettings {
  frequency: ReminderFrequency;
  day: number | null;
  lastImportAt: string | null;
  daysSinceLastImport: number | null;
  nextReminderAt: string | null;
  overdue: boolean;
  weeklyBriefing: boolean;
}

// ---- portfolio ----

export type InstrumentKind =
  | 'EQUITY' | 'MUTUAL_FUND' | 'ETF' | 'NPS' | 'EPF' | 'PPF' | 'FD' | 'RD' | 'SGB' | 'GOLD' | 'BOND' | 'CASH' | 'REAL_ESTATE' | 'OTHER';
export type AssetClass = 'EQUITY' | 'DEBT' | 'GOLD' | 'REAL_ESTATE' | 'CASH' | 'OTHER';
export type MarketCap = 'LARGE' | 'MID' | 'SMALL';
export type FundPlan = 'DIRECT' | 'REGULAR';
export type HoldingTransactionType =
  | 'BUY' | 'SIP' | 'SWITCH_IN' | 'CONTRIBUTION' | 'BONUS' | 'SELL' | 'SWITCH_OUT' | 'WITHDRAWAL' | 'MATURITY' | 'DIVIDEND' | 'INTEREST' | 'VALUE_UPDATE';

export interface Holding {
  id: string;
  name: string;
  kind: InstrumentKind;
  assetClass: AssetClass;
  currency: string;
  isin: string | null;
  schemeCode: string | null;
  symbol: string | null;
  folio: string | null;
  amc: string | null;
  sector: string | null;
  marketCap: MarketCap | null;
  plan: FundPlan | null;
  expenseRatio: string | null;
  directExpenseRatio: string | null;
  exitLoadDays: number | null;
  exitLoadPercent: string | null;
  lockInMonths: number | null;
  latestPrice: string | null;
  latestPriceDate: string | null;
  goalId: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface HoldingTransaction {
  id: string;
  holdingId: string;
  date: string;
  type: HoldingTransactionType;
  units: string | null;
  price: string | null;
  amount: string;
  charges: string;
  note: string | null;
  externalRef: string | null;
}

export interface HoldingPosition {
  units: string;
  invested: string;
  withdrawn: string;
  income: string;
  netInvested: string;
  costBasis: string;
  value: string;
  valueSource: 'PRICE' | 'STATED' | 'COST';
  price: string | null;
  priceDate: string | null;
  unrealisedGain: string;
  xirrPercent: number | null;
  lots: { date: string; units: string; cost: string }[];
  realised: { buyDate: string; sellDate: string; units: string; cost: string; proceeds: string; gain: string; heldDays: number }[];
  warnings: string[];
}

export interface HoldingDetail {
  holding: Holding;
  asOf: string;
  position: HoldingPosition;
  transactions: HoldingTransaction[];
}

export interface HoldingSummary {
  id: string;
  name: string;
  kind: InstrumentKind;
  assetClass: AssetClass;
  currency: string;
  amc: string | null;
  sector: string | null;
  marketCap: MarketCap | null;
  plan: FundPlan | null;
  goalId: string | null;
  units: string;
  invested: string;
  withdrawn: string;
  income: string;
  costBasis: string;
  price: string | null;
  priceDate: string | null;
  value: string;
  valueSource: 'PRICE' | 'STATED' | 'COST';
  unrealisedGain: string;
  absoluteReturnPercent: number | null;
  xirrPercent: number | null;
  percentOfPortfolio: number;
  warnings: string[];
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: string;
  percent: number;
  holdingCount: number;
}

export interface PortfolioSummary {
  asOf: string;
  currency: string;
  netInvested: string;
  totalInvested: string;
  totalWithdrawn: string;
  totalIncome: string;
  currentValue: string;
  totalGain: string;
  absoluteReturnPercent: number | null;
  xirrPercent: number | null;
  holdingCount: number;
  stalePriceCount: number;
  holdings: HoldingSummary[];
  topHoldings: HoldingSummary[];
  byAssetClass: AllocationSlice[];
  disclaimer: string;
}

export interface CostDrag {
  annualCost: string;
  regularPlanExtraCost: string;
  rows: {
    holdingId: string;
    holdingName: string;
    value: string;
    expenseRatio: string;
    annualCost: string;
    plan: FundPlan | null;
    directExpenseRatio: string | null;
    extraVersusDirect: string | null;
  }[];
  missingExpenseRatio: number;
  note: string;
}

export interface PortfolioAllocation {
  asOf: string;
  currency: string;
  totalValue: string;
  assetClass: AllocationSlice[];
  marketCap: AllocationSlice[];
  sector: AllocationSlice[];
  amc: AllocationSlice[];
  holdings: AllocationSlice[];
  concentration: { topHoldingPercent: number; topNPercent: number; topN: number; warnings: string[] };
  costDrag: CostDrag;
  disclaimer: string;
}

export interface PortfolioReturns {
  asOf: string;
  currency: string;
  netInvested: string;
  currentValue: string;
  totalGain: string;
  absoluteReturnPercent: number | null;
  xirrPercent: number | null;
  byAssetClass: { assetClass: AssetClass; value: string; netInvested: string; xirrPercent: number | null; absoluteReturnPercent: number | null }[];
  byHolding: { holdingId: string; holdingName: string; value: string; netInvested: string; xirrPercent: number | null; absoluteReturnPercent: number | null }[];
  benchmark: {
    series: string;
    value: string;
    xirrPercent: number | null;
    differencePercent: number | null;
    from: string;
    to: string;
    warnings: string[];
    note: string;
  } | null;
  availableBenchmarks: string[];
  disclaimer: string;
}

export interface GainRow {
  holdingId: string;
  holdingName: string;
  buyDate: string;
  sellDate?: string;
  units: string;
  cost: string;
  value: string;
  gain: string;
  term: 'SHORT' | 'LONG';
  heldDays: number;
  daysToLongTerm: number;
  isEquity: boolean;
}

export interface CapitalGains {
  asOf: string;
  financialYear: string;
  currency: string;
  config: { equityLongTermDays: number; otherLongTermDays: number; ltcgExemption: string; ltcgRatePercent: string; stcgRatePercent: string };
  realised: { shortTerm: string; longTerm: string; exemptLongTerm: string; taxableLongTerm: string; estimatedTax: string; rows: GainRow[] };
  unrealised: { shortTerm: string; longTerm: string; rows: GainRow[] };
  harvestHeadroom: string;
  harvestSuggestions: { holdingId: string; holdingName: string; buyDate: string; units: string; gain: string; warnings: string[] }[];
  lockIns: { holdingId: string; holdingName: string; buyDate: string; unlocksOn: string; units: string; value: string; daysLeft: number }[];
  disclaimer: string;
}

export interface RebalanceResult {
  asOf: string;
  currency: string;
  totalValue: string;
  driftBandPercent: number;
  classes: {
    assetClass: AssetClass;
    currentValue: string;
    currentPercent: number;
    targetPercent: number;
    targetValue: string;
    difference: string;
    withinBand: boolean;
  }[];
  trades: {
    holdingId: string;
    holdingName: string;
    assetClass: AssetClass;
    action: 'BUY' | 'SELL';
    amount: string;
    units: string | null;
    estimatedTax: string;
    estimatedGain: string;
    warnings: string[];
  }[];
  estimatedTaxTotal: string;
  warnings: string[];
  disclaimer: string;
}

export interface GoalProjectionResult {
  asOf: string;
  currency: string;
  unmappedHoldings: number;
  goals: {
    goalId: string;
    goalName: string;
    targetAmount: string;
    targetDate: string;
    currency: string;
    holdingIds: string[];
    currentValue: string;
    monthsLeft: number;
    monthlyContribution: string;
    probability: number;
    p10: string;
    p50: string;
    p90: string;
    blend: { assetClass: AssetClass; percent: number }[];
    assumptions: { paths: number; seed: number; blendReturnPercent: number; blendVolatilityPercent: number };
    disclaimer: string;
  }[];
}

export interface FundOverlap {
  asOf: string;
  currency: string;
  pairs: {
    aHoldingId: string;
    aName: string;
    bHoldingId: string;
    bName: string;
    overlapPercent: number;
    commonCount: number;
    topCommon: { name: string; aWeight: string; bWeight: string }[];
  }[];
  missingDisclosures: { holdingId: string; name: string }[];
  note: string;
}

export type PortfolioImportSource = 'CAS_PDF' | 'BROKER_CSV' | 'AMFI_NAV' | 'BENCHMARK_CSV' | 'FUND_DISCLOSURE_CSV';

export interface PortfolioImportBatch {
  id: string;
  filename: string;
  source: PortfolioImportSource;
  status: 'PENDING' | 'READY' | 'COMMITTED' | 'FAILED';
  warnings: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioImportRow {
  id: string;
  batchId: string;
  rowNumber: number;
  status: 'NEW' | 'DUPLICATE' | 'ERROR' | 'COMMITTED' | 'SKIPPED';
  message: string | null;
  holdingId: string | null;
  parsed: {
    instrumentName: string;
    kind: InstrumentKind;
    isin: string | null;
    schemeCode: string | null;
    symbol: string | null;
    folio: string | null;
    amc: string | null;
    date: string;
    type: HoldingTransactionType;
    units: string | null;
    price: string | null;
    amount: string;
    charges: string;
    note: string | null;
    externalRef: string;
  };
}

export interface PortfolioImportSummary {
  batch: PortfolioImportBatch;
  counts: { total: number; new: number; duplicate: number; error: number; committed: number; skipped: number };
  applied: number;
  rows: PortfolioImportRow[];
}
