/*
 * Trading journal domain.
 *
 * A trade is one fill as the broker reported it. Trades are never edited by the analysis
 * layer; everything above them — positions, charges, metrics, behaviour, tax — is derived
 * deterministically from the trade list and a fixed `asOf` date, so the same inputs always
 * produce the same report.
 *
 * Money is an exact decimal string at 4 dp (see money.ts). Quantities are whole units
 * (shares, or contracts × lot size) held as integer strings: no Indian exchange fills a
 * fractional share, and keeping them integral makes lot arithmetic exact.
 *
 * Advice level 0–1: analysis of the user's own fills, plus education. Nothing in this module
 * suggests a trade, a target or a stop.
 */

/** Where the fill happened. Drives the charge table. */
export type TradeExchange = 'NSE' | 'BSE' | 'NFO' | 'BFO' | 'CDS' | 'BCD' | 'MCX';

/**
 * The tax-and-charges bucket a fill belongs to. This is the single axis the charges engine,
 * the tax split and the metrics breakdowns all pivot on.
 */
export type TradeSegment =
  | 'EQUITY_DELIVERY'
  | 'EQUITY_INTRADAY'
  | 'EQUITY_FUTURES'
  | 'EQUITY_OPTIONS'
  | 'INDEX_FUTURES'
  | 'INDEX_OPTIONS'
  | 'CURRENCY_FUTURES'
  | 'CURRENCY_OPTIONS'
  | 'COMMODITY_FUTURES'
  | 'COMMODITY_OPTIONS';

export const SEGMENTS: TradeSegment[] = [
  'EQUITY_DELIVERY',
  'EQUITY_INTRADAY',
  'EQUITY_FUTURES',
  'EQUITY_OPTIONS',
  'INDEX_FUTURES',
  'INDEX_OPTIONS',
  'CURRENCY_FUTURES',
  'CURRENCY_OPTIONS',
  'COMMODITY_FUTURES',
  'COMMODITY_OPTIONS',
];

export const OPTION_SEGMENTS: TradeSegment[] = ['EQUITY_OPTIONS', 'INDEX_OPTIONS', 'CURRENCY_OPTIONS', 'COMMODITY_OPTIONS'];
export const FUTURES_SEGMENTS: TradeSegment[] = ['EQUITY_FUTURES', 'INDEX_FUTURES', 'CURRENCY_FUTURES', 'COMMODITY_FUTURES'];
/** Segments taxed as non-speculative business income (F&O). */
export const DERIVATIVE_SEGMENTS: TradeSegment[] = [...FUTURES_SEGMENTS, ...OPTION_SEGMENTS];

export const isOptionSegment = (segment: TradeSegment) => OPTION_SEGMENTS.includes(segment);
export const isFuturesSegment = (segment: TradeSegment) => FUTURES_SEGMENTS.includes(segment);
export const isDerivativeSegment = (segment: TradeSegment) => DERIVATIVE_SEGMENTS.includes(segment);

export type TradeSide = 'BUY' | 'SELL';
export type OptionRight = 'CE' | 'PE';

/**
 * How a fill came about. Ordinary fills are `TRADE`. The reconstruction adds the rest when a
 * derivative position runs into its expiry without a closing fill; they are marked so the UI
 * can say a leg was settled rather than traded.
 */
export type TradeKind = 'TRADE' | 'EXPIRY' | 'EXERCISE' | 'ASSIGNMENT';

/** Where a charge figure came from, so an estimate is never presented as fact. */
export type ChargesSource = 'BROKER' | 'ESTIMATED' | 'MIXED';

/** How long a round trip was held, in trading sessions. */
export type TradeStyle = 'INTRADAY' | 'BTST' | 'SWING' | 'POSITIONAL';

export interface TradeRecord {
  id: string;
  userId: string;
  /** Session date of the fill, YYYY-MM-DD. */
  date: string;
  /** Fill time in the user's exchange timezone, HH:MM:SS; null when the file had no time. */
  time: string | null;
  broker: string;
  exchange: TradeExchange;
  segment: TradeSegment;
  kind: TradeKind;
  /** The broker's trading symbol as filed, e.g. "NIFTY24SEP24500CE" or "INFY". */
  symbol: string;
  /** Underlying scrip or index, parsed out of the symbol. Equals `symbol` for cash trades. */
  underlying: string;
  isin: string | null;
  expiry: string | null;
  /** Option strike as an exact decimal string; null for futures and cash. */
  strike: string | null;
  right: OptionRight | null;
  /** Contract multiplier. 1 for cash equity. */
  lotSize: number;
  side: TradeSide;
  /** Whole units filled (shares, or contracts × lotSize). Always positive. */
  quantity: string;
  /** Price per unit. */
  price: string;
  /** quantity × price, always positive. */
  amount: string;
  brokerage: string;
  stt: string;
  exchangeCharges: string;
  sebiCharges: string;
  stampDuty: string;
  gst: string;
  dpCharges: string;
  otherCharges: string;
  /** Sum of the eight components above. */
  totalCharges: string;
  chargesSource: ChargesSource;
  orderId: string | null;
  tradeRef: string | null;
  notes: string | null;
  /** Duplicate key from the file this row came from; null for manual entries. */
  externalRef: string | null;
  /**
   * True for a fill produced by the Strategy Lab's paper trading rather than by a broker.
   * Every journal query excludes these unless it is asked for them, so a simulated trade can
   * never quietly improve the metrics that describe real money.
   */
  isPaper: boolean;
  /** The paper account the fill belongs to, when it is a simulated one. */
  paperAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type Generated = 'id' | 'createdAt' | 'updatedAt';
export type NewTrade = Omit<TradeRecord, Generated>;
export type TradePatch = Partial<Omit<TradeRecord, Generated | 'userId'>>;

export interface TradeFilter {
  from?: string;
  to?: string;
  segment?: TradeSegment;
  underlying?: string;
  symbol?: string;
  side?: TradeSide;
  broker?: string;
  /**
   * Paper fills are left out unless this is set. The default is the safe one on purpose: a
   * caller that forgets the flag gets real trades, never a mix.
   */
  includePaper?: boolean;
  /** Only this paper account's fills. Implies includePaper. */
  paperAccountId?: string;
}

/** Per-trade breakdown of the eight charge components. */
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
  source: ChargesSource;
}

