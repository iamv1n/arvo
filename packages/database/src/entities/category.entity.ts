import { CategoryType } from '@arvo/types';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

@Entity('categories')
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** null for system categories. */
  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Index()
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => CategoryEntity, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: CategoryEntity;

  @Column({ type: 'enum', enum: CategoryType, enumName: 'category_type' })
  type!: CategoryType;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
