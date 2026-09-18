import type {
  BudgetRecord,
  GoalRecord,
  ScenarioRecord,
  RecurringSeriesRecord,
  ImportBatchRecord,
  ImportErrorRecord,
  ImportRowRecord,
  RuleRecord,
  AccountRecord,
  CategoryRecord,
  MerchantRecord,
  TransactionRecord,
  TransferRecord,
  BenchmarkPointRecord,
  FundHoldingRecord,
  HoldingRecord,
  HoldingTransactionRecord,
  PortfolioImportBatchRecord,
  PortfolioImportRowRecord,
  JournalEntryRecord,
  TradeImportBatchRecord,
  TradeImportRowRecord,
  TradeRecord,
  TradingSettingsRecord,
  BacktestRecord,
  BarImportBatchRecord,
  BarRecord,
  PaperAccountRecord,
  PaperOrderRecord,
  StrategyRecord,
} from '@arvo/finance-core';
import { formatMoney, formatUnits, parseMoney, parseUnits } from '@arvo/finance-core';
import type {
  BudgetEntity,
  GoalEntity,
  ScenarioEntity,
  RecurringSeriesEntity,
  ImportBatchEntity,
  ImportErrorEntity,
  ImportRowEntity,
  RuleEntity,
  AccountEntity,
  CategoryEntity,
  MerchantEntity,
  TransactionEntity,
  TransferEntity,
  BenchmarkPointEntity,
  FundHoldingEntity,
  HoldingEntity,
  HoldingTransactionEntity,
  TradeEntity,
  TradeImportBatchEntity,
  TradeImportRowEntity,
  TradeJournalEntryEntity,
  MarketBarEntity,
  BarImportBatchEntity,
  LabStrategyEntity,
  LabBacktestEntity,
  PaperAccountEntity,
  PaperOrderEntity,
  TradingSettingsEntity,
  PortfolioImportBatchEntity,
  PortfolioImportRowEntity,
} from '../entities';

/** numeric(19,4) comes back as "649.5000"; expose the core's canonical form "649.50". */
const canonicalMoney = (value: string): string => formatMoney(parseMoney(value));

