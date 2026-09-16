import type {
  CategorizationSource,
  ColumnMapping,
  Detection,
  ImportFileType,
  ImportRowDecision,
  ImportRowStatus,
  RowIssue,
} from '@arvo/finance-core';
import { ImportStatus, TransactionType } from '@arvo/types';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { AccountEntity } from './account.entity';
import { CategoryEntity } from './category.entity';
import { CreatedAt, MONEY_COLUMN, UpdatedAt } from './columns';
import { TransactionEntity } from './transaction.entity';
import { UserEntity } from './user.entity';

@Entity('import_batches')
@Index('idx_import_batches_user_created', ['userId', 'createdAt'])
@Index('idx_import_batches_user_account_hash', ['userId', 'accountId', 'fileHash'])
export class ImportBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ name: 'file_type', type: 'varchar', length: 8 })
  fileType!: ImportFileType;

  @Column({ name: 'file_hash', type: 'char', length: 64 })
  fileHash!: string;

  @Column({ name: 'file_size', type: 'integer' })
  fileSize!: number;

  @Column({ name: 'storage_key', type: 'varchar', length: 255 })
  storageKey!: string;

  @Column({ type: 'enum', enum: ImportStatus, enumName: 'import_status' })
  status!: ImportStatus;

  @Column({ name: 'total_rows', type: 'integer', default: 0 })
  totalRows!: number;

  @Column({ name: 'processed_rows', type: 'integer', default: 0 })
  processedRows!: number;

  @Column({ type: 'jsonb', nullable: true })
  mapping!: ColumnMapping | null;

  @Column({ type: 'jsonb', nullable: true })
  detection!: Detection | null;

  @Column({ name: 'duplicate_of_batch_id', type: 'uuid', nullable: true })
  duplicateOfBatchId!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}

/** A staged statement line under review. Called ImportedTransaction in the product spec. */
@Entity('import_rows')
@Index('idx_import_rows_batch_row', ['batchId', 'rowNumber'])
@Index('idx_import_rows_batch_status', ['batchId', 'status'])
export class ImportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => ImportBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch?: ImportBatchEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'row_number', type: 'integer' })
  rowNumber!: number;

  @Column({ type: 'jsonb' })
  raw!: string[];

  @Column({ type: 'date', nullable: true })
  date!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ ...MONEY_COLUMN, nullable: true })
  amount!: string | null;

  @Column({ type: 'char', length: 3, nullable: true })
  currency!: string | null;

  @Column({ type: 'enum', enum: TransactionType, enumName: 'transaction_type', nullable: true })
  type!: TransactionType | null;

  @Column({ name: 'merchant_name', type: 'varchar', length: 120, nullable: true })
  merchantName!: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => CategoryEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @Column({ name: 'categorization_source', type: 'varchar', length: 16, nullable: true })
  categorizationSource!: CategorizationSource | null;

  @Column({ name: 'source_reference', type: 'varchar', length: 255, nullable: true })
  sourceReference!: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  fingerprint!: string | null;

  @Column({ type: 'varchar', length: 24 })
  status!: ImportRowStatus;

  @Column({ type: 'varchar', length: 16 })
  decision!: ImportRowDecision;

  @Column({ name: 'duplicate_of_transaction_id', type: 'uuid', nullable: true })
  duplicateOfTransactionId!: string | null;

  @ManyToOne(() => TransactionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'duplicate_of_transaction_id' })
  duplicateOfTransaction?: TransactionEntity;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  issues!: RowIssue[];

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId!: string | null;

  @ManyToOne(() => TransactionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: TransactionEntity;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

/** File-level warnings and lines skipped during parsing. */
@Entity('import_errors')
@Index('idx_import_errors_batch', ['batchId'])
export class ImportErrorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => ImportBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch?: ImportBatchEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'row_number', type: 'integer', nullable: true })
  rowNumber!: number | null;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'text' })
  message!: string;

  @CreatedAt()
  createdAt!: Date;
}

/** Column mappings remembered per user and statement header layout. */
@Entity('import_column_mappings')
export class ImportColumnMappingEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @PrimaryColumn({ name: 'header_signature', type: 'char', length: 64 })
  headerSignature!: string;

  @Column({ type: 'jsonb' })
  mapping!: ColumnMapping;

  @UpdatedAt()
  updatedAt!: Date;
}
