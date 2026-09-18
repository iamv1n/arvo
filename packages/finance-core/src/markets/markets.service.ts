import { DomainError } from '../errors';
import { absMoney, formatMoney, parseMoney } from '../money';
import type { FinanceStore } from '../ports';
import { buildPositions } from '../portfolio/valuation';
import { strategyGreeks } from '../lab/payoff';
import { DEFAULT_ASSUMPTIONS, type StrategyLeg } from '../lab/types';
import { reconstructPositions } from '../trading/positions';
import type { TradePosition } from '../trading/positions';
import { toBar } from '../lab/bars';
import {
  evaluateAlert,
  describeAlert,
  isMarketDependent,
  type AlertContext,
  type HoldingSnapshot,
  type OptionPositionSnapshot,
  type QuoteSnapshot,
  type RecurringSnapshot,
} from './alerts';
import { computeExpiries, daysUntil, mergeExpiryRules, shiftDays, weekStart } from './expiries';
import {
  ALERT_CHANNELS,
  DEFAULT_NOTIFICATION_SETTINGS,
  MARKETS_DISCLAIMER,
  MAX_ALERTS,
  MAX_ALERT_TRIGGERS_KEPT,
  MAX_NEWS_FEEDS,
  MAX_NOTIFICATIONS_KEPT,
  MAX_WATCHLISTS,
  MAX_WATCHLIST_ITEMS,
  manualQuoteProvider,
  type AlertChannel,
  type AlertEvaluation,
  type AlertParams,
  type AlertPatch,
  type AlertRecord,
  type AlertTriggerRecord,
  type CoolOffState,
  type CorporateActionPatch,
  type CorporateActionRecord,
  type GuardrailKind,
  type GuardrailStatus,
  type IpoPatch,
  type IpoRecord,
  type MarketEvent,
  type NewAlert,
  type NewCorporateAction,
  type NewIpo,
  type NewsDigestRecord,
  type NewsFeedRecord,
  type NotificationKind,
  type NotificationRecord,
  type NotificationSettingsPatch,
  type NotificationSettingsRecord,
  type QuoteProvider,
  type QuoteRecord,
  type WatchlistItemPatch,
  type WatchlistItemRecord,
  type WatchlistRecord,
  type WatchlistRow,
  type WatchlistView,
} from './types';

/*
 * Markets & Alerts.
 *
 * Three jobs live here and they share one service because they share one snapshot: a watchlist
 * needs the last price, an alert needs the last price, and a calendar decides which prices are
 * worth having. Splitting them would mean assembling the same context three times.
 *
 * On prices. The default is that Arvo knows nothing: a quote exists because the user typed it,
 * a bar import wrote it, or a holding carries it. A provider is optional, configured by the
 * user, rate-limited, and its failures are silent — the last known value stays on screen with
 * the date it was true, which is the honest thing to show and the only thing that keeps the
 * screen usable when a third-party API is down.
 *
 * On advice. Level 3: the user writes the rule. Nothing here ranks, scores or suggests an
 * instrument, and no code path produces a buy or sell signal.
 */

export interface AlertDelivery {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  channels: AlertChannel[];
  /** The alert and trigger, when this came from one. */
  alert?: AlertRecord;
  trigger?: AlertTriggerRecord;
  meta: Record<string, unknown>;
}

/**
 * Sends a notification outside the app. The in-app copy is written by the service itself; this
 * only covers email and Telegram, is injected by the host, and is absent in tests.
 */
export interface Notifier {
  deliver(delivery: AlertDelivery): Promise<void>;
}

export interface MarketsDependencies {
  quotes?: QuoteProvider;
  notifier?: Notifier;
}

const upper = (value: string): string => value.trim().toUpperCase();

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9&._-]{0,63}$/;

const requireSymbol = (raw: string): string => {
  const symbol = upper(raw);
  if (!SYMBOL_PATTERN.test(symbol)) throw DomainError.validation('INVALID_SYMBOL', `"${raw}" is not a usable instrument symbol`);
  return symbol;
};

const requireName = (raw: string, field = 'name'): string => {
  const name = raw.trim();
  if (!name) throw DomainError.validation('INVALID_NAME', `A ${field} is required`);
  if (name.length > 120) throw DomainError.validation('INVALID_NAME', `That ${field} is too long`);
  return name;
};

const strip = <T extends { userId: string }>({ userId: _userId, ...rest }: T): Omit<T, 'userId'> => rest as Omit<T, 'userId'>;

const minutesSince = (from: Date, now: Date): number => Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));

/**
 * How old a quote's information is, in minutes.
 *
 * Deliberately the *older* of two ages: how long ago the row was written, and how long ago the
 * session it describes ended. A price typed in this morning off a screenshot from 2020 was
 * fetched seconds ago and is four years stale, and an alert must treat it as the latter. The
 * session is taken to end at midnight UTC on `asOf`, which is close enough for a threshold
 * measured in hours and needs no exchange calendar to compute.
 */
const quoteAgeMinutes = (quote: { fetchedAt: Date; asOf: string }, now: Date): number => {
  const sessionEnd = Date.parse(`${quote.asOf}T23:59:59Z`);
  const bySession = Number.isNaN(sessionEnd) ? 0 : Math.max(0, Math.round((now.getTime() - sessionEnd) / 60_000));
  return Math.max(minutesSince(quote.fetchedAt, now), bySession);
};

const percentOf = (numerator: bigint, denominator: bigint): string =>
  denominator === 0n ? '0' : formatMoney((numerator * 1_000_000n) / denominator);

export class MarketsService {
  private readonly provider: QuoteProvider;

  constructor(
    private readonly store: FinanceStore,
    private readonly deps: MarketsDependencies = {},
  ) {
    this.provider = deps.quotes ?? manualQuoteProvider;
  }

  get quoteDriver(): string {
    return this.provider.driver;
  }

  // ---- watchlists ----

  async listWatchlists(userId: string): Promise<WatchlistRecord[]> {
    return this.store.watchlists.list(userId);
  }

