import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt } from './columns';
import { UserEntity } from './user.entity';

export type AuthTokenPurpose = 'email_verification' | 'password_reset' | 'email_otp';

/**
 * Single-use secrets sent by email: verification links, password reset links and sign-in codes.
 * Only a hash is stored.
 */
@Entity('auth_tokens')
@Index(['userId', 'purpose'])
export class AuthTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 32 })
  purpose!: AuthTokenPurpose;

  @Index()
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  /** Failed guesses, for short codes. */
  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @CreatedAt()
  createdAt!: Date;
}

/** Two-factor recovery codes; hashed, each usable once. */
@Entity('recovery_codes')
export class RecoveryCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'code_hash', type: 'char', length: 64 })
  codeHash!: string;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;
}
