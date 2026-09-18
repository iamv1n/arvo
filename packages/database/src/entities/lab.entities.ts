import type {
  Bar,
  BacktestResult,
  BacktestStats,
  BarImportStatus,
  BarTimeframe,
  PaperOrderStatus,
  PaperOrderType,
  StrategySpec,
} from '@arvo/finance-core';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt, MONEY_COLUMN, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

/*
 * Strategy Lab storage.
 *
 * Only three things are worth persisting: the bars a user imported, the strategies they wrote,
 * and the runs and paper accounts those produced. A payoff diagram is not stored — it is a pure
 * function of a form, and a saved copy would only go stale.
 *
 * Prices here are numeric(19,4) like every other number in the ledger, even though the engine
 * reads them as doubles: the storage layer's job is to give back exactly what went in, and a
 * float column would not.
 *
 * A backtest keeps the whole result as JSON, including the spec it ran against. Strategies get
 * edited, and a run that silently followed the current version of its strategy would be a
 * record of something that never happened.
 */

@Entity('lab_market_bars')
@Index('idx_lab_bars_series', ['userId', 'symbol', 'timeframe', 'date'])
export class MarketBarEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 8 })
  timeframe!: BarTimeframe;

  @Column({ type: 'date' })
  date!: string;

  /** HH:MM for intraday bars; null on daily bars. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  time!: string | null;

  @Column(MONEY_COLUMN)
  open!: string;

  @Column(MONEY_COLUMN)
  high!: string;

  @Column(MONEY_COLUMN)
  low!: string;

  @Column(MONEY_COLUMN)
  close!: string;

  @Column({ type: 'bigint', default: 0 })
  volume!: string;

  @CreatedAt()
  createdAt!: Date;
}

@Entity('lab_bar_imports')
export class BarImportBatchEntity {
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

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 8 })
  timeframe!: BarTimeframe;

  @Column({ type: 'varchar', length: 12, default: 'READY' })
  status!: BarImportStatus;

  @Column({ name: 'row_count', type: 'int', default: 0 })
  rowCount!: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  warnings!: string[];

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'from_date', type: 'date', nullable: true })
  from!: string | null;

  @Column({ name: 'to_date', type: 'date', nullable: true })
  to!: string | null;

  /** The parsed bars, held for review and emptied on commit. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  parsed!: Bar[];

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('lab_strategies')
export class LabStrategyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** The rule tree. Data, never code: see lab/strategy-spec.ts. */
  @Column({ type: 'jsonb' })
  spec!: StrategySpec;

  /** How many runs have been made from this strategy; feeds the overfitting warning. */
  @Column({ name: 'run_count', type: 'int', default: 0 })
  runCount!: number;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('lab_backtests')
@Index('idx_lab_backtests_user_created', ['userId', 'createdAt'])
export class LabBacktestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** Null once the strategy is deleted: the run outlives the rule it tested. */
  @Column({ name: 'strategy_id', type: 'uuid', nullable: true })
  strategyId!: string | null;

  @ManyToOne(() => LabStrategyEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'strategy_id' })
  strategy?: LabStrategyEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 8 })
  timeframe!: BarTimeframe;

  @Column({ name: 'from_date', type: 'date', nullable: true })
  from!: string | null;

  @Column({ name: 'to_date', type: 'date', nullable: true })
  to!: string | null;

  /** The headline figures, so the list page needs no blob. */
  @Column({ type: 'jsonb' })
  stats!: BacktestStats;

  @Column({ type: 'jsonb' })
  result!: BacktestResult;

  @CreatedAt()
  createdAt!: Date;
}

@Entity('lab_paper_accounts')
export class PaperAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ ...MONEY_COLUMN, name: 'starting_capital' })
  startingCapital!: string;

  @Column(MONEY_COLUMN)
  cash!: string;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('lab_paper_orders')
@Index('idx_lab_paper_orders_account', ['userId', 'accountId'])
export class PaperOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => PaperAccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: PaperAccountEntity;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 8 })
  timeframe!: BarTimeframe;

  @Column({ type: 'varchar', length: 4 })
  side!: 'BUY' | 'SELL';

  @Column({ type: 'bigint' })
  quantity!: string;

  @Column({ name: 'order_type', type: 'varchar', length: 8 })
  orderType!: PaperOrderType;

  @Column({ ...MONEY_COLUMN, name: 'limit_price', nullable: true })
  limitPrice!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status!: PaperOrderStatus;

  @Column({ name: 'placed_date', type: 'date' })
  placedDate!: string;

  @Column({ name: 'placed_time', type: 'varchar', length: 5, nullable: true })
  placedTime!: string | null;

  @Column({ name: 'filled_date', type: 'date', nullable: true })
  filledDate!: string | null;

  @Column({ name: 'filled_time', type: 'varchar', length: 5, nullable: true })
  filledTime!: string | null;

  @Column({ ...MONEY_COLUMN, name: 'fill_price', nullable: true })
  fillPrice!: string | null;

  /** The journal fill this order produced, marked isPaper. */
  @Column({ name: 'trade_id', type: 'uuid', nullable: true })
  tradeId!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
