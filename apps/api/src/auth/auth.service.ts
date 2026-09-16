import { RefreshTokenEntity, UserEntity } from '@arvo/database';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { LoginDto, RegisterDto, TokenResponseDto } from './dto/auth.dto';
import { isValidTimezone } from './timezone';

const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so login timing does not reveal accounts. */
  private readonly dummyHash = argon2.hash('arvo-timing-equalizer', ARGON2_OPTIONS);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
        passwordHash: await argon2.hash(dto.password, ARGON2_OPTIONS),
        currency: dto.currency ?? 'INR',
        timezone,
      }),
    );
    return this.issueTokens(user.id);
  }

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOneBy({ email: dto.email.trim().toLowerCase() });
    const valid = user
      ? await argon2.verify(user.passwordHash, dto.password)
      : await argon2.verify(await this.dummyHash, dto.password).then(() => false);
    if (!user || !valid) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return this.issueTokens(user.id);
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

  private async issueTokens(
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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
