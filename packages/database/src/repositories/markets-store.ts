import type {
  AlertRecord,
  AlertRepository,
  AlertTriggerRecord,
  CorporateActionRecord,
  GuardrailBreachRecord,
  GuardrailRepository,
  IpoRecord,
  MarketCalendarRepository,
  NewsDigestRecord,
  NewsFeedRecord,
  NewsRepository,
  NotificationRecord,
  NotificationRepository,
  NotificationSettingsRecord,
  QuoteRecord,
  QuoteRepository,
  TradingHolidayRecord,
  WatchlistItemRecord,
  WatchlistRecord,
  WatchlistRepository,
} from '@arvo/finance-core';
import { DEFAULT_NOTIFICATION_SETTINGS, formatMoney, parseMoney } from '@arvo/finance-core';
import { Between, In, IsNull, LessThanOrEqual, MoreThanOrEqual, type EntityManager } from 'typeorm';
import {
  AlertEntity,
  AlertTriggerEntity,
  CorporateActionEntity,
  GuardrailBreachEntity,
  IpoEntity,
  NewsDigestEntity,
  NewsFeedEntity,
  NotificationEntity,
  NotificationSettingsEntity,
  QuoteEntity,
  TradingHolidayEntity,
  WatchlistEntity,
  WatchlistItemEntity,
} from '../entities';

/*
 * Markets & Alerts persistence.
 *
 * It lives beside finance-store.ts rather than inside it because the area brings thirteen
 * tables of its own and the main file is already the longest in the package. Everything here
 * obeys the same rule as the rest: every query is scoped by user_id, and a row belonging to
 * someone else behaves as absent.
 */

// TypeORM's deep-partial typing rejects jsonb records; values are validated by finance-core.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPatch = any;

const isoDate = (value: string | Date): string => (typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10));

const money = (value: string | null): string | null => (value === null ? null : formatMoney(parseMoney(value)));