  async createWatchlist(userId: string, input: { name: string; notes?: string | null }): Promise<WatchlistRecord> {
    if ((await this.store.watchlists.count(userId)) >= MAX_WATCHLISTS) {
      throw DomainError.validation('TOO_MANY_WATCHLISTS', `You can keep up to ${MAX_WATCHLISTS} watchlists`);
    }
    const existing = await this.store.watchlists.list(userId);
    return this.store.watchlists.create({
      userId,
      name: requireName(input.name),
      notes: input.notes?.trim() || null,
      position: existing.length,
    });
  }

  async updateWatchlist(userId: string, id: string, input: { name?: string; notes?: string | null; position?: number }): Promise<WatchlistRecord> {
    await this.requireWatchlist(userId, id);
    const patch: WatchlistPatchInput = {};
    if (input.name !== undefined) patch.name = requireName(input.name);
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    if (input.position !== undefined) patch.position = input.position;
    return this.store.watchlists.update(userId, id, patch);
  }

  async deleteWatchlist(userId: string, id: string): Promise<void> {
    await this.requireWatchlist(userId, id);
    await this.store.watchlists.delete(userId, id);
  }

  async addItem(
    userId: string,
    watchlistId: string,
    input: { symbol: string; exchange?: string | null; name?: string | null; isin?: string | null; schemeCode?: string | null; notes?: string | null },
  ): Promise<WatchlistItemRecord> {
    await this.requireWatchlist(userId, watchlistId);
    if ((await this.store.watchlists.countItems(userId, watchlistId)) >= MAX_WATCHLIST_ITEMS) {
      throw DomainError.validation('TOO_MANY_ITEMS', `A watchlist can hold up to ${MAX_WATCHLIST_ITEMS} instruments`);
    }
    const items = await this.store.watchlists.listItems(userId, watchlistId);
    return this.store.watchlists.createItem({
      userId,
      watchlistId,
      symbol: requireSymbol(input.symbol),
      exchange: input.exchange ? upper(input.exchange) : null,
      name: input.name?.trim() || null,
      isin: input.isin ? upper(input.isin) : null,
      schemeCode: input.schemeCode?.trim() || null,
      notes: input.notes?.trim() || null,
      position: items.length,
    });
  }

  async updateItem(userId: string, id: string, input: Partial<{ symbol: string; exchange: string | null; name: string | null; isin: string | null; schemeCode: string | null; notes: string | null }>): Promise<WatchlistItemRecord> {
    const item = await this.store.watchlists.findItem(userId, id);
    if (!item) throw DomainError.notFound('WATCHLIST_ITEM_NOT_FOUND', 'That watchlist entry does not exist');
    const patch: WatchlistItemPatch = {};
    if (input.symbol !== undefined) patch.symbol = requireSymbol(input.symbol);
    if (input.exchange !== undefined) patch.exchange = input.exchange ? upper(input.exchange) : null;
    if (input.name !== undefined) patch.name = input.name?.trim() || null;
    if (input.isin !== undefined) patch.isin = input.isin ? upper(input.isin) : null;
    if (input.schemeCode !== undefined) patch.schemeCode = input.schemeCode?.trim() || null;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    return this.store.watchlists.updateItem(userId, id, patch);
  }

  async deleteItem(userId: string, id: string): Promise<void> {
    const item = await this.store.watchlists.findItem(userId, id);
    if (!item) throw DomainError.notFound('WATCHLIST_ITEM_NOT_FOUND', 'That watchlist entry does not exist');
    await this.store.watchlists.deleteItem(userId, id);
  }

  async reorderItems(userId: string, watchlistId: string, ids: string[]): Promise<WatchlistItemRecord[]> {
    await this.requireWatchlist(userId, watchlistId);
    await this.store.watchlists.reorderItems(userId, watchlistId, ids);
    return this.store.watchlists.listItems(userId, watchlistId);
  }

  /**
   * A watchlist with everything the table shows: last price and its age, the day change when two
   * closes are known, the 52-week range from imported bars, and the user's own position when
   * they hold the instrument.
   */
  async watchlistView(userId: string, watchlistId: string, input: { asOf: string; currency: string }): Promise<WatchlistView> {
    const watchlist = await this.requireWatchlist(userId, watchlistId);
    const [items, settings] = await Promise.all([this.store.watchlists.listItems(userId, watchlistId), this.settings(userId)]);
    const now = new Date();
    const symbols = items.map((item) => item.symbol);
    const [quotes, holdingRows, holdingTransactions] = await Promise.all([
      this.store.quotes.findBySymbols(userId, symbols),
      this.store.holdings.findAll(userId),
      this.store.holdingTransactions.findAll(userId),
    ]);
    const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const positions = buildPositions(holdingRows, holdingTransactions, input.asOf);
    const positionBySymbol = new Map<string, (typeof positions)[number]>();
    for (const position of positions) {
      const key = position.holding.symbol ? upper(position.holding.symbol) : null;
      if (key && !positionBySymbol.has(key)) positionBySymbol.set(key, position);
    }

    const rows: WatchlistRow[] = [];
    let quotedAt: Date | null = null;
    for (const item of items) {
      const quote = quoteBySymbol.get(item.symbol) ?? null;
      if (quote && (!quotedAt || quote.fetchedAt > quotedAt)) quotedAt = quote.fetchedAt;
      const range = await this.fiftyTwoWeekRange(userId, item.symbol, input.asOf);
      const position = positionBySymbol.get(item.symbol) ?? null;

      let dayChange: string | null = null;
      let dayChangePercent: string | null = null;
      if (quote?.previousClose) {
        const change = parseMoney(quote.price) - parseMoney(quote.previousClose);
        dayChange = formatMoney(change);
        dayChangePercent = percentOf(change, parseMoney(quote.previousClose));
      }

      rows.push({
        item: strip(item),
        price: quote?.price ?? null,
        previousClose: quote?.previousClose ?? null,
        dayChange,
        dayChangePercent,
        asOf: quote?.asOf ?? null,
        source: quote?.source ?? null,
        isStale: quote ? quoteAgeMinutes(quote, now) > settings.staleQuoteMinutes : true,
        fiftyTwoWeekHigh: range.high,
        fiftyTwoWeekLow: range.low,
        sparkline: range.closes,
        holding: position
          ? {
              id: position.holding.id,
              name: position.holding.name,
              quantity: formatMoney(position.units),
              averageCost: position.units > 0n ? formatMoney((position.costBasis * 10_000n) / position.units) : null,
              value: formatMoney(position.value),
              unrealisedGain: formatMoney(position.unrealisedGain),
            }
          : null,
      });
    }

    return {
      watchlist: strip(watchlist),
      rows,
      quotedAt,
      staleMinutes: settings.staleQuoteMinutes,
      driver: this.provider.driver,
      disclaimer: MARKETS_DISCLAIMER,
    };
  }

