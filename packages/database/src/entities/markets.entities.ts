import type {
  AlertChannel,
  AlertKind,
  AlertParams,
  AlertStatus,
  CorporateActionKind,
  DigestFrequency,
  ExpiryRule,
  GuardrailKind,
  IpoStatus,
  NewsDigestItem,
  NotificationKind,
  QuoteSource,
} from '@arvo/finance-core';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CreatedAt, MONEY_COLUMN, UNITS_COLUMN, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

/*
 * Markets & Alerts storage.
 *
 * Two shapes live here. Watchlists, calendars and alerts are user-written records and behave
 * like every other owned row. Quotes are a cache: a unique key on (user, symbol, exchange) and
 * nothing that any other table points at, so the whole table can be truncated without losing a
 * single fact the user typed.
 *
 * Alert parameters and trigger evidence are JSON on purpose. There are nine alert kinds with
 * almost disjoint parameters, and a column per kind would be forty mostly-null columns; the
 * discriminated union is validated in finance-core before it reaches here. Evidence is JSON
 * because it is a snapshot, never queried by field, and must never be recomputed.
 */

@Entity('markets_watchlists')
@Index('idx_watchlists_user', ['userId', 'position'])
export class WatchlistEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_watchlist_items')
@Index('idx_watchlist_items_list', ['watchlistId', 'position'])
export class WatchlistItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'watchlist_id', type: 'uuid' })
  watchlistId!: string;

  @ManyToOne(() => WatchlistEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'watchlist_id' })
  watchlist?: WatchlistEntity;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  exchange!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  isin!: string | null;

  @Column({ name: 'scheme_code', type: 'varchar', length: 32, nullable: true })
  schemeCode!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_quotes')
@Unique('uq_quotes_user_symbol', ['userId', 'symbol'])
export class QuoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  exchange!: string | null;

  @Column(MONEY_COLUMN)
  price!: string;

  @Column({ name: 'previous_close', type: 'numeric', precision: 19, scale: 4, nullable: true })
  previousClose!: string | null;

  @Column({ name: 'as_of', type: 'date' })
  asOf!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: QuoteSource;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_corporate_actions')
@Index('idx_corporate_actions_user_date', ['userId', 'exDate'])
export class CorporateActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind!: CorporateActionKind;

  @Column({ name: 'ex_date', type: 'date' })
  exDate!: string;

  @Column({ name: 'record_date', type: 'date', nullable: true })
  recordDate!: string | null;

  @Column({ name: 'pay_date', type: 'date', nullable: true })
  payDate!: string | null;

  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true })
  amount!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  ratio!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'MANUAL' })
  source!: 'MANUAL' | 'IMPORT';

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_trading_holidays')
@Unique('uq_holidays_user_exchange_date', ['userId', 'exchange', 'date'])
export class TradingHolidayEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: 'NSE' })
  exchange!: string;

  @CreatedAt()
  createdAt!: Date;
}

@Entity('markets_ipos')
@Index('idx_ipos_user', ['userId', 'openDate'])
export class IpoEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  symbol!: string | null;

  @Column({ name: 'open_date', type: 'date', nullable: true })
  openDate!: string | null;

  @Column({ name: 'close_date', type: 'date', nullable: true })
  closeDate!: string | null;

  @Column({ name: 'price_band_low', type: 'numeric', precision: 19, scale: 4, nullable: true })
  priceBandLow!: string | null;

  @Column({ name: 'price_band_high', type: 'numeric', precision: 19, scale: 4, nullable: true })
  priceBandHigh!: string | null;

  @Column({ name: 'lot_size', type: 'int', nullable: true })
  lotSize!: number | null;

  @Column({ name: 'listing_date', type: 'date', nullable: true })
  listingDate!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'UPCOMING' })
  status!: IpoStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_alerts')
