import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt } from './columns';
import { UserEntity } from './user.entity';

/**
 * OAuth clients: dynamically registered (RFC 7591) or cached Client ID Metadata Documents.
 * client_id is either a generated id or the HTTPS URL of the client's metadata document.
 */
@Entity('oauth_clients')
export class OAuthClientEntity {
  @PrimaryColumn({ name: 'client_id', type: 'varchar', length: 512 })
  clientId!: string;

  @Column({ name: 'client_name', type: 'varchar', length: 200 })
  clientName!: string;

  @Column({ name: 'redirect_uris', type: 'jsonb' })
  redirectUris!: string[];

  @Column({ name: 'client_uri', type: 'varchar', length: 512, nullable: true })
  clientUri!: string | null;

  @Column({ name: 'logo_uri', type: 'varchar', length: 512, nullable: true })
  logoUri!: string | null;

  /** DCR or CIMD. */
  @Column({ name: 'registration_type', type: 'varchar', length: 8 })
  registrationType!: 'DCR' | 'CIMD';

  @CreatedAt()
  createdAt!: Date;

  /** When a CIMD document was last fetched; used to refresh cached metadata. */
  @Column({ name: 'fetched_at', type: 'timestamptz', nullable: true })
  fetchedAt!: Date | null;
}

export type OAuthAuthorizationStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'USED';

/** An authorization request awaiting consent; after approval it holds the single-use code. */
@Entity('oauth_authorizations')
export class OAuthAuthorizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'varchar', length: 512 })
  clientId!: string;

  @ManyToOne(() => OAuthClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: OAuthClientEntity;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'redirect_uri', type: 'varchar', length: 1024 })
  redirectUri!: string;

  @Column({ type: 'varchar', length: 200 })
  scope!: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  state!: string | null;

  @Column({ name: 'code_challenge', type: 'varchar', length: 128 })
  codeChallenge!: string;

  @Column({ type: 'varchar', length: 512 })
  resource!: string;

  @Column({ type: 'varchar', length: 12 })
  status!: OAuthAuthorizationStatus;

  @Index({ unique: true, where: 'code_hash IS NOT NULL' })
  @Column({ name: 'code_hash', type: 'char', length: 64, nullable: true })
  codeHash!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreatedAt()
  createdAt!: Date;
}

/** An OAuth grant: one access/refresh token pair for a user and client, bound to a resource. */
@Entity('oauth_tokens')
@Index('idx_oauth_tokens_user_client', ['userId', 'clientId'])
export class OAuthTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'client_id', type: 'varchar', length: 512 })
  clientId!: string;

  @ManyToOne(() => OAuthClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: OAuthClientEntity;

  @Column({ type: 'varchar', length: 200 })
  scope!: string;

  /** Canonical URI of the MCP server the tokens are valid for (RFC 8707 audience). */
  @Column({ type: 'varchar', length: 512 })
  resource!: string;

  @Index({ unique: true })
  @Column({ name: 'access_token_hash', type: 'char', length: 64 })
  accessTokenHash!: string;

  @Column({ name: 'access_expires_at', type: 'timestamptz' })
  accessExpiresAt!: Date;

  @Index({ unique: true })
  @Column({ name: 'refresh_token_hash', type: 'char', length: 64 })
  refreshTokenHash!: string;

  @Column({ name: 'refresh_expires_at', type: 'timestamptz' })
  refreshExpiresAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;
}
