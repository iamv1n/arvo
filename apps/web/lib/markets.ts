'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiUpload } from './api';

/*
 * Markets & Alerts: types and queries.
 *
 * They live here rather than in lib/types.ts because the area has a surface of its own, the
 * same reasoning as the Strategy Lab. The types mirror the API responses exactly; anything the
 * server strips (userId, internal ids) is absent here too.
 */

// ---- watchlists ----

export interface Watchlist {
  id: string;
  name: string;
  notes: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistItem {
  id: string;
  watchlistId: string;
  symbol: string;
  exchange: string | null;
  name: string | null;
  isin: string | null;
  schemeCode: string | null;
  notes: string | null;
  position: number;
}

export type QuoteSource = 'MANUAL' | 'BARS' | 'HOLDING' | 'PROVIDER';

export interface WatchlistRow {
  item: WatchlistItem;
  price: string | null;
  previousClose: string | null;
  dayChange: string | null;
  dayChangePercent: string | null;
  asOf: string | null;
  source: QuoteSource | null;
  isStale: boolean;
  fiftyTwoWeekHigh: string | null;
  fiftyTwoWeekLow: string | null;
  sparkline: string[];
  holding: { id: string; name: string; quantity: string; averageCost: string | null; value: string; unrealisedGain: string } | null;
}

export interface WatchlistView {
  watchlist: Watchlist;
  rows: WatchlistRow[];
  quotedAt: string | null;
  staleMinutes: number;
  driver: string;
  disclaimer: string;
}

export interface Quote {
  id: string;
  symbol: string;
  exchange: string | null;
  price: string;
  previousClose: string | null;
  asOf: string;
  source: QuoteSource;
  fetchedAt: string;
}

export interface RefreshResult {
  updated: number;
  driver: string;
  providerCalled: boolean;
  skippedReason: string | null;
  quotes: Quote[];
}

// ---- calendars ----

export type CorporateActionKind = 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'BUYBACK' | 'RIGHTS';

export const CORPORATE_ACTION_KINDS: CorporateActionKind[] = ['DIVIDEND', 'SPLIT', 'BONUS', 'BUYBACK', 'RIGHTS'];

export interface CorporateAction {
  id: string;
  symbol: string;
  name: string | null;
  kind: CorporateActionKind;
  exDate: string;
  recordDate: string | null;
  payDate: string | null;
  amount: string | null;
  ratio: string | null;
  notes: string | null;
  source: 'MANUAL' | 'IMPORT';
}

export type IpoStatus = 'UPCOMING' | 'OPEN' | 'CLOSED' | 'LISTED' | 'WITHDRAWN';

export const IPO_STATUSES: IpoStatus[] = ['UPCOMING', 'OPEN', 'CLOSED', 'LISTED', 'WITHDRAWN'];

export interface Ipo {
  id: string;
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
}

export interface MarketEvent {
  kind: 'EXPIRY' | 'CORPORATE_ACTION' | 'IPO';
  date: string;
  title: string;
  detail: string;
  symbol: string | null;
  isRelevant: boolean;
  meta: Record<string, string | number | null>;
}

export interface ExpiryEvent {
  index: string;
  date: string;
  cadence: 'WEEKLY' | 'MONTHLY';
  shiftedFrom: string | null;
}

export interface ExpiryRule {
  index: string;
  weekly: boolean;
  weekday: number;
  monthly: boolean;
}

export interface TradingHoliday {
  id: string;
  date: string;
  name: string;
  exchange: string;
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

export type AlertChannel = 'IN_APP' | 'EMAIL' | 'TELEGRAM';

export type AlertStatus = 'OK' | 'TRIGGERED' | 'COOLING_DOWN' | 'SKIPPED_STALE' | 'ERROR';

/** The alert kinds, in the order the picker offers them, with the words the user reads. */
export const ALERT_KIND_LABELS: { kind: AlertKind; label: string; hint: string }[] = [
  { kind: 'PRICE_LEVEL', label: 'Price crosses a level', hint: 'For an instrument on one of your watchlists.' },
  { kind: 'HOLDING_PNL', label: 'A holding’s P&L', hint: 'Unrealised gain or loss beyond a percentage or an amount.' },
  { kind: 'PORTFOLIO_DRAWDOWN', label: 'Portfolio drawdown', hint: 'How far below its peak your portfolio has fallen.' },
  { kind: 'SIP_MISSED', label: 'A recurring debit went missing', hint: 'Reuses the recurring series Arvo already detects.' },
  { kind: 'REALISED_LOSS_LIMIT', label: 'Realised loss limit', hint: 'From closed positions in your trading journal.' },
  { kind: 'TRADE_COUNT', label: 'Too many trades in a day', hint: 'Counted from the journal, not from intent.' },
  { kind: 'OPTION_DELTA', label: 'Option position delta', hint: 'Net delta of an open position, from the lab’s Greeks.' },
  { kind: 'EXPIRY_UPCOMING', label: 'An F&O position is expiring', hint: 'Notice a chosen number of days before expiry.' },
  { kind: 'CORPORATE_ACTION', label: 'A corporate action is coming', hint: 'For anything you hold or watch.' },
];

export interface Alert {
  id: string;
  name: string;
  kind: AlertKind;
  params: Record<string, unknown>;
  rule: string;
  isEnabled: boolean;
  cooldownMinutes: number;
  repeats: boolean;
  channels: AlertChannel[];
  lastTriggeredAt: string | null;
  lastEvaluatedAt: string | null;
  lastStatus: AlertStatus | null;
  lastMessage: string | null;
  triggerCount: number;
  createdAt: string;
}

export interface AlertTrigger {
  id: string;
  alertId: string;
  firedAt: string;
  message: string;
  evidence: Record<string, unknown>;
  channels: AlertChannel[];
}

export interface AlertDetail extends Alert {
  triggers: AlertTrigger[];
}

export interface AlertEvaluation {
  alertId: string;
  name: string;
  kind: AlertKind;
  status: AlertStatus;
  fired: boolean;
  message: string;
  evidence: Record<string, unknown>;
  preview?: string;
}

// ---- notifications ----

export interface Notification {
  id: string;
  kind: 'ALERT' | 'GUARDRAIL' | 'NEWS_DIGEST' | 'SYSTEM';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationSettings {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  staleQuoteMinutes: number;
  refreshCooldownSeconds: number;
  newsDigestFrequency: 'off' | 'daily' | 'weekly';
  expiryRules: ExpiryRule[];
  portfolioPeakValue: string | null;
  portfolioPeakOn: string | null;
}

// ---- guardrails and news ----

export interface GuardrailStatus {
  kind: 'MAX_LOSS_DAY' | 'MAX_LOSS_WEEK' | 'MAX_TRADES_DAY';
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

export interface NewsFeed {
  id: string;
  url: string;
  title: string | null;
  isEnabled: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
}

export interface NewsDigest {
  id: string;
  periodStart: string;
  periodEnd: string;
  provider: string;
  createdAt: string;
  items: {
    symbol: string;
    name: string | null;
    summary: string;
    headlines: { title: string; url: string; source: string; publishedAt: string | null }[];
  }[];
}

export interface NewsStatus {
  fetchingEnabled: boolean;
  aiEnabled: boolean;
  feeds: number;
  enabledFeeds: number;
  frequency: 'off' | 'daily' | 'weekly';
}

// ---- queries ----

export const marketKeys = {
  all: ['markets'] as const,
  watchlists: ['markets', 'watchlists'] as const,
  watchlist: (id: string) => ['markets', 'watchlists', id] as const,
  quotes: ['markets', 'quotes'] as const,
  events: ['markets', 'events'] as const,
  expiries: ['markets', 'expiries'] as const,
  corporateActions: ['markets', 'corporate-actions'] as const,
  ipos: ['markets', 'ipos'] as const,
  holidays: ['markets', 'holidays'] as const,
  alerts: ['markets', 'alerts'] as const,
  alert: (id: string) => ['markets', 'alerts', id] as const,
  notifications: ['markets', 'notifications'] as const,
  unread: ['markets', 'notifications', 'unread'] as const,
  settings: ['markets', 'settings'] as const,
  coolOff: ['markets', 'cool-off'] as const,
  news: ['markets', 'news'] as const,
};

export const useWatchlists = () =>
  useQuery({ queryKey: marketKeys.watchlists, queryFn: () => api<{ watchlists: Watchlist[] }>('/watchlists').then((r) => r.watchlists) });

export const useWatchlist = (id: string | null) =>
  useQuery({ queryKey: marketKeys.watchlist(id ?? ''), queryFn: () => api<WatchlistView>(`/watchlists/${id as string}`), enabled: Boolean(id) });

export const useQuotes = () =>
  useQuery({ queryKey: marketKeys.quotes, queryFn: () => api<{ quotes: Quote[]; driver: string; staleMinutes: number }>('/market/quotes') });

export const useMarketEvents = (range: { from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: [...marketKeys.events, range.from ?? '', range.to ?? ''],
    queryFn: () => api<{ events: MarketEvent[] }>('/market/calendars/events', { query: range }).then((r) => r.events),
  });

export const useExpiries = (range: { from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: [...marketKeys.expiries, range.from ?? '', range.to ?? ''],
    queryFn: () => api<{ expiries: ExpiryEvent[]; rules: ExpiryRule[] }>('/market/calendars/expiries', { query: range }),
  });

export const useCorporateActions = (range: { from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: [...marketKeys.corporateActions, range.from ?? '', range.to ?? ''],
    queryFn: () => api<{ actions: CorporateAction[] }>('/market/calendars/corporate-actions', { query: range }).then((r) => r.actions),
  });

export const useIpos = () => useQuery({ queryKey: marketKeys.ipos, queryFn: () => api<{ ipos: Ipo[] }>('/market/calendars/ipos').then((r) => r.ipos) });

export const useHolidays = () =>
  useQuery({ queryKey: marketKeys.holidays, queryFn: () => api<{ holidays: TradingHoliday[] }>('/market/calendars/holidays').then((r) => r.holidays) });

export const useAlerts = () => useQuery({ queryKey: marketKeys.alerts, queryFn: () => api<{ alerts: Alert[] }>('/alerts').then((r) => r.alerts) });

export const useAlert = (id: string | null) =>
  useQuery({ queryKey: marketKeys.alert(id ?? ''), queryFn: () => api<AlertDetail>(`/alerts/${id as string}`), enabled: Boolean(id) });

export const useNotifications = (limit = 50) =>
  useQuery({
    queryKey: [...marketKeys.notifications, limit],
    queryFn: () => api<{ notifications: Notification[]; unread: number }>('/notifications', { query: { limit } }),
  });

/**
 * The bell's badge. It polls rather than holding a socket open: a count that is a minute out of
 * date costs nothing, and a websocket for one integer would be infrastructure with no other
 * user. `refetchOnWindowFocus` covers the case that actually matters — coming back to the tab.
 */
export const useUnreadCount = () =>
  useQuery({
    queryKey: marketKeys.unread,
    queryFn: () => api<{ unread: number }>('/notifications/unread-count').then((r) => r.unread),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

export const useNotificationSettings = () =>
  useQuery({ queryKey: marketKeys.settings, queryFn: () => api<NotificationSettings>('/me/notification-settings') });

export const useCoolOff = () => useQuery({ queryKey: marketKeys.coolOff, queryFn: () => api<CoolOffState>('/market/cool-off') });

export const useNewsStatus = () => useQuery({ queryKey: [...marketKeys.news, 'status'], queryFn: () => api<NewsStatus>('/market/news/status') });

export const useNewsFeeds = () =>
  useQuery({ queryKey: [...marketKeys.news, 'feeds'], queryFn: () => api<{ feeds: NewsFeed[] }>('/market/news/feeds').then((r) => r.feeds) });

export const useNewsDigests = () =>
  useQuery({ queryKey: [...marketKeys.news, 'digests'], queryFn: () => api<{ digests: NewsDigest[] }>('/market/news/digests').then((r) => r.digests) });

/**
 * Any write in this area refreshes every markets query. The area is a handful of endpoints and
 * a precise dependency map would cost more to keep correct than the refetches cost to run.
 */
export function useMarketMutation<TInput, TResult = unknown>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marketKeys.all }),
  });
}

/** Uploads one calendar file. FormData, so it bypasses the JSON body helper. */
export async function uploadCalendar(path: string, file: File, fields: Record<string, string> = {}): Promise<{ imported: number; parsed: number; warnings: string[] }> {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return apiUpload(path, form);
}
