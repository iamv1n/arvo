import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CreatedAt, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

@Entity('merchants')
@Unique('uq_merchants_user_normalized_name', ['userId', 'normalizedName'])
export class MerchantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'normalized_name', type: 'varchar', length: 120 })
  normalizedName!: string;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
