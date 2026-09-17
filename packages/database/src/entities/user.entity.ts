import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt, UpdatedAt } from './columns';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stored lower-cased. */
  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone!: string;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  /** Set when TOTP two-factor authentication is active. */
  @Column({ name: 'two_factor_enabled_at', type: 'timestamptz', nullable: true })
  twoFactorEnabledAt!: Date | null;

  /** AES-256-GCM encrypted base32 TOTP secret. */
  @Column({ name: 'totp_secret', type: 'text', nullable: true })
  totpSecret!: string | null;

  /** Encrypted secret awaiting confirmation during setup. */
  @Column({ name: 'totp_pending_secret', type: 'text', nullable: true })
  totpPendingSecret!: string | null;

  /** Last accepted TOTP time step; a code cannot be replayed. */
  @Column({ name: 'totp_last_step', type: 'bigint', nullable: true })
  totpLastStep!: string | null;

  @Column({ name: 'two_factor_failed_attempts', type: 'integer', default: 0 })
  twoFactorFailedAttempts!: number;

  @Column({ name: 'two_factor_locked_until', type: 'timestamptz', nullable: true })
  twoFactorLockedUntil!: Date | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
