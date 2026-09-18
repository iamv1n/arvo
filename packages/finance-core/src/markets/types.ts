/*
 * Markets & Alerts domain.
 *
 * Advice level 3 and no further: the user writes the rule, Arvo evaluates it and tells them
 * what happened. Nothing in this module produces a buy or sell signal, ranks instruments, or
 * says what anyone should do next. An alert is a saved question ("has NIFTY closed above
 * 25,000?"), and a trigger is the answer with the evidence attached.
 *
 * Money is an exact decimal string (4 dp, see money.ts). Dates are YYYY-MM-DD. Everything is
 * user-scoped and a record belonging to someone else is reported as absent, never forbidden.
 */

export const MARKETS_DISCLAIMER =
  'Alerts are yours: Arvo evaluates the rules you wrote and never recommends a trade, a target or a direction.';

type Generated = 'id' | 'createdAt' | 'updatedAt';

// ---- watchlists ----

/** A named list. Order within the user's lists is explicit so drag-to-reorder survives reloads. */
export interface WatchlistRecord {
  id: string;
  userId: string;
  name: string;
  notes: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewWatchlist = Omit<WatchlistRecord, Generated>;
export type WatchlistPatch = Partial<Pick<WatchlistRecord, 'name' | 'notes' | 'position'>>;

/**
 * One instrument on a list. Identity is carried the same way the portfolio and trading modules
 * carry it — symbol, exchange, ISIN, scheme code — rather than as a foreign key, because a
 * watchlist is explicitly for things the user does *not* own yet.
 */
export interface WatchlistItemRecord {
  id: string;
  userId: string;
  watchlistId: string;
  /** Exchange trading symbol, upper-cased. The primary key for quotes and bars. */
  symbol: string;
  /** NSE, BSE, MCX … or null for anything not exchange traded. */
  exchange: string | null;
  /** Display name; falls back to the symbol in the UI when blank. */
  name: string | null;
  isin: string | null;
  schemeCode: string | null;
  notes: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewWatchlistItem = Omit<WatchlistItemRecord, Generated>;
export type WatchlistItemPatch = Partial<Pick<WatchlistItemRecord, 'symbol' | 'exchange' | 'name' | 'isin' | 'schemeCode' | 'notes' | 'position'>>;

export const MAX_WATCHLISTS = 25;
export const MAX_WATCHLIST_ITEMS = 250;

// ---- quotes ----

export type QuoteSource = 'MANUAL' | 'BARS' | 'HOLDING' | 'PROVIDER';

/**
 * The last price Arvo knows for a symbol and where it came from. This is a cache, not a
 * ledger: it is always safe to delete, and every reader must be prepared for it to be old,
 * which is why `asOf` is stored next to the price rather than inferred from `fetchedAt`.
 */
export interface QuoteRecord {
  id: string;
  userId: string;
  symbol: string;
  exchange: string | null;
  price: string;
  /** The previous session's close, when known; the day change needs two closes. */
  previousClose: string | null;
  /** Session the price belongs to. */
  asOf: string;
  source: QuoteSource;
  /** When this row was written. Staleness is measured from here. */
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type QuoteUpsert = Pick<QuoteRecord, 'userId' | 'symbol' | 'exchange' | 'price' | 'previousClose' | 'asOf' | 'source' | 'fetchedAt'>;

/** What a driver returns for one symbol. Nothing here is persisted until the service says so. */
export interface QuoteTick {
  symbol: string;
  price: string;
  previousClose: string | null;
  asOf: string;
}

/**
 * A live quote source. The default driver returns nothing at all: prices are whatever the user
 * typed or an import wrote. Any driver that reaches the network is configured explicitly by the
 * user, is never constructed in tests, and its failures degrade to the last known value.
 */
export interface QuoteProvider {
  readonly driver: string;
  quotes(symbols: { symbol: string; exchange: string | null }[]): Promise<QuoteTick[]>;
}

export const manualQuoteProvider: QuoteProvider = {
  driver: 'manual',
  quotes: async () => [],
};

/** A watchlist row as the UI reads it: identity, last price, range, and the user's own position. */
export interface WatchlistRow {
  item: Omit<WatchlistItemRecord, 'userId'>;
  price: string | null;
  previousClose: string | null;
  /** price − previousClose, and the same as a percentage, when both closes are known. */
  dayChange: string | null;
  dayChangePercent: string | null;
  asOf: string | null;
  source: QuoteSource | null;
  /** True when the quote is older than the user's staleness threshold. */
  isStale: boolean;
  /** From imported daily bars, when there are any in the last 52 weeks. */
  fiftyTwoWeekHigh: string | null;
  fiftyTwoWeekLow: string | null;
  /** Closes for a sparkline, oldest first, when bars exist. Capped at 60 points. */
  sparkline: string[];
  /** Present only when the user actually holds this instrument. */
  holding: {
    id: string;
    name: string;
    quantity: string;
    averageCost: string | null;
    value: string;
    unrealisedGain: string;
  } | null;
}

export interface WatchlistView {
  watchlist: Omit<WatchlistRecord, 'userId'>;
  rows: WatchlistRow[];
  /** The newest quote timestamp on the list, for the "stale as of …" label. */
  quotedAt: Date | null;
  staleMinutes: number;
  driver: string;
  disclaimer: string;
}

// ---- calendars ----

export type CorporateActionKind = 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'BUYBACK' | 'RIGHTS';

export const CORPORATE_ACTION_KINDS: CorporateActionKind[] = ['DIVIDEND', 'SPLIT', 'BONUS', 'BUYBACK', 'RIGHTS'];

export interface CorporateActionRecord {
  id: string;
  userId: string;
  symbol: string;
  name: string | null;
  kind: CorporateActionKind;
  exDate: string;
  recordDate: string | null;
  payDate: string | null;
  /** Amount per share for a dividend or buyback price; null for ratio-shaped actions. */
  amount: string | null;
  /** "1:5", "2:1" … as written by the exchange; kept verbatim. */
  ratio: string | null;
  notes: string | null;
  source: 'MANUAL' | 'IMPORT';
  createdAt: Date;
  updatedAt: Date;
}

export type NewCorporateAction = Omit<CorporateActionRecord, Generated>;
export type CorporateActionPatch = Partial<Omit<CorporateActionRecord, Generated | 'userId'>>;

/** A trading holiday the user imported. Expiries move back onto the previous trading day. */
export interface TradingHolidayRecord {
  id: string;
  userId: string;
  date: string;
  name: string;
  exchange: string;
  createdAt: Date;
}

export type NewTradingHoliday = Omit<TradingHolidayRecord, 'id' | 'createdAt'>;

export type IpoStatus = 'UPCOMING' | 'OPEN' | 'CLOSED' | 'LISTED' | 'WITHDRAWN';

export const IPO_STATUSES: IpoStatus[] = ['UPCOMING', 'OPEN', 'CLOSED', 'LISTED', 'WITHDRAWN'];

export interface IpoRecord {
  id: string;
  userId: string;
  name: string;
  symbol: string | null;
  openDate: string | null;
  closeDate: string | null;
  priceBandLow: string | null;
  priceBandHigh: string | null;
  lotSize: number | null;
  listingDate: string | null;
  status: IpoStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewIpo = Omit<IpoRecord, Generated>;
export type IpoPatch = Partial<Omit<IpoRecord, Generated | 'userId'>>;

/** One row of the merged upcoming-events view. */
export interface MarketEvent {
  kind: 'EXPIRY' | 'CORPORATE_ACTION' | 'IPO';
  date: string;
  title: string;
  detail: string;
  /** Instrument the event concerns, when it concerns one. */
  symbol: string | null;
  /** True when the user holds or watches the instrument. */
  isRelevant: boolean;
  meta: Record<string, string | number | null>;
}

// ---- alerts ----

export type AlertKind =
  | 'PRICE_LEVEL'
  | 'PORTFOLIO_DRAWDOWN'
  | 'HOLDING_PNL'
  | 'SIP_MISSED'
  | 'OPTION_DELTA'
  | 'REALISED_LOSS_LIMIT'
  | 'TRADE_COUNT'
  | 'EXPIRY_UPCOMING'
  | 'CORPORATE_ACTION';

export const ALERT_KINDS: AlertKind[] = [
  'PRICE_LEVEL',
  'PORTFOLIO_DRAWDOWN',
  'HOLDING_PNL',
  'SIP_MISSED',
  'OPTION_DELTA',
  'REALISED_LOSS_LIMIT',
  'TRADE_COUNT',
  'EXPIRY_UPCOMING',
  'CORPORATE_ACTION',
];

/** Alert kinds whose answer depends on a market price, and so refuse to fire on stale data. */
export const MARKET_DEPENDENT_KINDS: AlertKind[] = ['PRICE_LEVEL', 'PORTFOLIO_DRAWDOWN', 'HOLDING_PNL', 'OPTION_DELTA'];

export type AlertDirection = 'ABOVE' | 'BELOW';

export type AlertChannel = 'IN_APP' | 'EMAIL' | 'TELEGRAM';

export const ALERT_CHANNELS: AlertChannel[] = ['IN_APP', 'EMAIL', 'TELEGRAM'];

/**
 * The parameters of every alert kind, as one discriminated union. They are stored as JSON and
 * validated on the way in, so a rule written by an old client cannot quietly change meaning.
 */
export type AlertParams =
  | { kind: 'PRICE_LEVEL'; symbol: string; exchange: string | null; direction: AlertDirection; level: string }
  | { kind: 'PORTFOLIO_DRAWDOWN'; percent: string }
  | { kind: 'HOLDING_PNL'; holdingId: string; mode: 'PERCENT' | 'AMOUNT'; direction: AlertDirection; value: string }
  | { kind: 'SIP_MISSED'; seriesId: string | null; label: string | null; graceDays: number }
  | { kind: 'OPTION_DELTA'; positionId: string | null; label: string | null; maxAbsDelta: string; spot: string; impliedVolatilityPercent: string }
  | { kind: 'REALISED_LOSS_LIMIT'; window: 'DAY' | 'WEEK'; amount: string }
  | { kind: 'TRADE_COUNT'; count: number }
  | { kind: 'EXPIRY_UPCOMING'; daysBefore: number }
  | { kind: 'CORPORATE_ACTION'; daysBefore: number };

export type AlertStatus = 'OK' | 'TRIGGERED' | 'COOLING_DOWN' | 'SKIPPED_STALE' | 'ERROR';

export interface AlertRecord {
  id: string;
  userId: string;
  name: string;
  kind: AlertKind;
  params: AlertParams;
  isEnabled: boolean;
  /** Fire at most once per this many minutes. A one-shot alert disables itself after firing. */
  cooldownMinutes: number;
  /** False means one-shot: the alert turns itself off once it has fired. */
  repeats: boolean;
  channels: AlertChannel[];
  lastTriggeredAt: Date | null;
  lastEvaluatedAt: Date | null;
  lastStatus: AlertStatus | null;
  /** Why the last evaluation did nothing, when it did nothing interesting. */
  lastMessage: string | null;
  triggerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAlert = Omit<AlertRecord, Generated | 'lastTriggeredAt' | 'lastEvaluatedAt' | 'lastStatus' | 'lastMessage' | 'triggerCount'>;
export type AlertPatch = Partial<Pick<AlertRecord, 'name' | 'params' | 'isEnabled' | 'cooldownMinutes' | 'repeats' | 'channels'>>;

/** What happened, when, and the numbers that made it happen. */
export interface AlertTriggerRecord {
  id: string;
  userId: string;
  alertId: string;
  firedAt: Date;
  message: string;
  /** The snapshot the decision was made from; never recomputed, so history stays honest. */
  evidence: Record<string, unknown>;
  channels: AlertChannel[];
  createdAt: Date;
}

export type NewAlertTrigger = Omit<AlertTriggerRecord, 'id' | 'createdAt'>;

export const MAX_ALERTS = 100;
export const MAX_ALERT_TRIGGERS_KEPT = 50;

/** The outcome of evaluating one alert. `fired` is the only outcome that notifies anyone. */
export interface AlertEvaluation {
  alertId: string;
  name: string;
  kind: AlertKind;
  status: AlertStatus;
  fired: boolean;
  message: string;
  evidence: Record<string, unknown>;
}

// ---- notifications ----

export type NotificationKind = 'ALERT' | 'GUARDRAIL' | 'NEWS_DIGEST' | 'SYSTEM';

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path the bell links to, e.g. "/markets?tab=alerts". */
  link: string | null;
  readAt: Date | null;
  meta: Record<string, unknown>;
  createdAt: Date;
}

export type NewNotification = Omit<NotificationRecord, 'id' | 'createdAt' | 'readAt'>;

export const MAX_NOTIFICATIONS_KEPT = 200;

export type DigestFrequency = 'off' | 'daily' | 'weekly';

/**
 * Per-user delivery preferences.
 *
 * Quiet hours hold a notification back from email and Telegram; it is still written in-app,
 * because the point of quiet hours is not to be woken, not to lose the record. A window that
 * wraps midnight (22:00–07:00) is normal and handled.
 */
export interface NotificationSettingsRecord {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  /** Chat id the bot posts to. The bot token is server configuration, never user data. */
  telegramChatId: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  /** IANA timezone the quiet hours are read in. */
  timezone: string;
  /** A market-dependent alert older than this many minutes is skipped, not fired. */
  staleQuoteMinutes: number;
  /** Minimum gap between provider refreshes, in seconds. */
  refreshCooldownSeconds: number;
  newsDigestFrequency: DigestFrequency;
  /** Per-index expiry weekday overrides; exchanges move expiry day, so this is configurable. */
  expiryRules: ExpiryRule[];
  /**
   * Highest portfolio value the alert engine has ever observed, and the day it saw it.
   *
   * It lives here rather than in the portfolio module because it is an alerting artefact, not a
   * portfolio fact: the portfolio has no value history to take a maximum of, so drawdown is
   * measured against the high-water mark this engine watched go past.
   */
  portfolioPeakValue: string | null;
  portfolioPeakOn: string | null;
  /** When quotes were last refreshed from a provider; the rate limiter reads it. */
  lastQuoteRefreshAt: Date | null;
  updatedAt: Date;
}

export type NotificationSettingsPatch = Partial<Omit<NotificationSettingsRecord, 'userId' | 'updatedAt'>>;

export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettingsRecord, 'userId' | 'updatedAt'> = {
  inAppEnabled: true,
  emailEnabled: false,
  telegramEnabled: false,
  telegramChatId: null,
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: 'Asia/Kolkata',
  staleQuoteMinutes: 1440,
  refreshCooldownSeconds: 60,
  newsDigestFrequency: 'off',
  expiryRules: [],
  portfolioPeakValue: null,
  portfolioPeakOn: null,
  lastQuoteRefreshAt: null,
};

// ---- expiries ----

/**
 * How one index's contracts expire.
 *
 * `weekday` is 0 (Sunday) to 6 (Saturday). NSE moved index expiry from Thursday to Tuesday, and
 * BSE to Thursday, which is exactly why this is a setting and not a constant: the defaults below
 * are current NSE/BSE rules and the user overrides them per index when an exchange moves again.
 */
export interface ExpiryRule {
  index: string;
  /** True when the index has weekly contracts as well as monthly ones. */
  weekly: boolean;
  weekday: number;
  /** Monthly contracts expire on the last `weekday` of the month. */
  monthly: boolean;
}

/** Current rules as of September 2026. NSE indices expire Tuesday, BSE indices Thursday. */
export const DEFAULT_EXPIRY_RULES: ExpiryRule[] = [
  { index: 'NIFTY', weekly: true, weekday: 2, monthly: true },
  { index: 'BANKNIFTY', weekly: false, weekday: 2, monthly: true },
  { index: 'FINNIFTY', weekly: false, weekday: 2, monthly: true },
  { index: 'MIDCPNIFTY', weekly: false, weekday: 2, monthly: true },
  { index: 'NIFTYNXT50', weekly: false, weekday: 2, monthly: true },
  { index: 'SENSEX', weekly: true, weekday: 4, monthly: true },
  { index: 'BANKEX', weekly: false, weekday: 4, monthly: true },
];

export interface ExpiryEvent {
  index: string;
  date: string;
  cadence: 'WEEKLY' | 'MONTHLY';
  /** Set when a holiday or weekend moved the expiry off its nominal day. */
  shiftedFrom: string | null;
}

// ---- news ----

export interface NewsFeedRecord {
  id: string;
  userId: string;
  url: string;
  title: string | null;
  isEnabled: boolean;
  lastFetchedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewNewsFeed = Omit<NewsFeedRecord, Generated | 'lastFetchedAt' | 'lastError'>;
export type NewsFeedPatch = Partial<Pick<NewsFeedRecord, 'url' | 'title' | 'isEnabled' | 'lastFetchedAt' | 'lastError'>>;

export interface NewsHeadline {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
}

/** Headlines grouped by instrument, with one neutral AI summary each. */
export interface NewsDigestItem {
  symbol: string;
  name: string | null;
  /** Neutral summary of the headlines. Never a view on direction. */
  summary: string;
  headlines: NewsHeadline[];
}

export interface NewsDigestRecord {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  items: NewsDigestItem[];
  /** The provider that wrote the summaries, or "none" when AI was off and headlines were listed raw. */
  provider: string;
  createdAt: Date;
}

export type NewNewsDigest = Omit<NewsDigestRecord, 'id' | 'createdAt'>;

export const MAX_NEWS_FEEDS = 20;

// ---- guardrails ----

export type GuardrailKind = 'MAX_LOSS_DAY' | 'MAX_LOSS_WEEK' | 'MAX_TRADES_DAY';

export const GUARDRAIL_KINDS: GuardrailKind[] = ['MAX_LOSS_DAY', 'MAX_LOSS_WEEK', 'MAX_TRADES_DAY'];

/**
 * A recorded breach of a limit the user set for themselves. One row per (kind, period), so a
 * day that goes further past the limit does not send a second email.
 */
export interface GuardrailBreachRecord {
  id: string;
  userId: string;
  kind: GuardrailKind;
  /** First day of the period the limit covers: the day itself, or the week's Monday. */
  periodStart: string;
  limit: string;
  actual: string;
  notifiedAt: Date | null;
  createdAt: Date;
}

export type NewGuardrailBreach = Omit<GuardrailBreachRecord, 'id' | 'createdAt'>;

/** What /trading and the dashboard show. Informational; it never blocks anything. */
export interface GuardrailStatus {
  kind: GuardrailKind;
  label: string;
  limit: string;
  actual: string;
  breached: boolean;
  periodStart: string;
  periodEnd: string;
}

export interface CoolOffState {
  active: boolean;
  statuses: GuardrailStatus[];
  message: string | null;
}

// ---- repositories ----

export interface WatchlistRepository {
  list(userId: string): Promise<WatchlistRecord[]>;
  find(userId: string, id: string): Promise<WatchlistRecord | null>;
  create(input: NewWatchlist): Promise<WatchlistRecord>;
  update(userId: string, id: string, patch: WatchlistPatch): Promise<WatchlistRecord>;
  delete(userId: string, id: string): Promise<void>;
  count(userId: string): Promise<number>;
  listItems(userId: string, watchlistId?: string): Promise<WatchlistItemRecord[]>;
  findItem(userId: string, id: string): Promise<WatchlistItemRecord | null>;
  createItem(input: NewWatchlistItem): Promise<WatchlistItemRecord>;
  updateItem(userId: string, id: string, patch: WatchlistItemPatch): Promise<WatchlistItemRecord>;
  deleteItem(userId: string, id: string): Promise<void>;
  countItems(userId: string, watchlistId: string): Promise<number>;
  /** Applies an explicit ordering; ids not owned by the user are ignored. */
  reorderItems(userId: string, watchlistId: string, ids: string[]): Promise<void>;
}

export interface QuoteRepository {
  list(userId: string): Promise<QuoteRecord[]>;
  findBySymbols(userId: string, symbols: string[]): Promise<QuoteRecord[]>;
  /** Inserts or replaces by (user, symbol, exchange). */
  upsertMany(rows: QuoteUpsert[]): Promise<number>;
  delete(userId: string, symbol: string, exchange: string | null): Promise<void>;
}

export interface MarketCalendarRepository {
  listCorporateActions(userId: string, filter?: { from?: string; to?: string; symbols?: string[] }): Promise<CorporateActionRecord[]>;
  findCorporateAction(userId: string, id: string): Promise<CorporateActionRecord | null>;
  createCorporateAction(input: NewCorporateAction): Promise<CorporateActionRecord>;
  createCorporateActions(inputs: NewCorporateAction[]): Promise<number>;
  updateCorporateAction(userId: string, id: string, patch: CorporateActionPatch): Promise<CorporateActionRecord>;
  deleteCorporateAction(userId: string, id: string): Promise<void>;