const toWatchlist = (e: WatchlistEntity): WatchlistRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  notes: e.notes,
  position: e.position,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toItem = (e: WatchlistItemEntity): WatchlistItemRecord => ({
  id: e.id,
  userId: e.userId,
  watchlistId: e.watchlistId,
  symbol: e.symbol,
  exchange: e.exchange,
  name: e.name,
  isin: e.isin,
  schemeCode: e.schemeCode,
  notes: e.notes,
  position: e.position,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toQuote = (e: QuoteEntity): QuoteRecord => ({
  id: e.id,
  userId: e.userId,
  symbol: e.symbol,
  exchange: e.exchange,
  price: formatMoney(parseMoney(e.price)),
  previousClose: money(e.previousClose),
  asOf: isoDate(e.asOf),
  source: e.source,
  fetchedAt: e.fetchedAt,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toCorporateAction = (e: CorporateActionEntity): CorporateActionRecord => ({
  id: e.id,
  userId: e.userId,
  symbol: e.symbol,
  name: e.name,
  kind: e.kind,
  exDate: isoDate(e.exDate),
  recordDate: e.recordDate ? isoDate(e.recordDate) : null,
  payDate: e.payDate ? isoDate(e.payDate) : null,
  amount: money(e.amount),
  ratio: e.ratio,
  notes: e.notes,
  source: e.source,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toHoliday = (e: TradingHolidayEntity): TradingHolidayRecord => ({
  id: e.id,
  userId: e.userId,
  date: isoDate(e.date),
  name: e.name,
  exchange: e.exchange,
  createdAt: e.createdAt,
});

const toIpo = (e: IpoEntity): IpoRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  symbol: e.symbol,
  openDate: e.openDate ? isoDate(e.openDate) : null,
  closeDate: e.closeDate ? isoDate(e.closeDate) : null,
  priceBandLow: money(e.priceBandLow),
  priceBandHigh: money(e.priceBandHigh),
  lotSize: e.lotSize,
  listingDate: e.listingDate ? isoDate(e.listingDate) : null,
  status: e.status,
  notes: e.notes,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toAlert = (e: AlertEntity): AlertRecord => ({
  id: e.id,
  userId: e.userId,
  name: e.name,
  kind: e.kind,
  params: e.params,
  isEnabled: e.isEnabled,
  cooldownMinutes: e.cooldownMinutes,
  repeats: e.repeats,
  channels: e.channels ?? ['IN_APP'],
  lastTriggeredAt: e.lastTriggeredAt,
  lastEvaluatedAt: e.lastEvaluatedAt,
  lastStatus: e.lastStatus,
  lastMessage: e.lastMessage,
  triggerCount: e.triggerCount,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toTrigger = (e: AlertTriggerEntity): AlertTriggerRecord => ({
  id: e.id,
  userId: e.userId,
  alertId: e.alertId,
  firedAt: e.firedAt,
  message: e.message,
  evidence: e.evidence ?? {},
  channels: e.channels ?? [],
  createdAt: e.createdAt,
});

const toNotification = (e: NotificationEntity): NotificationRecord => ({
  id: e.id,
  userId: e.userId,
  kind: e.kind,
  title: e.title,
  body: e.body,
  link: e.link,
  readAt: e.readAt,
  meta: e.meta ?? {},
  createdAt: e.createdAt,
});

const toSettings = (e: NotificationSettingsEntity): NotificationSettingsRecord => ({
  userId: e.userId,
  inAppEnabled: e.inAppEnabled,
  emailEnabled: e.emailEnabled,
  telegramEnabled: e.telegramEnabled,
  telegramChatId: e.telegramChatId,
  quietHoursStart: e.quietHoursStart,
  quietHoursEnd: e.quietHoursEnd,
  timezone: e.timezone,
  staleQuoteMinutes: e.staleQuoteMinutes,
  refreshCooldownSeconds: e.refreshCooldownSeconds,
  newsDigestFrequency: e.newsDigestFrequency,
  expiryRules: e.expiryRules ?? [],
  portfolioPeakValue: money(e.portfolioPeakValue),
  portfolioPeakOn: e.portfolioPeakOn ? isoDate(e.portfolioPeakOn) : null,
  lastQuoteRefreshAt: e.lastQuoteRefreshAt,
  updatedAt: e.updatedAt,
});

const toFeed = (e: NewsFeedEntity): NewsFeedRecord => ({
  id: e.id,
  userId: e.userId,
  url: e.url,
  title: e.title,
  isEnabled: e.isEnabled,
  lastFetchedAt: e.lastFetchedAt,
  lastError: e.lastError,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toDigest = (e: NewsDigestEntity): NewsDigestRecord => ({
  id: e.id,
  userId: e.userId,
  periodStart: isoDate(e.periodStart),
  periodEnd: isoDate(e.periodEnd),
  items: e.items ?? [],
  provider: e.provider,
  createdAt: e.createdAt,
});

const toBreach = (e: GuardrailBreachEntity): GuardrailBreachRecord => ({
  id: e.id,
  userId: e.userId,
  kind: e.kind,
  periodStart: isoDate(e.periodStart),
  limit: e.limit,
  actual: e.actual,
  notifiedAt: e.notifiedAt,
  createdAt: e.createdAt,
});

export interface MarketsRepositories {
  watchlists: WatchlistRepository;
  quotes: QuoteRepository;
  marketCalendar: MarketCalendarRepository;
  alerts: AlertRepository;
  notifications: NotificationRepository;
  news: NewsRepository;
  guardrails: GuardrailRepository;
}

export function createMarketsRepositories(manager: EntityManager): MarketsRepositories {
  const watchlists: WatchlistRepository = {
    list: async (userId) => (await manager.find(WatchlistEntity, { where: { userId }, order: { position: 'ASC', createdAt: 'ASC' } })).map(toWatchlist),
    find: async (userId, id) => {
      const row = await manager.findOneBy(WatchlistEntity, { id, userId });
      return row ? toWatchlist(row) : null;
    },
    create: async (input) => toWatchlist(await manager.save(manager.create(WatchlistEntity, input as AnyPatch))),
    update: async (userId, id, patch) => {
      if (Object.keys(patch).length) await manager.update(WatchlistEntity, { id, userId }, patch as AnyPatch);
      const row = await manager.findOneBy(WatchlistEntity, { id, userId });
      if (!row) throw new Error('Watchlist vanished during update');
      return toWatchlist(row);
    },
    delete: async (userId, id) => void (await manager.delete(WatchlistEntity, { id, userId })),
    count: async (userId) => manager.countBy(WatchlistEntity, { userId }),
    listItems: async (userId, watchlistId) =>
      (
        await manager.find(WatchlistItemEntity, {
          where: watchlistId ? { userId, watchlistId } : { userId },
          order: { position: 'ASC', createdAt: 'ASC' },
        })
      ).map(toItem),
    findItem: async (userId, id) => {
      const row = await manager.findOneBy(WatchlistItemEntity, { id, userId });
      return row ? toItem(row) : null;
    },
    createItem: async (input) => toItem(await manager.save(manager.create(WatchlistItemEntity, input as AnyPatch))),
    updateItem: async (userId, id, patch) => {
      if (Object.keys(patch).length) await manager.update(WatchlistItemEntity, { id, userId }, patch as AnyPatch);
      const row = await manager.findOneBy(WatchlistItemEntity, { id, userId });
      if (!row) throw new Error('Watchlist item vanished during update');
      return toItem(row);
    },
    deleteItem: async (userId, id) => void (await manager.delete(WatchlistItemEntity, { id, userId })),
    countItems: async (userId, watchlistId) => manager.countBy(WatchlistItemEntity, { userId, watchlistId }),
    reorderItems: async (userId, watchlistId, ids) => {
      // Position is assigned from the order given; ids the user does not own simply miss.
      for (const [index, id] of ids.entries()) {
        await manager.update(WatchlistItemEntity, { id, userId, watchlistId }, { position: index });
      }
    },
  };

  const quotes: QuoteRepository = {
    list: async (userId) => (await manager.find(QuoteEntity, { where: { userId }, order: { symbol: 'ASC' } })).map(toQuote),
    findBySymbols: async (userId, symbols) =>
      symbols.length ? (await manager.find(QuoteEntity, { where: { userId, symbol: In(symbols) } })).map(toQuote) : [],
    upsertMany: async (rows) => {
      if (!rows.length) return 0;
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(QuoteEntity)
        .values(rows as AnyPatch)
        .orUpdate(['exchange', 'price', 'previous_close', 'as_of', 'source', 'fetched_at', 'updated_at'], ['user_id', 'symbol'])
        .execute();
      return result.identifiers.length;
    },
    delete: async (userId, symbol) => void (await manager.delete(QuoteEntity, { userId, symbol })),
  };

  const marketCalendar: MarketCalendarRepository = {
    listCorporateActions: async (userId, filter = {}) => {
      const where: Record<string, unknown> = { userId };
      if (filter.from && filter.to) where.exDate = Between(filter.from, filter.to);
      else if (filter.from) where.exDate = MoreThanOrEqual(filter.from);
      else if (filter.to) where.exDate = LessThanOrEqual(filter.to);
      if (filter.symbols?.length) where.symbol = In(filter.symbols);
      return (await manager.find(CorporateActionEntity, { where: where as AnyPatch, order: { exDate: 'ASC', symbol: 'ASC' } })).map(toCorporateAction);
    },
    findCorporateAction: async (userId, id) => {
      const row = await manager.findOneBy(CorporateActionEntity, { id, userId });
      return row ? toCorporateAction(row) : null;
    },
    createCorporateAction: async (input) => toCorporateAction(await manager.save(manager.create(CorporateActionEntity, input as AnyPatch))),
    createCorporateActions: async (inputs) => {
      if (!inputs.length) return 0;
      const result = await manager.createQueryBuilder().insert().into(CorporateActionEntity).values(inputs as AnyPatch).execute();
      return result.identifiers.length;
    },
    updateCorporateAction: async (userId, id, patch) => {
      if (Object.keys(patch).length) await manager.update(CorporateActionEntity, { id, userId }, patch as AnyPatch);
      const row = await manager.findOneBy(CorporateActionEntity, { id, userId });
      if (!row) throw new Error('Corporate action vanished during update');
      return toCorporateAction(row);
    },
    deleteCorporateAction: async (userId, id) => void (await manager.delete(CorporateActionEntity, { id, userId })),

    listHolidays: async (userId, exchange) =>
      (await manager.find(TradingHolidayEntity, { where: exchange ? { userId, exchange } : { userId }, order: { date: 'ASC' } })).map(toHoliday),
    replaceHolidays: async (userId, exchange, rows) => {
      // A holiday file is authoritative for its exchange: replacing beats merging, because a
      // day the exchange removed has to disappear or an expiry silently shifts for ever.
      await manager.delete(TradingHolidayEntity, { userId, exchange });
      if (!rows.length) return 0;
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(TradingHolidayEntity)
        .values(rows.map((row) => ({ userId, exchange, date: row.date, name: row.name })) as AnyPatch)
        .orIgnore()
        .execute();
      return result.identifiers.filter((identifier) => identifier !== undefined).length;
    },
    deleteHoliday: async (userId, id) => void (await manager.delete(TradingHolidayEntity, { id, userId })),

    listIpos: async (userId) => (await manager.find(IpoEntity, { where: { userId }, order: { openDate: 'ASC', name: 'ASC' } })).map(toIpo),
    findIpo: async (userId, id) => {
      const row = await manager.findOneBy(IpoEntity, { id, userId });
      return row ? toIpo(row) : null;
    },
    createIpo: async (input) => toIpo(await manager.save(manager.create(IpoEntity, input as AnyPatch))),
    createIpos: async (inputs) => {
      if (!inputs.length) return 0;
      const result = await manager.createQueryBuilder().insert().into(IpoEntity).values(inputs as AnyPatch).execute();
      return result.identifiers.length;
    },
    updateIpo: async (userId, id, patch) => {
      if (Object.keys(patch).length) await manager.update(IpoEntity, { id, userId }, patch as AnyPatch);
      const row = await manager.findOneBy(IpoEntity, { id, userId });
      if (!row) throw new Error('IPO vanished during update');
      return toIpo(row);
    },
    deleteIpo: async (userId, id) => void (await manager.delete(IpoEntity, { id, userId })),
  };

  const alerts: AlertRepository = {
    list: async (userId) => (await manager.find(AlertEntity, { where: { userId }, order: { createdAt: 'ASC' } })).map(toAlert),
    listDue: async () => (await manager.find(AlertEntity, { where: { isEnabled: true }, order: { userId: 'ASC', createdAt: 'ASC' } })).map(toAlert),
    find: async (userId, id) => {
      const row = await manager.findOneBy(AlertEntity, { id, userId });
      return row ? toAlert(row) : null;
    },
    create: async (input) => toAlert(await manager.save(manager.create(AlertEntity, input as AnyPatch))),
    update: async (userId, id, patch) => {
      if (Object.keys(patch).length) await manager.update(AlertEntity, { id, userId }, patch as AnyPatch);
      const row = await manager.findOneBy(AlertEntity, { id, userId });
      if (!row) throw new Error('Alert vanished during update');
      return toAlert(row);
    },
    recordEvaluation: async (userId, id, outcome) => {
      const patch: Record<string, unknown> = {
        lastEvaluatedAt: outcome.at,
        lastStatus: outcome.status,
        lastMessage: outcome.message,
      };
      if (outcome.fired) patch.lastTriggeredAt = outcome.at;
      if (outcome.disable) patch.isEnabled = false;
      await manager.update(AlertEntity, { id, userId }, patch as AnyPatch);
      if (outcome.fired) await manager.increment(AlertEntity, { id, userId }, 'triggerCount', 1);
    },
    delete: async (userId, id) => void (await manager.delete(AlertEntity, { id, userId })),
    count: async (userId) => manager.countBy(AlertEntity, { userId }),
    listTriggers: async (userId, alertId, limit = 50) =>
      (
        await manager.find(AlertTriggerEntity, {
          where: alertId ? { userId, alertId } : { userId },
          order: { firedAt: 'DESC' },
          take: Math.min(limit, 200),
        })
      ).map(toTrigger),
    createTrigger: async (input) => toTrigger(await manager.save(manager.create(AlertTriggerEntity, input as AnyPatch))),
    pruneTriggers: async (userId, alertId, keep) => {
      const survivors = await manager.find(AlertTriggerEntity, {
        where: { userId, alertId },
        order: { firedAt: 'DESC' },
        take: keep,
        select: { id: true },
      });
      await manager
        .createQueryBuilder()
        .delete()
        .from(AlertTriggerEntity)
        .where('user_id = :userId AND alert_id = :alertId', { userId, alertId })
        .andWhere(survivors.length ? 'id NOT IN (:...ids)' : '1 = 1', { ids: survivors.map((s) => s.id) })
        .execute();
    },
  };

  const notifications: NotificationRepository = {
    list: async (userId, filter = {}) =>
      (
        await manager.find(NotificationEntity, {
          where: filter.unreadOnly ? { userId, readAt: IsNull() } : { userId },
          order: { createdAt: 'DESC' },
          take: Math.min(filter.limit ?? 50, 200),
        })
      ).map(toNotification),
    unreadCount: async (userId) => manager.countBy(NotificationEntity, { userId, readAt: IsNull() }),
    create: async (input) => toNotification(await manager.save(manager.create(NotificationEntity, { ...input, readAt: null } as AnyPatch))),
    markRead: async (userId, ids) => {
      const result = await manager.update(NotificationEntity, { userId, id: In(ids), readAt: IsNull() }, { readAt: new Date() } as AnyPatch);
      return result.affected ?? 0;
    },
    markAllRead: async (userId) => {
      const result = await manager.update(NotificationEntity, { userId, readAt: IsNull() }, { readAt: new Date() } as AnyPatch);
      return result.affected ?? 0;
    },
    delete: async (userId, id) => void (await manager.delete(NotificationEntity, { id, userId })),
    prune: async (userId, keep) => {
      const survivors = await manager.find(NotificationEntity, { where: { userId }, order: { createdAt: 'DESC' }, take: keep, select: { id: true } });
      if (survivors.length < keep) return;
      await manager
        .createQueryBuilder()
        .delete()
        .from(NotificationEntity)
        .where('user_id = :userId', { userId })
        .andWhere('id NOT IN (:...ids)', { ids: survivors.map((s) => s.id) })
        .execute();
    },
    findSettings: async (userId) => {
      const row = await manager.findOneBy(NotificationSettingsEntity, { userId });
      return row ? toSettings(row) : null;
    },
    saveSettings: async (userId, patch) => {
      const existing = await manager.findOneBy(NotificationSettingsEntity, { userId });
      if (!existing) {
        await manager.save(manager.create(NotificationSettingsEntity, { userId, ...DEFAULT_NOTIFICATION_SETTINGS, ...patch } as AnyPatch));
      } else if (Object.keys(patch).length) {
        await manager.update(NotificationSettingsEntity, { userId }, patch as AnyPatch);
      }
      const row = await manager.findOneBy(NotificationSettingsEntity, { userId });
      if (!row) throw new Error('Notification settings vanished during save');
      return toSettings(row);
    },
    listUserIdsWithAlerts: async () => {
      const rows = (await manager
        .createQueryBuilder(AlertEntity, 'a')
        .select('DISTINCT a.user_id', 'userId')
        .where('a.is_enabled = true')
        .getRawMany()) as { userId: string }[];
      return rows.map((row) => row.userId);
    },
  };

  const news: NewsRepository = {
    listFeeds: async (userId) => (await manager.find(NewsFeedEntity, { where: { userId }, order: { createdAt: 'ASC' } })).map(toFeed),
    findFeed: async (userId, id) => {
      const row = await manager.findOneBy(NewsFeedEntity, { id, userId });
      return row ? toFeed(row) : null;
    },
    createFeed: async (input) => toFeed(await manager.save(manager.create(NewsFeedEntity, input as AnyPatch))),
    updateFeed: async (userId, id, patch) => {
      if (Object.keys(patch).length) await manager.update(NewsFeedEntity, { id, userId }, patch as AnyPatch);
      const row = await manager.findOneBy(NewsFeedEntity, { id, userId });
      if (!row) throw new Error('Feed vanished during update');
      return toFeed(row);
    },
    deleteFeed: async (userId, id) => void (await manager.delete(NewsFeedEntity, { id, userId })),
    listDigests: async (userId, limit = 12) =>
      (await manager.find(NewsDigestEntity, { where: { userId }, order: { createdAt: 'DESC' }, take: Math.min(limit, 60) })).map(toDigest),
    findDigest: async (userId, id) => {
      const row = await manager.findOneBy(NewsDigestEntity, { id, userId });
      return row ? toDigest(row) : null;
    },
    createDigest: async (input) => toDigest(await manager.save(manager.create(NewsDigestEntity, input as AnyPatch))),
    deleteDigest: async (userId, id) => void (await manager.delete(NewsDigestEntity, { id, userId })),
  };

  const guardrails: GuardrailRepository = {
    list: async (userId, from) =>
      (
        await manager.find(GuardrailBreachEntity, {
          where: from ? { userId, periodStart: MoreThanOrEqual(from) } : { userId },
          order: { periodStart: 'DESC' },
        })
      ).map(toBreach),
    claim: async (input) => {
      // One row per (user, kind, period): the unique index makes a second breach on the same
      // day a no-op, which is what keeps it to one email per breach.
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(GuardrailBreachEntity)
        .values(input as AnyPatch)
        .orIgnore()
        .execute();
      const id = result.identifiers[0]?.id as string | undefined;
      if (!id) return null;
      const row = await manager.findOneBy(GuardrailBreachEntity, { id, userId: input.userId });
      return row ? toBreach(row) : null;
    },
    markNotified: async (userId, id, at) => void (await manager.update(GuardrailBreachEntity, { id, userId }, { notifiedAt: at })),
  };

  return { watchlists, quotes, marketCalendar, alerts, notifications, news, guardrails };
}
