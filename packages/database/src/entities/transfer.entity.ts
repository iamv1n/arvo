import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt } from './columns';
import { TransactionEntity } from './transaction.entity';
import { UserEntity } from './user.entity';

@Entity('transfers')
@Check('chk_transfers_distinct_legs', '"from_transaction_id" <> "to_transaction_id"')
export class TransferEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'from_transaction_id', type: 'uuid' })
  fromTransactionId!: string;

  @OneToOne(() => TransactionEntity)
  @JoinColumn({ name: 'from_transaction_id' })
  fromTransaction?: TransactionEntity;

  @Column({ name: 'to_transaction_id', type: 'uuid' })
  toTransactionId!: string;

  @OneToOne(() => TransactionEntity)
  @JoinColumn({ name: 'to_transaction_id' })
  toTransaction?: TransactionEntity;

  @CreatedAt()
  createdAt!: Date;
}