  // ---- quotes ----

  async listQuotes(userId: string): Promise<QuoteRecord[]> {
    return this.store.quotes.list(userId);
  }

  /** A price the user typed. Always allowed, never rate-limited: it is their own data. */
  async setQuote(userId: string, input: { symbol: string; exchange?: string | null; price: string; previousClose?: string | null; asOf: string }): Promise<QuoteRecord> {
    const symbol = requireSymbol(input.symbol);
    const now = new Date();
    await this.store.quotes.upsertMany([
      {
        userId,
        symbol,
        exchange: input.exchange ? upper(input.exchange) : null,
        price: formatMoney(parseMoney(input.price)),
        previousClose: input.previousClose ? formatMoney(parseMoney(input.previousClose)) : null,
        asOf: input.asOf,
        source: 'MANUAL',
        fetchedAt: now,
      },
    ]);
    const [quote] = await this.store.quotes.findBySymbols(userId, [symbol]);
    if (!quote) throw DomainError.notFound('QUOTE_NOT_FOUND', 'The quote could not be saved');
    return quote;
  }

  async deleteQuote(userId: string, symbol: string, exchange: string | null): Promise<void> {
    await this.store.quotes.delete(userId, requireSymbol(symbol), exchange ? upper(exchange) : null);
  }

  /**
   * Brings quotes up to date for everything the user watches or holds.
   *
   * Local sources first and always: a holding's own latest price and the newest imported daily
   * bar cost nothing and work offline. The configured provider — if there is one — is asked
   * afterwards, no more often than the refresh cooldown allows, and a failure leaves every
   * existing row exactly as it was.
   */
  async refreshQuotes(userId: string, input: { asOf: string; force?: boolean } = { asOf: new Date().toISOString().slice(0, 10) }): Promise<{
    updated: number;
    driver: string;
    providerCalled: boolean;
    skippedReason: string | null;
    quotes: QuoteRecord[];
  }> {
    const now = new Date();
    const settings = await this.settings(userId);
    const targets = await this.followedInstruments(userId);
    if (!targets.length) return { updated: 0, driver: this.provider.driver, providerCalled: false, skippedReason: 'Nothing is watched or held yet', quotes: [] };

    const existing = new Map((await this.store.quotes.list(userId)).map((quote) => [quote.symbol, quote]));
    const writes: Parameters<FinanceStore['quotes']['upsertMany']>[0] = [];

    // 1. Holdings carry a latest price the user or a NAV import already set.
    const holdings = await this.store.holdings.findAll(userId);
    for (const holding of holdings) {
      if (!holding.symbol || !holding.latestPrice || !holding.latestPriceDate) continue;
      const symbol = upper(holding.symbol);
      if (!targets.some((t) => t.symbol === symbol)) continue;
      const current = existing.get(symbol);
      if (current && current.asOf >= holding.latestPriceDate) continue;
      writes.push({
        userId,
        symbol,
        exchange: current?.exchange ?? null,
        price: holding.latestPrice,
        previousClose: current?.price ?? null,
        asOf: holding.latestPriceDate,
        source: 'HOLDING',
        fetchedAt: now,
      });
    }

    // 2. Imported daily bars: the last two closes give a price and a day change for free.
    for (const target of targets) {
      const current = existing.get(target.symbol);
      const bars = await this.store.marketBars.find(userId, target.symbol, 'DAY', { to: input.asOf, limit: 400 });
      if (!bars.length) continue;
      const last = bars[bars.length - 1]!;
      const previous = bars[bars.length - 2] ?? null;
      if (current && current.asOf >= last.date && current.source !== 'BARS') continue;
      if (current && current.asOf >= last.date && current.source === 'BARS') continue;
      writes.push({
        userId,
        symbol: target.symbol,
        exchange: target.exchange ?? current?.exchange ?? null,
        price: last.close,
        previousClose: previous?.close ?? null,
        asOf: last.date,
        source: 'BARS',
        fetchedAt: now,
      });
    }

    // 3. The configured provider, if the user configured one and the cooldown has elapsed.
    let providerCalled = false;
    let skippedReason: string | null = null;
    if (this.provider.driver === 'manual') {
      skippedReason = 'No quote provider is configured; prices come from your own entries and imports';
    } else if (!input.force && settings.lastQuoteRefreshAt && minutesSince(settings.lastQuoteRefreshAt, now) * 60 < settings.refreshCooldownSeconds) {
      skippedReason = 'Refreshed too recently; try again in a moment';
    } else {
      providerCalled = true;
      try {
        const ticks = await this.provider.quotes(targets.map((t) => ({ symbol: t.symbol, exchange: t.exchange })));
        for (const tick of ticks) {
          const symbol = upper(tick.symbol);
          const current = existing.get(symbol);
          writes.push({
            userId,
            symbol,
            exchange: targets.find((t) => t.symbol === symbol)?.exchange ?? current?.exchange ?? null,
            price: formatMoney(parseMoney(tick.price)),
            previousClose: tick.previousClose ? formatMoney(parseMoney(tick.previousClose)) : (current?.price ?? null),
            asOf: tick.asOf,
            source: 'PROVIDER',
            fetchedAt: now,
          });
        }
        await this.store.notifications.saveSettings(userId, { lastQuoteRefreshAt: now });
      } catch (error) {
        // A provider failure must never blank the screen: everything already stored stays.
        skippedReason = `The quote provider did not answer; showing the last known prices (${String(error).slice(0, 120)})`;
      }
    }

    // Later writes win, so the provider overrides bars overrides holdings.
    const byKey = new Map(writes.map((row) => [row.symbol, row]));
    const updated = byKey.size ? await this.store.quotes.upsertMany([...byKey.values()]) : 0;
    return { updated, driver: this.provider.driver, providerCalled, skippedReason, quotes: await this.store.quotes.list(userId) };
  }