export const toAccount = (e: AccountEntity): AccountRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  type: e.type,
  institution: e.institution,
  currency: e.currency,
  openingBalance: canonicalMoney(e.openingBalance),
  isActive: e.isActive,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toCategory = (e: CategoryEntity): CategoryRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  parentId: e.parentId,
  type: e.type,
  isSystem: e.isSystem,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toMerchant = (e: MerchantEntity): MerchantRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  normalizedName: e.normalizedName,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toTransaction = (e: TransactionEntity): TransactionRecord => ({
  id: e.id,
  userId: e.userId,
  accountId: e.accountId,
  date: e.date,
  description: e.description,
  merchantId: e.merchantId,
  categoryId: e.categoryId,
  amount: canonicalMoney(e.amount),
  currency: e.currency,
  type: e.type,
  status: e.status,
  source: e.source,
  sourceReference: e.sourceReference,
  notes: e.notes,
  metadata: e.metadata,
  fingerprint: e.fingerprint,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toTransfer = (e: TransferEntity): TransferRecord => ({
  id: e.id,
  userId: e.userId,
  fromTransactionId: e.fromTransactionId,
  toTransactionId: e.toTransactionId,
  createdAt: e.createdAt,
});

export const toImportBatch = (e: ImportBatchEntity): ImportBatchRecord => ({
  id: e.id,
  userId: e.userId,
  accountId: e.accountId,
  filename: e.filename,
  fileType: e.fileType,
  fileHash: e.fileHash,
  fileSize: e.fileSize,
  storageKey: e.storageKey,
  status: e.status,
  totalRows: e.totalRows,
  processedRows: e.processedRows,
  mapping: e.mapping,
  detection: e.detection,
  duplicateOfBatchId: e.duplicateOfBatchId,
  errorMessage: e.errorMessage,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
  completedAt: e.completedAt,
});

export const toImportRow = (e: ImportRowEntity): ImportRowRecord => ({
  id: e.id,
  batchId: e.batchId,
  userId: e.userId,
  rowNumber: e.rowNumber,
  raw: e.raw,
  date: e.date,
  description: e.description,
  amount: e.amount === null ? null : canonicalMoney(e.amount),
  currency: e.currency,
  type: e.type,
  merchantName: e.merchantName,
  categoryId: e.categoryId,
  categorizationSource: e.categorizationSource,
  sourceReference: e.sourceReference,
  fingerprint: e.fingerprint,
  status: e.status,
  decision: e.decision,
  duplicateOfTransactionId: e.duplicateOfTransactionId,
  issues: e.issues,
  transactionId: e.transactionId,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toImportError = (e: ImportErrorEntity): ImportErrorRecord => ({
  id: e.id,
  batchId: e.batchId,
  userId: e.userId,
  rowNumber: e.rowNumber,
  code: e.code,
  message: e.message,
  createdAt: e.createdAt,
});

export const toRule = (e: RuleEntity): RuleRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  priority: e.priority,
  isActive: e.isActive,
  conditions: e.conditions,
  actions: e.actions,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toRecurring = (e: RecurringSeriesEntity): RecurringSeriesRecord => ({
  id: e.id,
  userId: e.userId,
  key: e.key,
  label: e.label,
  merchantId: e.merchantId,
  categoryId: e.categoryId,
  accountId: e.accountId,
  currency: e.currency,
  frequency: e.frequency,
  expectedAmount: canonicalMoney(e.expectedAmount),
  monthlyCost: canonicalMoney(e.monthlyCost),
  lastAmount: canonicalMoney(e.lastAmount),
  previousAmount: e.previousAmount === null ? null : canonicalMoney(e.previousAmount),
  lastSeen: e.lastSeen,
  nextExpected: e.nextExpected,
  occurrences: e.occurrences,
  priceIncreased: e.priceIncreased,
  confidence: Number(e.confidence),
  status: e.status,
  isDismissed: e.isDismissed,
  transactionIds: e.transactionIds,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toBudget = (e: BudgetEntity): BudgetRecord => ({
  id: e.id,
  userId: e.userId,
  categoryId: e.categoryId,
  amount: canonicalMoney(e.amount),
  currency: e.currency,
  rollover: e.rollover,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toGoal = (e: GoalEntity): GoalRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  targetAmount: canonicalMoney(e.targetAmount),
  currency: e.currency,
  targetDate: e.targetDate,
  accountId: e.accountId,
  savedAmount: canonicalMoney(e.savedAmount),
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toScenario = (e: ScenarioEntity): ScenarioRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  description: e.description,
  adjustments: e.adjustments,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

// ---- portfolio ----

/** numeric(24,5) comes back as a string; re-format it so it always has 5 fraction digits. */
const canonicalUnits = (value: string): string => formatUnits(parseUnits(value));

export const toHolding = (e: HoldingEntity): HoldingRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  kind: e.kind,
  assetClass: e.assetClass,
  currency: e.currency,
  isin: e.isin,
  schemeCode: e.schemeCode,
  symbol: e.symbol,
  folio: e.folio,
  amc: e.amc,
  sector: e.sector,
  marketCap: e.marketCap,
  plan: e.plan,
  expenseRatio: e.expenseRatio === null ? null : canonicalMoney(e.expenseRatio),
  directExpenseRatio: e.directExpenseRatio === null ? null : canonicalMoney(e.directExpenseRatio),
  exitLoadDays: e.exitLoadDays,
  exitLoadPercent: e.exitLoadPercent === null ? null : canonicalMoney(e.exitLoadPercent),
  lockInMonths: e.lockInMonths,
  latestPrice: e.latestPrice === null ? null : canonicalMoney(e.latestPrice),
  latestPriceDate: e.latestPriceDate,
  goalId: e.goalId,
  notes: e.notes,
  isActive: e.isActive,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toHoldingTransaction = (e: HoldingTransactionEntity): HoldingTransactionRecord => ({
  id: e.id,
  userId: e.userId,
  holdingId: e.holdingId,
  date: e.date,
  type: e.type,
  units: e.units === null ? null : canonicalUnits(e.units),
  price: e.price === null ? null : canonicalMoney(e.price),
  amount: canonicalMoney(e.amount),
  charges: canonicalMoney(e.charges),
  note: e.note,
  externalRef: e.externalRef,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toBenchmarkPoint = (e: BenchmarkPointEntity): BenchmarkPointRecord => ({
  userId: e.userId,
  series: e.series,
  date: e.date,
  value: canonicalMoney(e.value),
});

export const toFundHolding = (e: FundHoldingEntity): FundHoldingRecord => ({
  id: e.id,
  userId: e.userId,
  holdingId: e.holdingId,
  name: e.name,
  isin: e.isin,
  weight: canonicalMoney(e.weight),
  asOf: e.asOf,
});

export const toPortfolioImportBatch = (e: PortfolioImportBatchEntity): PortfolioImportBatchRecord => ({
  id: e.id,
  userId: e.userId,
  filename: e.filename,
  source: e.source,
  status: e.status,
  warnings: e.warnings,
  error: e.error,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toPortfolioImportRow = (e: PortfolioImportRowEntity): PortfolioImportRowRecord => ({
  id: e.id,
  userId: e.userId,
  batchId: e.batchId,
  rowNumber: e.rowNumber,
  status: e.status,
  message: e.message,
  holdingId: e.holdingId,
  parsed: e.parsed,
  createdAt: e.createdAt,
});

// ---- trading ----

/** bigint comes back from pg as a string already; normalise away any stray formatting. */
const canonicalQuantity = (value: string | number): string => BigInt(value).toString();

export const toTrade = (e: TradeEntity): TradeRecord => ({
  id: e.id,
  userId: e.userId,
  date: e.date,
  time: e.time,
  broker: e.broker,
  exchange: e.exchange,
  segment: e.segment,
  kind: e.kind,
  symbol: e.symbol,
  underlying: e.underlying,
  isin: e.isin,
  expiry: e.expiry,
  strike: e.strike === null ? null : canonicalMoney(e.strike),
  right: e.right,
  lotSize: e.lotSize,
  side: e.side,
  quantity: canonicalQuantity(e.quantity),
  price: canonicalMoney(e.price),
  amount: canonicalMoney(e.amount),
  brokerage: canonicalMoney(e.brokerage),
  stt: canonicalMoney(e.stt),
  exchangeCharges: canonicalMoney(e.exchangeCharges),
  sebiCharges: canonicalMoney(e.sebiCharges),
  stampDuty: canonicalMoney(e.stampDuty),
  gst: canonicalMoney(e.gst),
  dpCharges: canonicalMoney(e.dpCharges),
  otherCharges: canonicalMoney(e.otherCharges),
  totalCharges: canonicalMoney(e.totalCharges),
  chargesSource: e.chargesSource,
  orderId: e.orderId,
  tradeRef: e.tradeRef,
  notes: e.notes,
  externalRef: e.externalRef,
  isPaper: e.isPaper ?? false,
  paperAccountId: e.paperAccountId ?? null,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toJournalEntry = (e: TradeJournalEntryEntity): JournalEntryRecord => ({
  id: e.id,
  userId: e.userId,
  positionId: e.positionId,
  notes: e.notes,
  setupTags: e.setupTags ?? [],
  emotionTags: e.emotionTags ?? [],
  mistakes: e.mistakes ?? [],
  stopPrice: e.stopPrice === null ? null : canonicalMoney(e.stopPrice),
  targetPrice: e.targetPrice === null ? null : canonicalMoney(e.targetPrice),
  screenshots: e.screenshots ?? [],
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toTradingSettings = (e: TradingSettingsEntity): TradingSettingsRecord => ({
  userId: e.userId,
  brokers: e.brokers ?? [],
  revengeWindowMinutes: e.revengeWindowMinutes,
  overTradingMultiple: canonicalMoney(e.overTradingMultiple),
  assumedIndexReturnPercent: canonicalMoney(e.assumedIndexReturnPercent),
  assumedFdRatePercent: canonicalMoney(e.assumedFdRatePercent),
  benchmarkSeries: e.benchmarkSeries,
  setupTags: e.setupTags ?? [],
  emotionTags: e.emotionTags ?? [],
  updatedAt: e.updatedAt,
});

export const toTradeImportBatch = (e: TradeImportBatchEntity): TradeImportBatchRecord => ({
  id: e.id,
  userId: e.userId,
  filename: e.filename,
  source: e.source,
  profile: e.profile,
  broker: e.broker,
  status: e.status,
  warnings: e.warnings ?? [],
  error: e.error,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toTradeImportRow = (e: TradeImportRowEntity): TradeImportRowRecord => ({
  id: e.id,
  userId: e.userId,
  batchId: e.batchId,
  rowNumber: e.rowNumber,
  status: e.status,
  message: e.message,
  parsed: e.parsed,
  createdAt: e.createdAt,
});

// ---- Strategy Lab ----

export const toMarketBar = (e: MarketBarEntity): BarRecord => ({
  id: e.id,
  userId: e.userId,
  symbol: e.symbol,
  timeframe: e.timeframe,
  date: e.date,
  time: e.time,
  open: canonicalMoney(e.open),
  high: canonicalMoney(e.high),
  low: canonicalMoney(e.low),
  close: canonicalMoney(e.close),
  volume: String(e.volume ?? '0'),
  createdAt: e.createdAt,
});

export const toBarImportBatch = (e: BarImportBatchEntity): BarImportBatchRecord => ({
  id: e.id,
  userId: e.userId,
  filename: e.filename,
  symbol: e.symbol,
  timeframe: e.timeframe,
  status: e.status,
  rowCount: e.rowCount,
  warnings: e.warnings ?? [],
  error: e.error,
  from: e.from,
  to: e.to,
  parsed: e.parsed ?? [],
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toLabStrategy = (e: LabStrategyEntity): StrategyRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  description: e.description,
  spec: e.spec,
  runCount: e.runCount ?? 0,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toLabBacktest = (e: LabBacktestEntity): BacktestRecord => ({
  id: e.id,
  userId: e.userId,
  strategyId: e.strategyId,
  name: e.name,
  symbol: e.symbol,
  timeframe: e.timeframe,
  from: e.from,
  to: e.to,
  stats: e.stats,
  result: e.result,
  createdAt: e.createdAt,
});

export const toPaperAccount = (e: PaperAccountEntity): PaperAccountRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  startingCapital: canonicalMoney(e.startingCapital),
  cash: canonicalMoney(e.cash),
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toPaperOrder = (e: PaperOrderEntity): PaperOrderRecord => ({
  id: e.id,
  userId: e.userId,
  accountId: e.accountId,
  symbol: e.symbol,
  timeframe: e.timeframe,
  side: e.side,
  quantity: canonicalQuantity(e.quantity),
  orderType: e.orderType,
  limitPrice: e.limitPrice === null ? null : canonicalMoney(e.limitPrice),
  status: e.status,
  placedDate: e.placedDate,
  placedTime: e.placedTime,
  filledDate: e.filledDate,
  filledTime: e.filledTime,
  fillPrice: e.fillPrice === null ? null : canonicalMoney(e.fillPrice),
  tradeId: e.tradeId,
  message: e.message,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});
