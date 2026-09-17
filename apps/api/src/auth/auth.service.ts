import { AuthTokenEntity, RefreshTokenEntity, UserEntity } from '@arvo/database';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MAILER, type Mailer } from '../mail/mailer';
import { templates } from '../mail/templates';
import type { LoginDto, LoginResponse, RegisterDto, TokenResponseDto, TwoFactorChallengeDto } from './dto/auth.dto';
import { generateToken, hashToken } from './security';
import { isValidTimezone } from './timezone';

const ARGON2_OPTIONS = { type: argon2.argon2id } as const;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 3_600_000;
export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 300;

export { hashToken };

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

export interface TwoFactorChallengePayload {
  sub: string;
  typ: '2fa_challenge';
  jti: string;
}

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so login timing does not reveal accounts. */
  private readonly dummyHash = argon2.hash('arvo-timing-equalizer', ARGON2_OPTIONS);
  private readonly logger = new Logger('auth');

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async register(dto: RegisterDto): Promise<TokenResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const timezone = dto.timezone ?? 'Asia/Kolkata';
    if (!isValidTimezone(timezone)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TIMEZONE', 'timezone must be an IANA timezone');
    }
    const users = this.dataSource.getRepository(UserEntity);
    if (await users.existsBy({ email })) {
      throw new ApiError(HttpStatus.CONFLICT, 'EMAIL_ALREADY_REGISTERED', 'Email is already registered');
    }
    const user = await users.save(
      users.create({
        email,
        name: dto.name.trim(),
        passwordHash: await hashPassword(dto.password),
        currency: dto.currency ?? 'INR',
        timezone,
      }),
    );
    await this.sendVerificationEmail(user);
    return this.issueTokens(user.id);
  }

  /** Issues a fresh 24h verification link; earlier links stop working. */
  async sendVerificationEmail(user: UserEntity): Promise<void> {
    const token = generateToken();
    await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(AuthTokenEntity);
      await tokens.update({ userId: user.id, purpose: 'email_verification', consumedAt: IsNull() }, { consumedAt: new Date() });
      await tokens.save(
        tokens.create({ userId: user.id, purpose: 'email_verification', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) }),
      );
    });
    this.deliver(templates.verifyEmail(user.email, user.name, `${this.config.publicWebUrl}/verify-email?token=${encodeURIComponent(token)}`));
  }

  /** Sends without blocking the request; failures are logged, never the message content. */
  deliver(message: Parameters<Mailer['send']>[0]): void {
    this.mailer.send(message).catch((error: unknown) => {
      this.logger.error({ msg: 'email delivery failed', subject: message.subject, error: String(error) });
    });
  }

  async verifyPassword(user: UserEntity, password: string): Promise<boolean> {
    return argon2.verify(user.passwordHash, password).catch(() => false);
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOneBy({ email: dto.email.trim().toLowerCase() });
    const valid = user
      ? await argon2.verify(user.passwordHash, dto.password)
      : await argon2.verify(await this.dummyHash, dto.password).then(() => false);
    if (!user || !valid) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (this.config.requireEmailVerification && !user.emailVerifiedAt) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'EMAIL_NOT_VERIFIED', 'Confirm your email address before signing in');
    }
    if (user.twoFactorEnabledAt) return this.createChallenge(user.id);
    return this.completeLogin(user);
  }

  /** Final step of every sign-in, with or without a second factor. */
  async completeLogin(user: UserEntity): Promise<TokenResponseDto> {
    const tokens = await this.issueTokens(user.id);
    if (this.config.loginAlerts) {
      this.deliver(templates.loginAlert(user.email, user.name, new Date(), 'Signed in with your password'));
    }
    return tokens;
  }

  private async createChallenge(userId: string): Promise<TwoFactorChallengeDto> {
    const payload: TwoFactorChallengePayload = { sub: userId, typ: '2fa_challenge', jti: randomUUID() };
    return {
      twoFactorRequired: true,
      challengeToken: await this.jwt.signAsync(payload, { expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS }),
      methods: ['totp', 'email', 'recovery'],
      expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    };
  }

  /** Resolves a login challenge to its user id, or throws. */
  async verifyChallenge(challengeToken: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<TwoFactorChallengePayload>(challengeToken);
      if (payload.typ === '2fa_challenge' && typeof payload.sub === 'string') return payload.sub;
    } catch {
      // fall through
    }
    throw new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CHALLENGE', 'The sign-in attempt expired. Sign in again.');
  }

  /** Revokes every refresh token of a user (password reset, password change). */
  async revokeAllSessions(userId: string, manager?: EntityManager): Promise<void> {
    await (manager ?? this.dataSource.manager)
      .getRepository(RefreshTokenEntity)
      .update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /**
   * Rotates a refresh token. Presenting an already-revoked token signals theft,
   * so every session of that user is revoked.
   */
  async refresh(refreshToken: string | undefined): Promise<TokenResponseDto> {
    const invalid = new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    if (!refreshToken) throw invalid;
    const tokenHash = hashToken(refreshToken);
    let reusedByUserId: string | null = null;

    try {
      return await this.dataSource.transaction(async (manager) => {
        const tokens = manager.getRepository(RefreshTokenEntity);
        const stored = await tokens.findOne({ where: { tokenHash }, lock: { mode: 'pessimistic_write' } });
        if (!stored) throw invalid;
        if (stored.revokedAt) {
          reusedByUserId = stored.userId;
          throw invalid;
        }
        if (stored.expiresAt.getTime() <= Date.now()) throw invalid;
        await tokens.update({ id: stored.id }, { revokedAt: new Date() });
        return this.issueTokens(stored.userId, tokens);
      });
    } finally {
      if (reusedByUserId) {
        await this.dataSource
          .getRepository(RefreshTokenEntity)
          .update({ userId: reusedByUserId, revokedAt: IsNull() }, { revokedAt: new Date() });
      }
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.dataSource
      .getRepository(RefreshTokenEntity)
      .update({ tokenHash: hashToken(refreshToken), revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async verifyAccessToken(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      return payload.typ === 'access' && typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  async issueTokens(
    userId: string,
    tokens = this.dataSource.getRepository(RefreshTokenEntity),
  ): Promise<TokenResponseDto> {
    const payload: AccessTokenPayload = { sub: userId, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
    await tokens.save(tokens.create({ userId, tokenHash: hashToken(refreshToken), expiresAt, revokedAt: null }));
    return {
      accessToken,
      expiresIn: this.config.jwtAccessTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }
}
