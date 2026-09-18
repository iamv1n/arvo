import type {
  AssetClass,
  FundPlan,
  HoldingTransactionType,
  InstrumentKind,
  MarketCap,
  ParsedPortfolioRow,
  PortfolioImportRowStatus,
  PortfolioImportSource,
  PortfolioImportStatus,
} from '@arvo/finance-core';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CreatedAt, MONEY_COLUMN, UNITS_COLUMN, UpdatedAt } from './columns';
import { GoalEntity } from './planning.entities';
import { UserEntity } from './user.entity';

/*
 * Wealth & portfolio storage.
 *
 * Money stays numeric(19,4) like the rest of the ledger. Quantities get their own
 * numeric(24,5) column: mutual funds allot units to 3–4 decimals and the extra digit keeps
 * switches and bonus issues exact (see units.ts in finance-core).
 */

@Entity('holdings')
@Index('idx_holdings_user_scheme_code', ['userId', 'schemeCode'])
export class HoldingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: InstrumentKind;

  @Column({ name: 'asset_class', type: 'varchar', length: 20 })
  assetClass!: AssetClass;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 12, nullable: true })
  isin!: string | null;

  @Column({ name: 'scheme_code', type: 'varchar', length: 24, nullable: true })
  schemeCode!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  symbol!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  folio!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  amc!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sector!: string | null;

  @Column({ name: 'market_cap', type: 'varchar', length: 10, nullable: true })
  marketCap!: MarketCap | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  plan!: FundPlan | null;

  @Column({ ...MONEY_COLUMN, name: 'expense_ratio', nullable: true })
  expenseRatio!: string | null;

  @Column({ ...MONEY_COLUMN, name: 'direct_expense_ratio', nullable: true })
  directExpenseRatio!: string | null;

  @Column({ name: 'exit_load_days', type: 'int', nullable: true })
  exitLoadDays!: number | null;

  @Column({ ...MONEY_COLUMN, name: 'exit_load_percent', nullable: true })
  exitLoadPercent!: string | null;

  @Column({ name: 'lock_in_months', type: 'int', nullable: true })
  lockInMonths!: number | null;

  @Column({ ...MONEY_COLUMN, name: 'latest_price', nullable: true })
  latestPrice!: string | null;

  @Column({ name: 'latest_price_date', type: 'date', nullable: true })
  latestPriceDate!: string | null;

  @Column({ name: 'goal_id', type: 'uuid', nullable: true })
  goalId!: string | null;

  @ManyToOne(() => GoalEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'goal_id' })
  goal?: GoalEntity;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('holding_transactions')
@Index('idx_holding_transactions_user_holding_date', ['userId', 'holdingId', 'date'])
@Unique('uq_holding_transactions_user_external_ref', ['userId', 'externalRef'])
export class HoldingTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'holding_id', type: 'uuid' })
  holdingId!: string;

  @ManyToOne(() => HoldingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'holding_id' })
  holding?: HoldingEntity;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: HoldingTransactionType;

  @Column({ ...UNITS_COLUMN, nullable: true })
  units!: string | null;

  @Column({ ...MONEY_COLUMN, nullable: true })
  price!: string | null;

  @Column(MONEY_COLUMN)
  amount!: string;

  @Column({ ...MONEY_COLUMN, default: 0 })
  charges!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  /** Duplicate key from the statement this row came from; null for manual entries. */
  @Column({ name: 'external_ref', type: 'varchar', length: 400, nullable: true })
  externalRef!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('portfolio_benchmark_points')
@Unique('uq_benchmark_points_user_series_date', ['userId', 'series', 'date'])
export class BenchmarkPointEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 80 })
  series!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column(MONEY_COLUMN)
  value!: string;
}

@Entity('portfolio_fund_holdings')
@Index('idx_fund_holdings_user_holding', ['userId', 'holdingId'])
export class FundHoldingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'holding_id', type: 'uuid' })
  holdingId!: string;

  @ManyToOne(() => HoldingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'holding_id' })
  holding?: HoldingEntity;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 12, nullable: true })
  isin!: string | null;

  /** Percent of the fund's net assets. */
  @Column(MONEY_COLUMN)
  weight!: string;

  @Column({ name: 'as_of', type: 'date' })
  asOf!: string;
}

@Entity('portfolio_import_batches')
export class PortfolioImportBatchEntity {
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
  source!: PortfolioImportSource;

  @Column({ type: 'varchar', length: 20 })
  status!: PortfolioImportStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  warnings!: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  error!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('portfolio_import_rows')
@Index('idx_portfolio_import_rows_batch', ['userId', 'batchId'])
export class PortfolioImportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => PortfolioImportBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch?: PortfolioImportBatchEntity;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber!: number;

  @Column({ type: 'varchar', length: 20 })
  status!: PortfolioImportRowStatus;

  @Column({ type: 'varchar', length: 300, nullable: true })
  message!: string | null;

  @Column({ name: 'holding_id', type: 'uuid', nullable: true })
  holdingId!: string | null;

  @ManyToOne(() => HoldingEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'holding_id' })
  holding?: HoldingEntity;

  /** The parsed row, validated by Finance Core before it is committed. */
  @Column({ type: 'jsonb' })
  parsed!: ParsedPortfolioRow;

  @CreatedAt()
  createdAt!: Date;
}
