/*
 * Wealth & portfolio domain.
 *
 * A holding is one instrument the user owns (a mutual fund folio, a stock, an EPF account,
 * a plot of land). Its transactions are the events that changed it: purchases, SIP
 * instalments, redemptions, dividends, contributions, maturities and periodic value updates
 * for instruments with no unit price.
 *
 * Money is an exact decimal string (4 dp, see money.ts). Quantities are exact decimal
 * strings at 5 dp (see units.ts). Everything here is user-scoped.
 *
 * Advice level 0–2: analysis, education and simulation. Nothing in this module recommends
 * buying or selling anything.
 */

export type InstrumentKind =
  | 'EQUITY'
  | 'MUTUAL_FUND'
  | 'ETF'
  | 'NPS'
  | 'EPF'
  | 'PPF'
  | 'FD'
  | 'RD'
  | 'SGB'
  | 'GOLD'
  | 'BOND'
  | 'CASH'
  | 'REAL_ESTATE'
  | 'OTHER';

export type AssetClass = 'EQUITY' | 'DEBT' | 'GOLD' | 'REAL_ESTATE' | 'CASH' | 'OTHER';

/** Default asset class per instrument kind; the user may override it on the holding. */
export const DEFAULT_ASSET_CLASS: Record<InstrumentKind, AssetClass> = {
  EQUITY: 'EQUITY',
  MUTUAL_FUND: 'EQUITY',
  ETF: 'EQUITY',
  NPS: 'EQUITY',
  EPF: 'DEBT',
  PPF: 'DEBT',
  FD: 'DEBT',
  RD: 'DEBT',
  SGB: 'GOLD',
  GOLD: 'GOLD',
  BOND: 'DEBT',
  CASH: 'CASH',
  REAL_ESTATE: 'REAL_ESTATE',
  OTHER: 'OTHER',
};

/** Kinds priced by units × price. Everything else carries a stated value. */
export const UNIT_PRICED_KINDS: InstrumentKind[] = ['EQUITY', 'MUTUAL_FUND', 'ETF', 'SGB', 'GOLD', 'BOND'];

export type MarketCap = 'LARGE' | 'MID' | 'SMALL';
export type FundPlan = 'DIRECT' | 'REGULAR';

export type HoldingTransactionType =
  | 'BUY'
  | 'SIP'
  | 'SWITCH_IN'
  | 'CONTRIBUTION'
  | 'BONUS'
  | 'SELL'
  | 'SWITCH_OUT'
  | 'WITHDRAWAL'
  | 'MATURITY'
  | 'DIVIDEND'
  | 'INTEREST'
  | 'VALUE_UPDATE';

/** Types that add units and put money in. */
export const INVESTING_TYPES: HoldingTransactionType[] = ['BUY', 'SIP', 'SWITCH_IN', 'CONTRIBUTION'];
/** Types that remove units and take money out. */
export const REDEEMING_TYPES: HoldingTransactionType[] = ['SELL', 'SWITCH_OUT', 'WITHDRAWAL', 'MATURITY'];
/** Types that pay cash without touching units. */
export const INCOME_TYPES: HoldingTransactionType[] = ['DIVIDEND', 'INTEREST'];