export const ZERO_CHARGES: ChargeBreakdown = {
  brokerage: '0',
  stt: '0',
  exchangeCharges: '0',
  sebiCharges: '0',
  stampDuty: '0',
  gst: '0',
  dpCharges: '0',
  otherCharges: '0',
  total: '0',
  source: 'ESTIMATED',
};

/** A journal entry hangs off the round trip it describes. */
export interface JournalEntryRecord {
  id: string;
  userId: string;
  /** The id of the trade that opened the round trip; stable while the trade exists. */
  positionId: string;
  notes: string | null;
  setupTags: string[];
  emotionTags: string[];
  /** Ticked items from the mistakes checklist. */
  mistakes: string[];
  /** The stop the user had in mind, used for R-multiples. */
  stopPrice: string | null;
  targetPrice: string | null;
  screenshots: JournalAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalAttachment {
  /** Path inside the configured local attachments directory. Never a URL. */
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export type NewJournalEntry = Omit<JournalEntryRecord, Generated>;
export type JournalEntryPatch = Partial<
  Pick<JournalEntryRecord, 'notes' | 'setupTags' | 'emotionTags' | 'mistakes' | 'stopPrice' | 'targetPrice' | 'screenshots'>
>;

/** The mistakes checklist the UI offers. Neutral descriptions of process, not of outcome. */
export const MISTAKE_CHECKLIST = [
  'No plan before entry',
  'Moved the stop against me',
  'No stop at all',
  'Size larger than planned',
  'Entered late, chasing',
  'Exited early out of fear',
  'Held past the plan, hoping',
  'Averaged down on a loser',
  'Traded outside my setup',
  'Traded to make back a loss',
] as const;

// ---- per-user configuration ----

/** A broker's brokerage plan, per segment. All rates are exact decimal strings in percent. */
export interface BrokeragePlan {
  /** Percent of turnover per order, e.g. "0.03". */
  percent: string;
  /** Rupee cap per order, e.g. "20"; null for uncapped. */
  cap: string | null;
  /** Flat rupees per order, used when `percent` is "0" (options are usually flat ₹20). */
  flat: string;
}

export interface BrokerConfig {
  /** Broker name as it appears on imported trades. */
  broker: string;
  plans: Partial<Record<TradeSegment, BrokeragePlan>>;
  /** Rupees per scrip per day charged on equity delivery sells, before GST. */
  dpChargePerScrip: string;
  /** Annual demat maintenance, informational only; excluded from trade P&L. */
  annualMaintenance: string;
}

export interface TradingSettingsRecord {
  userId: string;
  /** Per-broker brokerage plans; the default discount plan is used for anything missing. */
  brokers: BrokerConfig[];
  /** A trade opened within this many minutes of closing a loser is flagged as a revenge trade. */
  revengeWindowMinutes: number;
  /** A day is flagged as over-trading when its trade count is this multiple of the median. */
  overTradingMultiple: string;
  /** Assumed annual index return for the reality check when no benchmark series is imported. */
  assumedIndexReturnPercent: string;
  /** Assumed annual fixed-deposit rate for the reality check. */
  assumedFdRatePercent: string;
  /** Benchmark series name to prefer for the reality check, from the portfolio module. */
  benchmarkSeries: string | null;
  /** The user's own setup vocabulary, offered in the journal editor. */
  setupTags: string[];
  emotionTags: string[];
  updatedAt: Date;
}

export type TradingSettingsPatch = Partial<Omit<TradingSettingsRecord, 'userId' | 'updatedAt'>>;

export const DEFAULT_TRADING_SETTINGS: Omit<TradingSettingsRecord, 'userId' | 'updatedAt'> = {
  brokers: [],
  revengeWindowMinutes: 15,
  overTradingMultiple: '2',
  assumedIndexReturnPercent: '12',
  assumedFdRatePercent: '7',
  benchmarkSeries: null,
  setupTags: ['Breakout', 'Pullback', 'Range', 'Reversal', 'Gap', 'Expiry', 'News', 'Hedge'],
  emotionTags: ['Calm', 'Confident', 'Impatient', 'Fearful', 'Greedy', 'Bored', 'Frustrated', 'FOMO'],
};

// ---- imports ----

export type TradeImportStatus = 'PENDING' | 'READY' | 'COMMITTED' | 'FAILED';
export type TradeImportSource = 'TRADEBOOK_CSV' | 'PNL_CSV' | 'CONTRACT_NOTE_PDF';
export type TradeImportRowStatus = 'NEW' | 'DUPLICATE' | 'ERROR' | 'COMMITTED' | 'SKIPPED';

export interface TradeImportBatchRecord {
  id: string;
  userId: string;
  filename: string;
  source: TradeImportSource;
  /** The mapping profile that recognised the file, e.g. "zerodha-tradebook" or "generic". */
  profile: string;
  broker: string;
  status: TradeImportStatus;
  warnings: string[];
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewTradeImportBatch = Omit<TradeImportBatchRecord, Generated>;

/** One parsed fill awaiting review. */
export interface ParsedTradeRow {
  date: string;
  time: string | null;
  broker: string;
  exchange: TradeExchange;
  segment: TradeSegment;
  symbol: string;
  underlying: string;
  isin: string | null;
  expiry: string | null;
  strike: string | null;
  right: OptionRight | null;
  lotSize: number;
  side: TradeSide;
  quantity: string;
  price: string;
  amount: string;
  /** Charges the file itself stated, when it had them; otherwise null and we estimate. */
  reportedCharges: Partial<ChargeBreakdown> | null;
  orderId: string | null;
  tradeRef: string | null;
  externalRef: string;
}

export interface TradeImportRowRecord {
  id: string;
  userId: string;
  batchId: string;
  rowNumber: number;
  status: TradeImportRowStatus;
  message: string | null;
  parsed: ParsedTradeRow;
  createdAt: Date;
}

export type NewTradeImportRow = Omit<TradeImportRowRecord, 'id' | 'createdAt'>;

// ---- persistence ports ----

export interface TradeRepository {
  /** Every trade of the user in fill order: date, then time, then id. */
  findAll(userId: string, filter?: TradeFilter): Promise<TradeRecord[]>;
  findById(userId: string, id: string): Promise<TradeRecord | null>;
  create(input: NewTrade): Promise<TradeRecord>;
  createMany(inputs: NewTrade[]): Promise<number>;
  update(userId: string, id: string, patch: TradePatch): Promise<TradeRecord>;
  delete(userId: string, id: string): Promise<void>;
  /** External references already stored, out of the ones given. */
  findExistingRefs(userId: string, refs: string[]): Promise<string[]>;
  /** Distinct broker names on the user's trades. */
  listBrokers(userId: string): Promise<string[]>;
}

export interface JournalRepository {
  findAll(userId: string): Promise<JournalEntryRecord[]>;
  findByPosition(userId: string, positionId: string): Promise<JournalEntryRecord | null>;
  upsert(userId: string, positionId: string, patch: JournalEntryPatch): Promise<JournalEntryRecord>;
  delete(userId: string, positionId: string): Promise<void>;
}

export interface TradingSettingsRepository {
  find(userId: string): Promise<TradingSettingsRecord | null>;
  save(userId: string, patch: TradingSettingsPatch): Promise<TradingSettingsRecord>;
}

export interface TradeImportRepository {
  listBatches(userId: string): Promise<TradeImportBatchRecord[]>;
  findBatch(userId: string, id: string): Promise<TradeImportBatchRecord | null>;
  createBatch(input: NewTradeImportBatch): Promise<TradeImportBatchRecord>;
  updateBatch(
    userId: string,
    id: string,
    patch: Partial<Pick<TradeImportBatchRecord, 'status' | 'warnings' | 'error' | 'profile' | 'broker'>>,
  ): Promise<TradeImportBatchRecord>;
  deleteBatch(userId: string, id: string): Promise<void>;
  insertRows(rows: NewTradeImportRow[]): Promise<void>;
  findRows(userId: string, batchId: string): Promise<TradeImportRowRecord[]>;
  updateRow(userId: string, id: string, patch: Partial<Pick<TradeImportRowRecord, 'status' | 'message'>>): Promise<TradeImportRowRecord>;
}

/**
 * Local storage for journal screenshots. Files never leave the machine: the driver writes
 * under a configured directory and hands back a relative path.
 */
export interface AttachmentStore {
  save(userId: string, filename: string, mimeType: string, bytes: Uint8Array): Promise<JournalAttachment>;
  read(userId: string, path: string): Promise<Uint8Array>;
  remove(userId: string, path: string): Promise<void>;
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Shown wherever a trading figure could be mistaken for a suggestion. */
export const TRADING_DISCLAIMER =
  'These figures describe trades you have already made. They are analysis and education, not investment advice, and past results say nothing about future ones.';
