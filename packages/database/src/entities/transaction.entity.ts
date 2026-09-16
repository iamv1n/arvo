import { TransactionSource, TransactionStatus, TransactionType } from '@arvo/types';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AccountEntity } from './account.entity';
import { CategoryEntity } from './category.entity';
import { CreatedAt, MONEY_COLUMN, UpdatedAt } from './columns';
import { MerchantEntity } from './merchant.entity';
import { UserEntity } from './user.entity';

@Entity('transactions')
@Index('idx_transactions_user_date', ['userId', 'date'])
@Index('idx_transactions_user_account_date', ['userId', 'accountId', 'date'])
@Index('idx_transactions_user_category_date', ['userId', 'categoryId', 'date'])
@Index('idx_transactions_user_merchant_date', ['userId', 'merchantId', 'date'])
@Index('idx_transactions_user_fingerprint', ['userId', 'fingerprint'])
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => AccountEntity)
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  /** Original transaction date, as printed on the statement (no timezone shift). */
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ name: 'merchant_id', type: 'uuid', nullable: true })
  merchantId!: string | null;

  @ManyToOne(() => MerchantEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'merchant_id' })
  merchant?: MerchantEntity;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => CategoryEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @Column(MONEY_COLUMN)
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'enum', enum: TransactionType, enumName: 'transaction_type' })
  type!: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus, enumName: 'transaction_status' })
  status!: TransactionStatus;

  @Column({ type: 'enum', enum: TransactionSource, enumName: 'transaction_source' })
  source!: TransactionSource;

  @Column({ name: 'source_reference', type: 'varchar', length: 255, nullable: true })
  sourceReference!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