  // ---- calendars ----

  async listCorporateActions(userId: string, filter: { from?: string; to?: string } = {}): Promise<CorporateActionRecord[]> {
    return this.store.marketCalendar.listCorporateActions(userId, filter);
  }

  async createCorporateAction(userId: string, input: Omit<NewCorporateAction, 'userId' | 'source'> & { source?: 'MANUAL' | 'IMPORT' }): Promise<CorporateActionRecord> {
    return this.store.marketCalendar.createCorporateAction({
      ...input,
      userId,
      symbol: requireSymbol(input.symbol),
      source: input.source ?? 'MANUAL',
    });
  }

  async importCorporateActions(userId: string, rows: Omit<NewCorporateAction, 'userId' | 'source'>[]): Promise<number> {
    if (!rows.length) return 0;
    return this.store.marketCalendar.createCorporateActions(
      rows.map((row) => ({ ...row, userId, symbol: requireSymbol(row.symbol), source: 'IMPORT' as const })),
    );
  }

  async updateCorporateAction(userId: string, id: string, patch: CorporateActionPatch): Promise<CorporateActionRecord> {
    const existing = await this.store.marketCalendar.findCorporateAction(userId, id);
    if (!existing) throw DomainError.notFound('CORPORATE_ACTION_NOT_FOUND', 'That corporate action does not exist');
    return this.store.marketCalendar.updateCorporateAction(userId, id, patch.symbol ? { ...patch, symbol: requireSymbol(patch.symbol) } : patch);
  }

  async deleteCorporateAction(userId: string, id: string): Promise<void> {
    const existing = await this.store.marketCalendar.findCorporateAction(userId, id);
    if (!existing) throw DomainError.notFound('CORPORATE_ACTION_NOT_FOUND', 'That corporate action does not exist');
    await this.store.marketCalendar.deleteCorporateAction(userId, id);
  }

  async listHolidays(userId: string, exchange?: string): Promise<{ id: string; date: string; name: string; exchange: string }[]> {
    return (await this.store.marketCalendar.listHolidays(userId, exchange)).map((row) => ({
      id: row.id,
      date: row.date,
      name: row.name,
      exchange: row.exchange,
    }));
  }

  async replaceHolidays(userId: string, exchange: string, rows: { date: string; name: string }[]): Promise<number> {
    return this.store.marketCalendar.replaceHolidays(userId, upper(exchange), rows);
  }

  async listIpos(userId: string): Promise<IpoRecord[]> {
    return this.store.marketCalendar.listIpos(userId);
  }

  async createIpo(userId: string, input: Omit<NewIpo, 'userId'>): Promise<IpoRecord> {
    return this.store.marketCalendar.createIpo({ ...input, userId, name: requireName(input.name), symbol: input.symbol ? requireSymbol(input.symbol) : null });
  }

  async importIpos(userId: string, rows: Omit<NewIpo, 'userId'>[]): Promise<number> {
    if (!rows.length) return 0;
    return this.store.marketCalendar.createIpos(rows.map((row) => ({ ...row, userId })));
  }

  async updateIpo(userId: string, id: string, patch: IpoPatch): Promise<IpoRecord> {
    const existing = await this.store.marketCalendar.findIpo(userId, id);
    if (!existing) throw DomainError.notFound('IPO_NOT_FOUND', 'That IPO does not exist');
    return this.store.marketCalendar.updateIpo(userId, id, patch);
  }

  async deleteIpo(userId: string, id: string): Promise<void> {
    const existing = await this.store.marketCalendar.findIpo(userId, id);
    if (!existing) throw DomainError.notFound('IPO_NOT_FOUND', 'That IPO does not exist');
    await this.store.marketCalendar.deleteIpo(userId, id);
  }

  /** Every expiry the user's settings produce for a window, holidays applied. */
  async expiries(userId: string, input: { from: string; to: string; indices?: string[] }) {
    const [settings, holidays] = await Promise.all([this.settings(userId), this.store.marketCalendar.listHolidays(userId)]);
    return computeExpiries({
      from: input.from,
      to: input.to,
      rules: settings.expiryRules,
      holidays: holidays.map((h) => h.date),
      indices: input.indices,
    });
  }