@Index('idx_alerts_user', ['userId'])
@Index('idx_alerts_enabled', ['isEnabled'])
export class AlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: AlertKind;

  @Column({ type: 'jsonb' })
  params!: AlertParams;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ name: 'cooldown_minutes', type: 'int', default: 1440 })
  cooldownMinutes!: number;

  @Column({ type: 'boolean', default: false })
  repeats!: boolean;

  @Column({ type: 'jsonb', default: () => `'["IN_APP"]'::jsonb` })
  channels!: AlertChannel[];

  @Column({ name: 'last_triggered_at', type: 'timestamptz', nullable: true })
  lastTriggeredAt!: Date | null;

  @Column({ name: 'last_evaluated_at', type: 'timestamptz', nullable: true })
  lastEvaluatedAt!: Date | null;

  @Column({ name: 'last_status', type: 'varchar', length: 24, nullable: true })
  lastStatus!: AlertStatus | null;

  @Column({ name: 'last_message', type: 'text', nullable: true })
  lastMessage!: string | null;

  @Column({ name: 'trigger_count', type: 'int', default: 0 })
  triggerCount!: number;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_alert_triggers')
@Index('idx_alert_triggers_alert', ['alertId', 'firedAt'])
export class AlertTriggerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'alert_id', type: 'uuid' })
  alertId!: string;

  @ManyToOne(() => AlertEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alert_id' })
  alert?: AlertEntity;

  @Column({ name: 'fired_at', type: 'timestamptz' })
  firedAt!: Date;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  evidence!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  channels!: AlertChannel[];

  @CreatedAt()
  createdAt!: Date;
}

@Entity('markets_notifications')
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 24 })
  kind!: NotificationKind;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  link!: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  meta!: Record<string, unknown>;

  @CreatedAt()
  createdAt!: Date;
}

@Entity('markets_notification_settings')
export class NotificationSettingsEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'in_app_enabled', type: 'boolean', default: true })
  inAppEnabled!: boolean;

  @Column({ name: 'email_enabled', type: 'boolean', default: false })
  emailEnabled!: boolean;

  @Column({ name: 'telegram_enabled', type: 'boolean', default: false })
  telegramEnabled!: boolean;

  @Column({ name: 'telegram_chat_id', type: 'varchar', length: 64, nullable: true })
  telegramChatId!: string | null;

  @Column({ name: 'quiet_hours_start', type: 'varchar', length: 5, nullable: true })
  quietHoursStart!: string | null;

  @Column({ name: 'quiet_hours_end', type: 'varchar', length: 5, nullable: true })
  quietHoursEnd!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone!: string;

  @Column({ name: 'stale_quote_minutes', type: 'int', default: 1440 })
  staleQuoteMinutes!: number;

  @Column({ name: 'refresh_cooldown_seconds', type: 'int', default: 60 })
  refreshCooldownSeconds!: number;

  @Column({ name: 'news_digest_frequency', type: 'varchar', length: 16, default: 'off' })
  newsDigestFrequency!: DigestFrequency;

  @Column({ name: 'expiry_rules', type: 'jsonb', default: () => `'[]'::jsonb` })
  expiryRules!: ExpiryRule[];

  @Column({ name: 'portfolio_peak_value', type: 'numeric', precision: 19, scale: 4, nullable: true })
  portfolioPeakValue!: string | null;

  @Column({ name: 'portfolio_peak_on', type: 'date', nullable: true })
  portfolioPeakOn!: string | null;

  @Column({ name: 'last_quote_refresh_at', type: 'timestamptz', nullable: true })
  lastQuoteRefreshAt!: Date | null;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_news_feeds')
@Index('idx_news_feeds_user', ['userId'])
export class NewsFeedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ name: 'last_fetched_at', type: 'timestamptz', nullable: true })
  lastFetchedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('markets_news_digests')
@Index('idx_news_digests_user', ['userId', 'createdAt'])
export class NewsDigestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  items!: NewsDigestItem[];

  @Column({ type: 'varchar', length: 32, default: 'none' })
  provider!: string;

  @CreatedAt()
  createdAt!: Date;
}

@Entity('markets_guardrail_breaches')
@Unique('uq_guardrail_user_kind_period', ['userId', 'kind', 'periodStart'])
export class GuardrailBreachEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 24 })
  kind!: GuardrailKind;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column(UNITS_COLUMN)
  limit!: string;

  @Column(UNITS_COLUMN)
  actual!: string;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;
}
