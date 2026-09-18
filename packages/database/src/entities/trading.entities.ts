import type {
  BrokerConfig,
  ChargesSource,
  JournalAttachment,
  OptionRight,
  ParsedTradeRow,
  TradeExchange,
  TradeImportRowStatus,
  TradeImportSource,
  TradeImportStatus,
  TradeKind,
  TradeSegment,
  TradeSide,
} from '@arvo/finance-core';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CreatedAt, MONEY_COLUMN, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

/*
 * Trading journal storage.
 *
 * Money stays numeric(19,4) like the rest of the ledger. Quantities are bigint: Indian
 * exchanges fill whole shares and whole contracts, and an integer column makes the FIFO
 * matching exact without the units scale the portfolio module needs for fund allotments.
 *
 * The eight charge components are stored separately rather than as one total, because the
 * tax view needs them apart (STT on delivery is not a business expense) and because a user
 * has to be able to see where an estimate differs from the contract note.
 *
 * Positions are not stored: they are rebuilt from the fills on every read, so a corrected
 * trade cannot leave a stale total behind. A journal entry therefore keys on the id of the
 * fill that opened the round trip.
 */

@Entity('trades')
@Index('idx_trades_user_date', ['userId', 'date'])
@Index('idx_trades_user_underlying', ['userId', 'underlying'])
@Index('idx_trades_user_paper', ['userId', 'isPaper'])
@Unique('uq_trades_user_external_ref', ['userId', 'externalRef'])
export class TradeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'date' })
  date!: string;

  /** Fill time in the exchange's own day; null when the file carried none. */
  @Column({ type: 'time', nullable: true })
  time!: string | null;

  @Column({ type: 'varchar', length: 60 })
  broker!: string;

  @Column({ type: 'varchar', length: 10 })
  exchange!: TradeExchange;

  @Column({ type: 'varchar', length: 24 })
  segment!: TradeSegment;

  @Column({ type: 'varchar', length: 12, default: 'TRADE' })
  kind!: TradeKind;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 64 })
  underlying!: string;

  @Column({ type: 'varchar', length: 12, nullable: true })
  isin!: string | null;

  @Column({ type: 'date', nullable: true })
  expiry!: string | null;

  @Column({ ...MONEY_COLUMN, nullable: true })
  strike!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  right!: OptionRight | null;

  @Column({ name: 'lot_size', type: 'int', default: 1 })
  lotSize!: number;

  @Column({ type: 'varchar', length: 4 })
  side!: TradeSide;

  /** Whole units filled. Always positive; direction comes from `side`. */
  @Column({ type: 'bigint' })
  quantity!: string;

  @Column(MONEY_COLUMN)
  price!: string;

  @Column(MONEY_COLUMN)
  amount!: string;

  @Column({ ...MONEY_COLUMN, default: 0 })
  brokerage!: string;

  @Column({ ...MONEY_COLUMN, default: 0 })
  stt!: string;

  @Column({ ...MONEY_COLUMN, name: 'exchange_charges', default: 0 })
  exchangeCharges!: string;

  @Column({ ...MONEY_COLUMN, name: 'sebi_charges', default: 0 })
  sebiCharges!: string;

  @Column({ ...MONEY_COLUMN, name: 'stamp_duty', default: 0 })
  stampDuty!: string;

  @Column({ ...MONEY_COLUMN, default: 0 })
  gst!: string;

  @Column({ ...MONEY_COLUMN, name: 'dp_charges', default: 0 })
  dpCharges!: string;

  @Column({ ...MONEY_COLUMN, name: 'other_charges', default: 0 })
  otherCharges!: string;

  @Column({ ...MONEY_COLUMN, name: 'total_charges', default: 0 })
  totalCharges!: string;

  /** Whether the charges above came from the file or from the statutory rate table. */
  @Column({ name: 'charges_source', type: 'varchar', length: 10, default: 'ESTIMATED' })
  chargesSource!: ChargesSource;

  @Column({ name: 'order_id', type: 'varchar', length: 64, nullable: true })
  orderId!: string | null;

  @Column({ name: 'trade_ref', type: 'varchar', length: 64, nullable: true })
  tradeRef!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  /** Duplicate key from the file this fill came from; null for manual entries. */
  @Column({ name: 'external_ref', type: 'varchar', length: 400, nullable: true })
  externalRef!: string | null;

  /**
   * True for a fill the Strategy Lab's paper trading produced. Every journal query leaves these
   * out unless it asks for them, so simulated trades can never flatter the metrics that describe
   * real money.
   */
  @Column({ name: 'is_paper', type: 'boolean', default: false })
  isPaper!: boolean;

  @Column({ name: 'paper_account_id', type: 'uuid', nullable: true })
  paperAccountId!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('trade_journal_entries')