export interface HoldingRecord {
  id: string;
  userId: string;
  name: string;
  kind: InstrumentKind;
  assetClass: AssetClass;
  currency: string;
  isin: string | null;
  /** AMFI scheme code for mutual funds; used by the AMFI NAV import. */
  schemeCode: string | null;
  /** Exchange symbol for stocks and ETFs. */
  symbol: string | null;
  /** Folio or account number (mutual funds, NPS/EPF/PPF, FD receipt). */
  folio: string | null;
  amc: string | null;
  sector: string | null;
  marketCap: MarketCap | null;
  plan: FundPlan | null;
  /** Annual expense ratio in percent, e.g. "1.25". User-entered. */
  expenseRatio: string | null;
  /** Expense ratio of the matching direct plan, when known, for the regular-vs-direct drag. */
  directExpenseRatio: string | null;
  /** Days from each purchase during which an exit load applies; null when there is none. */
  exitLoadDays: number | null;
  /** Percent charged on units redeemed inside the exit-load window, e.g. "1". */
  exitLoadPercent: string | null;
  /** Lock-in from each purchase date, in months (ELSS = 36, NPS/PPF are handled as long locks). */
  lockInMonths: number | null;
  /** Latest known price per unit, entered manually or set by a NAV import. */
  latestPrice: string | null;
  latestPriceDate: string | null;
  /** Goal this holding is earmarked for. */
  goalId: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type Generated = 'id' | 'createdAt' | 'updatedAt';
export type NewHolding = Omit<HoldingRecord, Generated>;
export type HoldingPatch = Partial<Omit<HoldingRecord, Generated | 'userId' | 'currency'>>;

export interface HoldingTransactionRecord {
  id: string;
  userId: string;
  holdingId: string;
  date: string;
  type: HoldingTransactionType;
  /** Quantity bought or sold; null for cash-only events and value updates. */
  units: string | null;
  /** Price or NAV per unit; null when the event has no unit price. */
  price: string | null;
  /**
   * Positive gross amount. For VALUE_UPDATE it is the holding's stated total value on that
   * date. Direction comes from `type`, never from the sign.
   */
  amount: string;
  /** Brokerage, STT, stamp duty, exit load and the rest, as one positive total. */
  charges: string;
  note: string | null;
  /** Set when the row came from a statement import, so duplicates can be found again. */
  externalRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewHoldingTransaction = Omit<HoldingTransactionRecord, Generated>;
export type HoldingTransactionPatch = Partial<
  Pick<HoldingTransactionRecord, 'date' | 'type' | 'units' | 'price' | 'amount' | 'charges' | 'note'>
>;

/** One point of a user-imported index series (Nifty 50 TRI and friends). */
export interface BenchmarkPointRecord {
  userId: string;
  /** Series name as imported, e.g. "NIFTY 50 TRI". */
  series: string;
  date: string;
  /** Index level, exact decimal string. */
  value: string;
}

/** One line of a fund's portfolio disclosure, used for overlap. */
export interface FundHoldingRecord {
  id: string;
  userId: string;
  holdingId: string;
  name: string;
  isin: string | null;
  /** Percent of the fund's net assets, e.g. "4.85". */
  weight: string;
  asOf: string;
}

export type NewFundHolding = Omit<FundHoldingRecord, 'id'>;

export type PortfolioImportStatus = 'PENDING' | 'READY' | 'COMMITTED' | 'FAILED';
export type PortfolioImportSource = 'CAS_PDF' | 'BROKER_CSV' | 'AMFI_NAV' | 'BENCHMARK_CSV' | 'FUND_DISCLOSURE_CSV';
export type PortfolioImportRowStatus = 'NEW' | 'DUPLICATE' | 'ERROR' | 'COMMITTED' | 'SKIPPED';

export interface PortfolioImportBatchRecord {
  id: string;
  userId: string;
  filename: string;
  source: PortfolioImportSource;
  status: PortfolioImportStatus;
  warnings: string[];
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPortfolioImportBatch = Omit<PortfolioImportBatchRecord, Generated>;

/** A parsed transaction awaiting review. Holding identity is carried as parsed text. */
export interface PortfolioImportRowRecord {
  id: string;
  userId: string;
  batchId: string;
  rowNumber: number;
  status: PortfolioImportRowStatus;
  /** Message explaining an ERROR or DUPLICATE row. */
  message: string | null;
  /** Holding matched or to be created; set during review. */
  holdingId: string | null;
  parsed: ParsedPortfolioRow;
  createdAt: Date;
}

export type NewPortfolioImportRow = Omit<PortfolioImportRowRecord, 'id' | 'createdAt'>;

export interface ParsedPortfolioRow {
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
  /** Stable key for duplicate detection: holding identity + date + type + amount + units. */
  externalRef: string;
}

export interface HoldingRepository {
  findAll(userId: string): Promise<HoldingRecord[]>;
  findById(userId: string, id: string): Promise<HoldingRecord | null>;
  /** First holding matching any of the given identifiers, in the order listed. */
  findByIdentity(
    userId: string,
    identity: { isin?: string | null; schemeCode?: string | null; symbol?: string | null; folio?: string | null; name?: string },
  ): Promise<HoldingRecord | null>;
  create(input: NewHolding): Promise<HoldingRecord>;
  update(userId: string, id: string, patch: HoldingPatch): Promise<HoldingRecord>;
  delete(userId: string, id: string): Promise<void>;
  /** Sets latestPrice/latestPriceDate for holdings whose schemeCode is in the map. */
  setPricesBySchemeCode(userId: string, prices: { schemeCode: string; price: string; date: string }[]): Promise<number>;
}

export interface HoldingTransactionRepository {
  /** Every transaction of the user, oldest first (date, then id). */
  findAll(userId: string): Promise<HoldingTransactionRecord[]>;
  findByHolding(userId: string, holdingId: string): Promise<HoldingTransactionRecord[]>;
  findById(userId: string, id: string): Promise<HoldingTransactionRecord | null>;
  create(input: NewHoldingTransaction): Promise<HoldingTransactionRecord>;
  createMany(inputs: NewHoldingTransaction[]): Promise<number>;
  update(userId: string, id: string, patch: HoldingTransactionPatch): Promise<HoldingTransactionRecord>;
  delete(userId: string, id: string): Promise<void>;
  deleteByHolding(userId: string, holdingId: string): Promise<void>;
  /** External references already stored, out of the ones given. */
  findExistingRefs(userId: string, refs: string[]): Promise<string[]>;
}

export interface PortfolioDataRepository {
  listBenchmarkSeries(userId: string): Promise<{ series: string; points: number; from: string; to: string }[]>;
  findBenchmarkPoints(userId: string, series: string): Promise<BenchmarkPointRecord[]>;
  replaceBenchmark(userId: string, series: string, points: { date: string; value: string }[]): Promise<number>;
  findFundHoldings(userId: string, holdingId: string): Promise<FundHoldingRecord[]>;
  replaceFundHoldings(userId: string, holdingId: string, rows: NewFundHolding[]): Promise<number>;
}

export interface PortfolioImportRepository {
  listBatches(userId: string): Promise<PortfolioImportBatchRecord[]>;
  findBatch(userId: string, id: string): Promise<PortfolioImportBatchRecord | null>;
  createBatch(input: NewPortfolioImportBatch): Promise<PortfolioImportBatchRecord>;
  updateBatch(
    userId: string,
    id: string,
    patch: Partial<Pick<PortfolioImportBatchRecord, 'status' | 'warnings' | 'error'>>,
  ): Promise<PortfolioImportBatchRecord>;
  deleteBatch(userId: string, id: string): Promise<void>;
  insertRows(rows: NewPortfolioImportRow[]): Promise<void>;
  findRows(userId: string, batchId: string): Promise<PortfolioImportRowRecord[]>;
  updateRow(
    userId: string,
    id: string,
    patch: Partial<Pick<PortfolioImportRowRecord, 'status' | 'message' | 'holdingId'>>,
  ): Promise<PortfolioImportRowRecord>;
}

/**
 * Latest prices from outside the ledger. The default `manual` driver returns nothing: prices
 * are whatever the user entered or a NAV file import set. Any driver that reaches the network
 * must be configured explicitly; nothing here calls out on its own.
 */
export interface MarketData {
  readonly driver: string;
  /** Latest price per unit for each holding it can price, keyed by holding id. */
  latestPrices(holdings: HoldingRecord[]): Promise<Map<string, { price: string; date: string }>>;
}

export const manualMarketData: MarketData = {
  driver: 'manual',
  latestPrices: async () => new Map(),
};