  /** Expiries, corporate actions and IPOs merged into one dated list, oldest first. */
  async upcomingEvents(userId: string, input: { from: string; to: string }): Promise<MarketEvent[]> {
    const [expiries, actions, ipos, followed] = await Promise.all([
      this.expiries(userId, input),
      this.store.marketCalendar.listCorporateActions(userId, input),
      this.store.marketCalendar.listIpos(userId),
      this.followedSymbols(userId),
    ]);

    const events: MarketEvent[] = [];
    for (const expiry of expiries) {
      events.push({
        kind: 'EXPIRY',
        date: expiry.date,
        title: `${expiry.index} ${expiry.cadence === 'MONTHLY' ? 'monthly' : 'weekly'} expiry`,
        detail: expiry.shiftedFrom ? `Moved from ${expiry.shiftedFrom} (holiday)` : 'Computed from the exchange expiry rule',
        symbol: expiry.index,
        isRelevant: followed.has(expiry.index),
        meta: { cadence: expiry.cadence, shiftedFrom: expiry.shiftedFrom },
      });
    }
    for (const action of actions) {
      events.push({
        kind: 'CORPORATE_ACTION',
        date: action.exDate,
        title: `${action.symbol} ${action.kind.toLowerCase()}`,
        detail: action.amount ? `${action.amount} per share` : (action.ratio ?? action.notes ?? ''),
        symbol: action.symbol,
        isRelevant: followed.has(action.symbol.toUpperCase()),
        meta: { recordDate: action.recordDate, payDate: action.payDate, amount: action.amount, ratio: action.ratio },
      });
    }
    for (const ipo of ipos) {
      const date = ipo.openDate ?? ipo.listingDate ?? ipo.closeDate;
      if (!date || date < input.from || date > input.to) continue;
      events.push({
        kind: 'IPO',
        date,
        title: `${ipo.name} IPO`,
        detail: [ipo.priceBandLow && ipo.priceBandHigh ? `Band ${ipo.priceBandLow}–${ipo.priceBandHigh}` : null, ipo.lotSize ? `Lot ${ipo.lotSize}` : null]
          .filter(Boolean)
          .join(' · '),
        symbol: ipo.symbol,
        isRelevant: !!ipo.symbol && followed.has(ipo.symbol.toUpperCase()),
        meta: { status: ipo.status, closeDate: ipo.closeDate, listingDate: ipo.listingDate, lotSize: ipo.lotSize },
      });
    }
    return events.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)));
  }

  // ---- alerts ----

  async listAlerts(userId: string): Promise<AlertRecord[]> {
    return this.store.alerts.list(userId);
  }

  async requireAlert(userId: string, id: string): Promise<AlertRecord> {
    const alert = await this.store.alerts.find(userId, id);
    if (!alert) throw DomainError.notFound('ALERT_NOT_FOUND', 'That alert does not exist');
    return alert;
  }

  async createAlert(userId: string, input: Omit<NewAlert, 'userId'>): Promise<AlertRecord> {
    if ((await this.store.alerts.count(userId)) >= MAX_ALERTS) {
      throw DomainError.validation('TOO_MANY_ALERTS', `You can keep up to ${MAX_ALERTS} alerts`);
    }
    return this.store.alerts.create({
      ...input,
      userId,
      name: requireName(input.name),
      params: normaliseParams(input.params),
      channels: normaliseChannels(input.channels),
      cooldownMinutes: Math.max(0, Math.min(input.cooldownMinutes, 60 * 24 * 30)),
    });
  }

  async updateAlert(userId: string, id: string, patch: AlertPatch): Promise<AlertRecord> {
    await this.requireAlert(userId, id);
    const next: AlertPatch = { ...patch };
    if (patch.name !== undefined) next.name = requireName(patch.name);
    if (patch.params !== undefined) next.params = normaliseParams(patch.params);
    if (patch.channels !== undefined) next.channels = normaliseChannels(patch.channels);
    return this.store.alerts.update(userId, id, next);
  }

  async deleteAlert(userId: string, id: string): Promise<void> {
    await this.requireAlert(userId, id);
    await this.store.alerts.delete(userId, id);
  }

  async listTriggers(userId: string, alertId?: string, limit = 50): Promise<AlertTriggerRecord[]> {
    if (alertId) await this.requireAlert(userId, alertId);
    return this.store.alerts.listTriggers(userId, alertId, limit);
  }

  /** Evaluates one alert without firing it, so the user can see what it would say right now. */
  async testAlert(userId: string, id: string, now = new Date()): Promise<AlertEvaluation & { preview: string }> {
    const alert = await this.requireAlert(userId, id);
    const ctx = await this.buildContext(userId, now);
    const result = evaluateAlert({ ...alert, isEnabled: true, lastTriggeredAt: null }, ctx);
    return { ...result, preview: describeAlert(alert.name, alert.params, alert.repeats) };
  }

  /** Evaluates every alert of one user and delivers the ones that fired. */
  async evaluateUser(userId: string, now = new Date()): Promise<AlertEvaluation[]> {
    const alerts = await this.store.alerts.list(userId);
    return this.evaluateAlerts(userId, alerts, now);
  }

  /**
   * The scheduler's entry point. Takes the clock so a test can decide what "now" means, and is
   * idempotent within a cooldown window: running it twice over the same hour fires nothing the
   * second time.
   */
  async runDueAlerts(now = new Date()): Promise<{ users: number; evaluated: number; fired: number }> {
    const alerts = await this.store.alerts.listDue();
    const byUser = new Map<string, AlertRecord[]>();
    for (const alert of alerts) {
      const list = byUser.get(alert.userId);
      if (list) list.push(alert);
      else byUser.set(alert.userId, [alert]);
    }
    let evaluated = 0;
    let fired = 0;
    for (const [userId, userAlerts] of byUser) {
      const results = await this.evaluateAlerts(userId, userAlerts, now);
      evaluated += results.length;
      fired += results.filter((r) => r.fired).length;
    }
    return { users: byUser.size, evaluated, fired };
  }

  private async evaluateAlerts(userId: string, alerts: AlertRecord[], now: Date): Promise<AlertEvaluation[]> {
    const enabled = alerts.filter((alert) => alert.isEnabled);
    if (!enabled.length) return [];
    const ctx = await this.buildContext(userId, now);
    const results: AlertEvaluation[] = [];
    for (const alert of enabled) {
      const result = evaluateAlert(alert, ctx);
      results.push(result);
      await this.store.alerts.recordEvaluation(userId, alert.id, {
        at: now,
        status: result.status,
        message: result.message,
        fired: result.fired,
        // A one-shot alert turns itself off rather than relying on an infinite cooldown.
        disable: result.fired && !alert.repeats,
      });
      if (!result.fired) continue;
      const trigger = await this.store.alerts.createTrigger({
        userId,
        alertId: alert.id,
        firedAt: now,
        message: result.message,
        evidence: { ...result.evidence, kind: alert.kind, evaluatedAt: now.toISOString() },
        channels: alert.channels,
      });
      await this.store.alerts.pruneTriggers(userId, alert.id, MAX_ALERT_TRIGGERS_KEPT);
      await this.notify({
        userId,
        kind: 'ALERT',
        title: alert.name,
        body: result.message,
        link: `/markets?tab=alerts&alert=${alert.id}`,
        channels: alert.channels,
        alert,
        trigger,
        meta: { alertId: alert.id, triggerId: trigger.id, marketDependent: isMarketDependent(alert.kind) },
      });
    }
    return results;
  }

  /** Assembles everything the engine may look at, once per user per run. */
  private async buildContext(userId: string, now: Date): Promise<AlertContext> {
    const today = now.toISOString().slice(0, 10);
    const settings = await this.settings(userId);
    const [quotes, holdingRows, holdingTransactions, recurring, trades, actions, followed] = await Promise.all([
      this.store.quotes.list(userId),
      this.store.holdings.findAll(userId),
      this.store.holdingTransactions.findAll(userId),
      this.store.recurring.findAll(userId),
      this.store.trades.findAll(userId, {}),
      this.store.marketCalendar.listCorporateActions(userId, { from: today, to: shiftDays(today, 120) }),
      this.followedSymbols(userId),
    ]);

    const quoteSnapshots = new Map<string, QuoteSnapshot>(
      quotes.map((quote) => [
        quote.symbol,
        { symbol: quote.symbol, price: quote.price, previousClose: quote.previousClose, asOf: quote.asOf, ageMinutes: quoteAgeMinutes(quote, now) },
      ]),
    );

    // Holdings and the portfolio total, with the staleness of the prices they rest on.
    const positions = buildPositions(holdingRows, holdingTransactions, today);
    const holdings = new Map<string, HoldingSnapshot>();
    let total = 0n;
    let anyStale = false;
    for (const position of positions) {
      const priceAge = position.priceDate ? daysUntil(position.priceDate, today) * 24 * 60 : Number.POSITIVE_INFINITY;
      const isStale = position.units > 0n && priceAge > settings.staleQuoteMinutes;
      if (isStale) anyStale = true;
      total += position.value;
      holdings.set(position.holding.id, {
        id: position.holding.id,
        name: position.holding.name,
        value: formatMoney(position.value),
        costBasis: formatMoney(position.costBasis),
        unrealisedGain: formatMoney(position.unrealisedGain),
        gainPercent: position.costBasis > 0n ? percentOf(position.unrealisedGain, position.costBasis) : null,
        isStale,
      });
    }

    // The high-water mark, advanced whenever today's total beats it.
    let peak = settings.portfolioPeakValue ? parseMoney(settings.portfolioPeakValue) : 0n;
    let peakOn = settings.portfolioPeakOn;
    if (total > peak) {
      peak = total;
      peakOn = today;
      await this.store.notifications.saveSettings(userId, { portfolioPeakValue: formatMoney(total), portfolioPeakOn: today });
    }

    const recurringSnapshots: RecurringSnapshot[] = recurring
      .filter((series) => !series.isDismissed && series.status === 'ACTIVE')
      .map((series) => ({ id: series.id, label: series.label, expectedOn: series.nextExpected, lastSeenOn: series.lastSeen }));

    const { positions: tradePositions } = reconstructPositions({ trades, asOf: today });
    const realisedByDay = new Map<string, string>();
    const tradeCountByDay = new Map<string, number>();
    for (const position of tradePositions) {
      if (position.status === 'CLOSED' && position.closedAt) {
        realisedByDay.set(position.closedAt, formatMoney(parseMoney(realisedByDay.get(position.closedAt) ?? '0') + parseMoney(position.netPnl)));
      }
      tradeCountByDay.set(position.openedAt, (tradeCountByDay.get(position.openedAt) ?? 0) + 1);
    }

    const open = tradePositions.filter((p) => p.status === 'OPEN');
    const openExpiries = open
      .filter((p) => p.expiry)
      .map((p) => ({ underlying: p.underlying, expiry: p.expiry!, label: p.label }));

    return {
      now,
      today,
      currency: 'INR',
      staleQuoteMinutes: settings.staleQuoteMinutes,
      quotes: quoteSnapshots,
      portfolio: positions.length ? { value: formatMoney(total), peak: formatMoney(peak), peakOn, isStale: anyStale } : null,
      holdings,
      recurring: recurringSnapshots,
      optionPositions: optionDeltas(open, quoteSnapshots, today),
      realisedByDay,
      tradeCountByDay,
      openExpiries,
      expiries: [],
      corporateActions: actions,
      followed,
    };
  }

  // ---- notifications ----

  async listNotifications(userId: string, filter: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationRecord[]> {
    return this.store.notifications.list(userId, filter);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.store.notifications.unreadCount(userId);
  }

  async markRead(userId: string, ids: string[]): Promise<number> {
    return ids.length ? this.store.notifications.markRead(userId, ids) : 0;
  }

  async markAllRead(userId: string): Promise<number> {
    return this.store.notifications.markAllRead(userId);
  }

  async settings(userId: string): Promise<NotificationSettingsRecord> {
    const existing = await this.store.notifications.findSettings(userId);
    if (existing) return { ...existing, expiryRules: mergeExpiryRules(existing.expiryRules ?? []) };
    return { userId, ...DEFAULT_NOTIFICATION_SETTINGS, expiryRules: mergeExpiryRules([]), updatedAt: new Date() };
  }

  async saveSettings(userId: string, patch: NotificationSettingsPatch): Promise<NotificationSettingsRecord> {
    const next: NotificationSettingsPatch = { ...patch };
    if (patch.staleQuoteMinutes !== undefined) next.staleQuoteMinutes = Math.max(1, Math.min(patch.staleQuoteMinutes, 60 * 24 * 30));
    if (patch.refreshCooldownSeconds !== undefined) next.refreshCooldownSeconds = Math.max(5, Math.min(patch.refreshCooldownSeconds, 3600));
    if (patch.quietHoursStart !== undefined) next.quietHoursStart = normaliseTime(patch.quietHoursStart);
    if (patch.quietHoursEnd !== undefined) next.quietHoursEnd = normaliseTime(patch.quietHoursEnd);
    const saved = await this.store.notifications.saveSettings(userId, next);
    return { ...saved, expiryRules: mergeExpiryRules(saved.expiryRules ?? []) };
  }

  /**
   * Writes the in-app copy and hands the rest to the host's notifier.
   *
   * Quiet hours hold back email and Telegram but never the in-app record: the point is not to
   * be woken, not to lose the notification.
   */
  async notify(delivery: AlertDelivery): Promise<NotificationRecord> {
    const settings = await this.settings(delivery.userId);
    const notification = await this.store.notifications.create({
      userId: delivery.userId,
      kind: delivery.kind,
      title: delivery.title,
      body: delivery.body,
      link: delivery.link,
      meta: delivery.meta,
    });
    await this.store.notifications.prune(delivery.userId, MAX_NOTIFICATIONS_KEPT);

    const quiet = inQuietHours(settings, new Date());
    const channels = delivery.channels.filter((channel) => {
      if (channel === 'IN_APP') return false;
      if (quiet) return false;
      if (channel === 'EMAIL') return settings.emailEnabled;
      if (channel === 'TELEGRAM') return settings.telegramEnabled && !!settings.telegramChatId;
      return false;
    });
    if (channels.length && this.deps.notifier) {
      await this.deps.notifier.deliver({ ...delivery, channels });
    }
    return notification;
  }

  // ---- guardrails ----

  /**
   * The trader's own limits, checked against today and this week. Informational: it records a
   * breach and shows a banner, and it never stops anyone doing anything.
   */
  async coolOff(userId: string, asOf: string): Promise<CoolOffState> {
    const [trades, settings] = await Promise.all([this.store.trades.findAll(userId, {}), this.store.tradingSettings.find(userId)]);
    const limits = {
      day: settings?.maxLossPerDay ?? null,
      week: settings?.maxLossPerWeek ?? null,
      trades: settings?.maxTradesPerDay ?? null,
    };
    if (!limits.day && !limits.week && !limits.trades) return { active: false, statuses: [], message: null };

    const { positions } = reconstructPositions({ trades, asOf });
    const monday = weekStart(asOf);
    let dayNet = 0n;
    let weekNet = 0n;
    let dayTrades = 0;
    for (const position of positions) {
      if (position.status === 'CLOSED' && position.closedAt) {
        const net = parseMoney(position.netPnl);
        if (position.closedAt === asOf) dayNet += net;
        if (position.closedAt >= monday && position.closedAt <= asOf) weekNet += net;
      }
      if (position.openedAt === asOf) dayTrades += 1;
    }

    const statuses: GuardrailStatus[] = [];
    const push = (kind: GuardrailKind, label: string, limit: string | null, actual: string, breached: boolean, periodStart: string) => {
      if (!limit) return;
      statuses.push({ kind, label, limit, actual, breached, periodStart, periodEnd: asOf });
    };
    push('MAX_LOSS_DAY', 'Max loss today', limits.day, formatMoney(dayNet), !!limits.day && dayNet < 0n && absMoney(dayNet) >= parseMoney(limits.day), asOf);
    push('MAX_LOSS_WEEK', 'Max loss this week', limits.week, formatMoney(weekNet), !!limits.week && weekNet < 0n && absMoney(weekNet) >= parseMoney(limits.week), monday);
    push('MAX_TRADES_DAY', 'Max trades today', limits.trades ? String(limits.trades) : null, String(dayTrades), !!limits.trades && dayTrades > limits.trades, asOf);

    const breached = statuses.filter((status) => status.breached);
    for (const status of breached) {
      const claimed = await this.store.guardrails.claim({
        userId,
        kind: status.kind,
        periodStart: status.periodStart,
        limit: status.limit,
        actual: status.actual,
        notifiedAt: null,
      });
      if (!claimed) continue;
      await this.notify({
        userId,
        kind: 'GUARDRAIL',
        title: `${status.label} reached`,
        body: `You set a limit of ${status.limit} and you are at ${status.actual}. This is a note to yourself, not a block — Arvo will not stop you trading.`,
        link: '/trading',
        channels: ['IN_APP', 'EMAIL'],
        meta: { guardrail: status.kind, limit: status.limit, actual: status.actual, periodStart: status.periodStart },
      });
      await this.store.guardrails.markNotified(userId, claimed.id, new Date());
    }

    return {
      active: breached.length > 0,
      statuses,
      message: breached.length
        ? `${breached.map((b) => b.label.toLowerCase()).join(' and ')} reached. Consider stopping for the ${breached.some((b) => b.kind === 'MAX_LOSS_WEEK') ? 'week' : 'day'}.`
        : null,
    };
  }

  // ---- news ----

  async listFeeds(userId: string): Promise<NewsFeedRecord[]> {
    return this.store.news.listFeeds(userId);
  }

  async addFeed(userId: string, input: { url: string; title?: string | null }): Promise<NewsFeedRecord> {
    if ((await this.store.news.listFeeds(userId)).length >= MAX_NEWS_FEEDS) {
      throw DomainError.validation('TOO_MANY_FEEDS', `You can keep up to ${MAX_NEWS_FEEDS} feeds`);
    }
    const url = input.url.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) throw DomainError.validation('INVALID_FEED_URL', 'A feed URL must start with http:// or https://');
    return this.store.news.createFeed({ userId, url, title: input.title?.trim() || null, isEnabled: true });
  }

  async updateFeed(userId: string, id: string, patch: { title?: string | null; isEnabled?: boolean }): Promise<NewsFeedRecord> {
    const feed = await this.store.news.findFeed(userId, id);
    if (!feed) throw DomainError.notFound('FEED_NOT_FOUND', 'That feed does not exist');
    return this.store.news.updateFeed(userId, id, patch);
  }

  /** Records the outcome of a fetch. Separate from updateFeed so a job cannot rename a feed. */
  async recordFeedFetch(userId: string, id: string, outcome: { at: Date; error: string | null }): Promise<void> {
    await this.store.news.updateFeed(userId, id, { lastFetchedAt: outcome.at, lastError: outcome.error });
  }

  async deleteFeed(userId: string, id: string): Promise<void> {
    const feed = await this.store.news.findFeed(userId, id);
    if (!feed) throw DomainError.notFound('FEED_NOT_FOUND', 'That feed does not exist');
    await this.store.news.deleteFeed(userId, id);
  }

  async listDigests(userId: string, limit = 12): Promise<NewsDigestRecord[]> {
    return this.store.news.listDigests(userId, limit);
  }

  async saveDigest(userId: string, input: Omit<NewsDigestRecord, 'id' | 'userId' | 'createdAt'>): Promise<NewsDigestRecord> {
    return this.store.news.createDigest({ ...input, userId });
  }

  async deleteDigest(userId: string, id: string): Promise<void> {
    const digest = await this.store.news.findDigest(userId, id);
    if (!digest) throw DomainError.notFound('DIGEST_NOT_FOUND', 'That digest does not exist');
    await this.store.news.deleteDigest(userId, id);
  }

  // ---- shared helpers ----

  /** Symbols the user holds or watches, upper-cased. The only instruments any of this touches. */
  async followedSymbols(userId: string): Promise<Set<string>> {
    return new Set((await this.followedInstruments(userId)).map((item) => item.symbol));
  }

  async followedInstruments(userId: string): Promise<{ symbol: string; exchange: string | null }[]> {
    const [items, holdings] = await Promise.all([this.store.watchlists.listItems(userId), this.store.holdings.findAll(userId)]);
    const byKey = new Map<string, { symbol: string; exchange: string | null }>();
    for (const item of items) byKey.set(item.symbol, { symbol: item.symbol, exchange: item.exchange });
    for (const holding of holdings) {
      if (!holding.symbol || !holding.isActive) continue;
      const symbol = upper(holding.symbol);
      if (!byKey.has(symbol)) byKey.set(symbol, { symbol, exchange: null });
    }
    return [...byKey.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  private async requireWatchlist(userId: string, id: string): Promise<WatchlistRecord> {
    const watchlist = await this.store.watchlists.find(userId, id);
    if (!watchlist) throw DomainError.notFound('WATCHLIST_NOT_FOUND', 'That watchlist does not exist');
    return watchlist;
  }

  /** The 52-week high, low and a short close series, from imported daily bars only. */
  private async fiftyTwoWeekRange(userId: string, symbol: string, asOf: string): Promise<{ high: string | null; low: string | null; closes: string[] }> {
    const bars = await this.store.marketBars.find(userId, symbol, 'DAY', { from: shiftDays(asOf, -366), to: asOf, limit: 400 });
    if (!bars.length) return { high: null, low: null, closes: [] };
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    for (const row of bars) {
      const bar = toBar(row);
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
    }
    const closes = bars.slice(-60).map((row) => row.close);
    return { high: formatMoney(parseMoney(String(high))), low: formatMoney(parseMoney(String(low))), closes };
  }
}

type WatchlistPatchInput = { name?: string; notes?: string | null; position?: number };

/**
 * Net delta per open option position, from the lab's Black-Scholes, using the spot the user
 * gave the alert and the last known quote as a fallback. An option with no usable spot is
 * reported with a zero delta rather than dropped, so the evidence shows it was considered.
 */
function optionDeltas(open: TradePosition[], quotes: Map<string, QuoteSnapshot>, today: string): OptionPositionSnapshot[] {
  const snapshots: OptionPositionSnapshot[] = [];
  for (const position of open) {
    if (!position.right || !position.strike || !position.expiry) continue;
    const quote = quotes.get(position.underlying);
    if (!quote) {
      snapshots.push({ id: position.id, label: position.label, delta: '0.0000', expiry: position.expiry, underlying: position.underlying });
      continue;
    }
    const leg: StrategyLeg = {
      kind: position.right === 'CE' ? 'CALL' : 'PUT',
      action: position.direction === 'LONG' ? 'BUY' : 'SELL',
      lots: 1,
      lotSize: Math.max(1, Number(position.openQuantity.split('.')[0] || '1')),
      strike: position.strike,
      premium: position.averageEntryPrice,
      expiry: position.expiry,
      impliedVolatilityPercent: null,
      label: position.label,
    };
    try {
      const { net } = strategyGreeks([leg], { spot: quote.price, asOf: today, ...DEFAULT_ASSUMPTIONS });
      snapshots.push({ id: position.id, label: position.label, delta: net.delta, expiry: position.expiry, underlying: position.underlying });
    } catch {
      snapshots.push({ id: position.id, label: position.label, delta: '0.0000', expiry: position.expiry, underlying: position.underlying });
    }
  }
  return snapshots;
}

/** Rejects a channel list that holds anything unknown, and always keeps the in-app copy. */
function normaliseChannels(channels: AlertChannel[]): AlertChannel[] {
  const unique = new Set<AlertChannel>(['IN_APP']);
  for (const channel of channels) {
    if (!ALERT_CHANNELS.includes(channel)) throw DomainError.validation('INVALID_CHANNEL', `"${channel}" is not a delivery channel`);
    unique.add(channel);
  }
  return ALERT_CHANNELS.filter((channel) => unique.has(channel));
}

/** Normalises the numbers inside an alert's parameters so two equal rules compare equal. */
function normaliseParams(params: AlertParams): AlertParams {
  switch (params.kind) {
    case 'PRICE_LEVEL':
      return { ...params, symbol: requireSymbol(params.symbol), exchange: params.exchange ? upper(params.exchange) : null, level: formatMoney(parseMoney(params.level)) };
    case 'PORTFOLIO_DRAWDOWN':
      return { ...params, percent: formatMoney(parseMoney(params.percent)) };
    case 'HOLDING_PNL':
      return { ...params, value: formatMoney(parseMoney(params.value)) };
    case 'SIP_MISSED':
      return { ...params, graceDays: Math.max(0, Math.min(params.graceDays, 90)) };
    case 'OPTION_DELTA':
      return {
        ...params,
        maxAbsDelta: formatMoney(parseMoney(params.maxAbsDelta)),
        spot: formatMoney(parseMoney(params.spot)),
        impliedVolatilityPercent: formatMoney(parseMoney(params.impliedVolatilityPercent)),
      };
    case 'REALISED_LOSS_LIMIT':
      return { ...params, amount: formatMoney(parseMoney(params.amount)) };
    case 'TRADE_COUNT':
      return { ...params, count: Math.max(1, Math.min(params.count, 1000)) };
    case 'EXPIRY_UPCOMING':
    case 'CORPORATE_ACTION':
      return { ...params, daysBefore: Math.max(0, Math.min(params.daysBefore, 60)) };
    default:
      throw DomainError.validation('INVALID_ALERT_PARAMS', 'That alert kind is not recognised');
  }
}

function normaliseTime(value: string | null): string | null {
  if (!value) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw DomainError.validation('INVALID_TIME', 'Use HH:MM, 24-hour');
  return value;
}

/**
 * True when `now`, read in the user's timezone, falls inside their quiet window. A window that
 * wraps midnight (22:00–07:00) is the common case and is handled by comparing against both ends.
 */
export function inQuietHours(settings: Pick<NotificationSettingsRecord, 'quietHoursStart' | 'quietHoursEnd' | 'timezone'>, now: Date): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = settings;
  if (!start || !end || start === end) return false;
  let local: string;
  try {
    local = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  } catch {
    local = now.toISOString().slice(11, 16);
  }
  return start < end ? local >= start && local < end : local >= start || local < end;
}
