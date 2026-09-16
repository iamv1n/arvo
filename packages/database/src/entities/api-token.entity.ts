import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt } from './columns';
import { UserEntity } from './user.entity';

export type ApiTokenScope = 'read';

/**
 * Personal access tokens for MCP clients and automation. Only a SHA-256 hash is stored;
 * the plaintext is shown once at creation. The prefix helps users recognise tokens.
 */
@Entity('api_tokens')
export class ApiTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'token_prefix', type: 'varchar', length: 16 })
  tokenPrefix!: string;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash!: string;

  @Column({ type: 'jsonb', default: () => "'[\"read\"]'" })
  scopes!: ApiTokenScope[];

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;
}
