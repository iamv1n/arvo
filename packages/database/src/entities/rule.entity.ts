import type { RuleActions, RuleCondition } from '@arvo/finance-core';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

@Entity('rules')
@Index('idx_rules_user_priority', ['userId', 'priority'])
export class RuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'integer' })
  priority!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb' })
  conditions!: RuleCondition[];

  @Column({ type: 'jsonb' })
  actions!: RuleActions;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
