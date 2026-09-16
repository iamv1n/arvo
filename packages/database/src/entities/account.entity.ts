import { AccountType } from '@arvo/types';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt, MONEY_COLUMN, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

@Entity('accounts')
export class AccountEntity {
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

  @Column({ type: 'enum', enum: AccountType, enumName: 'account_type' })
  type!: AccountType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  institution!: string | null;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ ...MONEY_COLUMN, name: 'opening_balance', default: 0 })
  openingBalance!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
