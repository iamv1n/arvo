import type { RecurringFrequency } from '@arvo/finance-core';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AccountEntity } from './account.entity';
import { CategoryEntity } from './category.entity';
import { CreatedAt, MONEY_COLUMN, UpdatedAt } from './columns';
import { MerchantEntity } from './merchant.entity';
import { UserEntity } from './user.entity';

/** Detected recurring charges (RecurringTransaction in the product spec). */
@Entity('recurring_series')
@Unique('uq_recurring_series_user_key', ['userId', 'key'])
export class RecurringSeriesEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 400 })
  key!: string;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ name: 'merchant_id', type: 'uuid', nullable: true })
  merchantId!: string | null;

  @ManyToOne(() => MerchantEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'merchant_id' })
  merchant?: MerchantEntity;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => CategoryEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 16 })
  frequency!: RecurringFrequency;

  @Column({ ...MONEY_COLUMN, name: 'expected_amount' })
  expectedAmount!: string;

  @Column({ ...MONEY_COLUMN, name: 'monthly_cost' })
  monthlyCost!: string;

  @Column({ ...MONEY_COLUMN, name: 'last_amount' })
  lastAmount!: string;

  @Column({ ...MONEY_COLUMN, name: 'previous_amount', nullable: true })
  previousAmount!: string | null;

  @Column({ name: 'last_seen', type: 'date' })
  lastSeen!: string;

  @Column({ name: 'next_expected', type: 'date' })
  nextExpected!: string;

  @Column({ type: 'integer' })
  occurrences!: number;

  @Column({ name: 'price_increased', type: 'boolean', default: false })
  priceIncreased!: boolean;

  @Column({ type: 'numeric', precision: 3, scale: 2 })
  confidence!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: 'ACTIVE' | 'STOPPED';

  @Column({ name: 'is_dismissed', type: 'boolean', default: false })
  isDismissed!: boolean;

  @Column({ name: 'transaction_ids', type: 'jsonb', default: () => "'[]'" })
  transactionIds!: string[];

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
