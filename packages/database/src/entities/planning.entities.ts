import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AccountEntity } from './account.entity';
import { CategoryEntity } from './category.entity';
import { CreatedAt, MONEY_COLUMN, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

@Entity('budgets')
@Unique('uq_budgets_user_category_currency', ['userId', 'categoryId', 'currency'])
export class BudgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => CategoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @Column(MONEY_COLUMN)
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'boolean', default: false })
  rollover!: boolean;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('goals')
export class GoalEntity {
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

  @Column({ ...MONEY_COLUMN, name: 'target_amount' })
  targetAmount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'target_date', type: 'date' })
  targetDate!: string;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  @Column({ ...MONEY_COLUMN, name: 'saved_amount', default: 0 })
  savedAmount!: string;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