@Unique('uq_trade_journal_user_position', ['userId', 'positionId'])
export class TradeJournalEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** The opening fill of the round trip this entry describes. */
  @Column({ name: 'position_id', type: 'uuid' })
  positionId!: string;

  @ManyToOne(() => TradeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position?: TradeEntity;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'setup_tags', type: 'jsonb', default: () => "'[]'" })
  setupTags!: string[];

  @Column({ name: 'emotion_tags', type: 'jsonb', default: () => "'[]'" })
  emotionTags!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  mistakes!: string[];

  @Column({ ...MONEY_COLUMN, name: 'stop_price', nullable: true })
  stopPrice!: string | null;

  @Column({ ...MONEY_COLUMN, name: 'target_price', nullable: true })
  targetPrice!: string | null;

  /** Local file references only; screenshots never leave the machine. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  screenshots!: JournalAttachment[];

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('trading_settings')
export class TradingSettingsEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** Per-broker brokerage plans; anything missing falls back to the discount default. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  brokers!: BrokerConfig[];

  @Column({ name: 'revenge_window_minutes', type: 'int', default: 15 })
  revengeWindowMinutes!: number;

  @Column({ ...MONEY_COLUMN, name: 'over_trading_multiple', default: 2 })
  overTradingMultiple!: string;

  @Column({ ...MONEY_COLUMN, name: 'assumed_index_return_percent', default: 12 })
  assumedIndexReturnPercent!: string;

  @Column({ ...MONEY_COLUMN, name: 'assumed_fd_rate_percent', default: 7 })
  assumedFdRatePercent!: string;

  @Column({ name: 'benchmark_series', type: 'varchar', length: 80, nullable: true })
  benchmarkSeries!: string | null;

  @Column({ name: 'setup_tags', type: 'jsonb', default: () => "'[]'" })
  setupTags!: string[];

  @Column({ name: 'emotion_tags', type: 'jsonb', default: () => "'[]'" })
  emotionTags!: string[];

  /** Risk guardrails the trader set for themselves. Null means no limit; never blocking. */
  @Column({ name: 'max_loss_per_day', type: 'numeric', precision: 19, scale: 4, nullable: true })
  maxLossPerDay!: string | null;

  @Column({ name: 'max_loss_per_week', type: 'numeric', precision: 19, scale: 4, nullable: true })
  maxLossPerWeek!: string | null;

  @Column({ name: 'max_trades_per_day', type: 'int', nullable: true })
  maxTradesPerDay!: number | null;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('trade_import_batches')
export class TradeImportBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 30 })
  source!: TradeImportSource;

  /** The mapping profile that recognised the layout, e.g. "zerodha-tradebook". */
  @Column({ type: 'varchar', length: 40, default: 'unknown' })
  profile!: string;

  @Column({ type: 'varchar', length: 60, default: 'Unknown' })
  broker!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: TradeImportStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  warnings!: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  error!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('trade_import_rows')
@Index('idx_trade_import_rows_batch', ['userId', 'batchId'])
export class TradeImportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => TradeImportBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch?: TradeImportBatchEntity;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber!: number;

  @Column({ type: 'varchar', length: 20 })
  status!: TradeImportRowStatus;

  @Column({ type: 'varchar', length: 300, nullable: true })
  message!: string | null;

  /** The parsed fill, validated by Finance Core before it is committed. */
  @Column({ type: 'jsonb' })
  parsed!: ParsedTradeRow;

  @CreatedAt()
  createdAt!: Date;
}