  listHolidays(userId: string, exchange?: string): Promise<TradingHolidayRecord[]>;
  replaceHolidays(userId: string, exchange: string, rows: { date: string; name: string }[]): Promise<number>;
  deleteHoliday(userId: string, id: string): Promise<void>;

  listIpos(userId: string): Promise<IpoRecord[]>;
  findIpo(userId: string, id: string): Promise<IpoRecord | null>;
  createIpo(input: NewIpo): Promise<IpoRecord>;
  createIpos(inputs: NewIpo[]): Promise<number>;
  updateIpo(userId: string, id: string, patch: IpoPatch): Promise<IpoRecord>;
  deleteIpo(userId: string, id: string): Promise<void>;
}

export interface AlertRepository {
  list(userId: string): Promise<AlertRecord[]>;
  /** Every enabled alert of every user, for the scheduler. */
  listDue(): Promise<AlertRecord[]>;
  find(userId: string, id: string): Promise<AlertRecord | null>;
  create(input: NewAlert): Promise<AlertRecord>;
  update(userId: string, id: string, patch: AlertPatch): Promise<AlertRecord>;
  /** Writes the outcome of an evaluation. Separate from update() so user edits cannot race it. */
  recordEvaluation(
    userId: string,
    id: string,
    outcome: { at: Date; status: AlertStatus; message: string | null; fired: boolean; disable?: boolean },
  ): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
  count(userId: string): Promise<number>;
  listTriggers(userId: string, alertId?: string, limit?: number): Promise<AlertTriggerRecord[]>;
  createTrigger(input: NewAlertTrigger): Promise<AlertTriggerRecord>;
  /** Keeps the newest `keep` triggers of an alert and drops the rest. */
  pruneTriggers(userId: string, alertId: string, keep: number): Promise<void>;
}

export interface NotificationRepository {
  list(userId: string, filter?: { unreadOnly?: boolean; limit?: number }): Promise<NotificationRecord[]>;
  unreadCount(userId: string): Promise<number>;
  create(input: NewNotification): Promise<NotificationRecord>;
  markRead(userId: string, ids: string[]): Promise<number>;
  markAllRead(userId: string): Promise<number>;
  delete(userId: string, id: string): Promise<void>;
  prune(userId: string, keep: number): Promise<void>;
  findSettings(userId: string): Promise<NotificationSettingsRecord | null>;
  saveSettings(userId: string, patch: NotificationSettingsPatch): Promise<NotificationSettingsRecord>;
  /** Every user with at least one enabled alert or a news digest, for the scheduler. */
  listUserIdsWithAlerts(): Promise<string[]>;
}

export interface NewsRepository {
  listFeeds(userId: string): Promise<NewsFeedRecord[]>;
  findFeed(userId: string, id: string): Promise<NewsFeedRecord | null>;
  createFeed(input: NewNewsFeed): Promise<NewsFeedRecord>;
  updateFeed(userId: string, id: string, patch: NewsFeedPatch): Promise<NewsFeedRecord>;
  deleteFeed(userId: string, id: string): Promise<void>;
  listDigests(userId: string, limit?: number): Promise<NewsDigestRecord[]>;
  findDigest(userId: string, id: string): Promise<NewsDigestRecord | null>;
  createDigest(input: NewNewsDigest): Promise<NewsDigestRecord>;
  deleteDigest(userId: string, id: string): Promise<void>;
}

export interface GuardrailRepository {
  list(userId: string, from?: string): Promise<GuardrailBreachRecord[]>;
  /** Inserts only when (user, kind, periodStart) is new; returns the row when it inserted one. */
  claim(input: NewGuardrailBreach): Promise<GuardrailBreachRecord | null>;
  markNotified(userId: string, id: string, at: Date): Promise<void>;
}
