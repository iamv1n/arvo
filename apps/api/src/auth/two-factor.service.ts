import { AuthTokenEntity, RecoveryCodeEntity, UserEntity } from '@arvo/database';
import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { DataSource, IsNull, MoreThan, type EntityManager } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { templates } from '../mail/templates';
import { AuthService } from './auth.service';
import type { TokenResponseDto, TotpSetupDto, TwoFactorMethod, TwoFactorStatusDto } from './dto/auth.dto';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hmacHex,
  isTokenUsable,
  numericCode,
  otpauthUri,
  safeEqualHex,
  verifyTotp,
} from './security';

export const MAX_TWO_FACTOR_FAILURES = 5;
export const TWO_FACTOR_LOCK_MS = 15 * 60_000;
export const EMAIL_OTP_TTL_MS = 10 * 60_000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class TwoFactorService implements OnModuleInit {
  private readonly logger = new Logger('two-factor');

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    if (this.config.twoFactorKeyDerived && this.config.nodeEnv !== 'test') {
      this.logger.warn({ msg: 'TWO_FACTOR_ENCRYPTION_KEY is not set; using a key derived from JWT_SECRET. Set it before relying on 2FA.' });
    }
  }

  async status(userId: string): Promise<TwoFactorStatusDto> {
    const user = await this.requireUser(userId);
    const recoveryCodesRemaining = user.twoFactorEnabledAt
      ? await this.dataSource.getRepository(RecoveryCodeEntity).countBy({ userId, usedAt: IsNull() })
      : 0;
    return { enabled: !!user.twoFactorEnabledAt, enabledAt: user.twoFactorEnabledAt, recoveryCodesRemaining };
  }

  async setupTotp(userId: string): Promise<TotpSetupDto> {
    const user = await this.requireUser(userId);
    if (user.twoFactorEnabledAt) {
      throw new ApiError(HttpStatus.CONFLICT, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already on');
    }
    const secret = generateTotpSecret();
    await this.users().update({ id: userId }, { totpPendingSecret: encryptSecret(this.config.twoFactorEncryptionKey, secret) });
    const uri = otpauthUri(secret, user.email);
    return { otpauthUri: uri, secret, qrDataUrl: await toDataURL(uri, { margin: 1, width: 220 }) };
  }

  async enableTotp(userId: string, code: string): Promise<string[]> {
    const user = await this.requireUser(userId);
    if (user.twoFactorEnabledAt) {
      throw new ApiError(HttpStatus.CONFLICT, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already on');
    }
    if (!user.totpPendingSecret) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'TOTP_SETUP_REQUIRED', 'Start authenticator setup first');
    }
    this.assertNotLocked(user);
    const secret = decryptSecret(this.config.twoFactorEncryptionKey, user.totpPendingSecret);
    const step = verifyTotp(secret, code.trim());
    if (step === null) {
      await this.recordFailure(user);
      throw invalidCode();
    }
    const codes = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UserEntity).update(
        { id: userId },
        {
          totpSecret: user.totpPendingSecret,
          totpPendingSecret: null,
          totpLastStep: String(step),
          twoFactorEnabledAt: new Date(),
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: null,
        },
      );
      return this.replaceRecoveryCodes(manager, userId);
    });
    this.auth.deliver(templates.twoFactorEnabled(user.email, user.name));
    return codes;
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.requireEnabledUser(userId);
    if (!(await this.auth.verifyPassword(user, password))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_PASSWORD', 'Password is incorrect');
    }
    await this.verifySecondFactor(user, looksLikeRecoveryCode(code) ? 'recovery' : 'totp', code);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UserEntity).update(
        { id: userId },
        { totpSecret: null, totpPendingSecret: null, totpLastStep: null, twoFactorEnabledAt: null, twoFactorFailedAttempts: 0, twoFactorLockedUntil: null },
      );
      await manager.getRepository(RecoveryCodeEntity).delete({ userId });
      await manager.getRepository(AuthTokenEntity).update({ userId, purpose: 'email_otp', consumedAt: IsNull() }, { consumedAt: new Date() });
    });
    this.auth.deliver(templates.twoFactorDisabled(user.email, user.name));
  }

  async regenerateRecoveryCodes(userId: string, code: string): Promise<string[]> {
    const user = await this.requireEnabledUser(userId);
    await this.verifySecondFactor(user, looksLikeRecoveryCode(code) ? 'recovery' : 'totp', code);
    return this.dataSource.transaction((manager) => this.replaceRecoveryCodes(manager, userId));
  }

  /** Emails a 6-digit sign-in code for a pending login challenge. */
  async sendEmailCode(challengeToken: string): Promise<void> {
    const user = await this.requireEnabledUser(await this.auth.verifyChallenge(challengeToken));
    this.assertNotLocked(user);
    const code = numericCode();
    await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(AuthTokenEntity);
      await tokens.update({ userId: user.id, purpose: 'email_otp', consumedAt: IsNull() }, { consumedAt: new Date() });
      await tokens.save(
        tokens.create({ userId: user.id, purpose: 'email_otp', tokenHash: this.hashEmailCode(user.id, code), expiresAt: new Date(Date.now() + EMAIL_OTP_TTL_MS) }),
      );
    });
    this.auth.deliver(templates.emailOtp(user.email, user.name, code));
  }

  /** Second step of login. */
  async verifyChallenge(challengeToken: string, method: TwoFactorMethod, code: string): Promise<TokenResponseDto> {
    const user = await this.requireEnabledUser(await this.auth.verifyChallenge(challengeToken));
    await this.verifySecondFactor(user, method, code);
    return this.auth.completeLogin(user);
  }

  /** Checks a code for any method, with lockout after repeated failures. */
  private async verifySecondFactor(user: UserEntity, method: TwoFactorMethod, rawCode: string): Promise<void> {
    this.assertNotLocked(user);
    const code = rawCode.trim();
    let ok = false;
    if (method === 'totp') ok = await this.consumeTotp(user, code);
    else if (method === 'recovery') ok = await this.consumeRecoveryCode(user.id, code);
    else ok = await this.consumeEmailCode(user.id, code);

    if (!ok) {
      await this.recordFailure(user);
      throw invalidCode();
    }
    if (user.twoFactorFailedAttempts > 0 || user.twoFactorLockedUntil) {
      await this.users().update({ id: user.id }, { twoFactorFailedAttempts: 0, twoFactorLockedUntil: null });
    }
  }

  private async consumeTotp(user: UserEntity, code: string): Promise<boolean> {
    if (!user.totpSecret) return false;
    const secret = decryptSecret(this.config.twoFactorEncryptionKey, user.totpSecret);
    const lastStep = user.totpLastStep === null ? null : Number(user.totpLastStep);
    const step = verifyTotp(secret, code, { lastStep });
    if (step === null) return false;
    // Conditional update: two concurrent requests can't both use the same code.
    const result = await this.users()
      .createQueryBuilder()
      .update()
      .set({ totpLastStep: String(step) })
      .where('id = :id AND (totp_last_step IS NULL OR totp_last_step < :step)', { id: user.id, step })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const result = await this.dataSource
      .getRepository(RecoveryCodeEntity)
      .update({ userId, codeHash: hashRecoveryCode(code), usedAt: IsNull() }, { usedAt: new Date() });
    return (result.affected ?? 0) > 0;
  }

  private async consumeEmailCode(userId: string, code: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(AuthTokenEntity);
      const row = await tokens.findOne({
        where: { userId, purpose: 'email_otp', consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
        order: { createdAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || !isTokenUsable(row)) return false;
      if (/^\d{6}$/.test(code) && safeEqualHex(row.tokenHash, this.hashEmailCode(userId, code))) {
        await tokens.update({ id: row.id }, { consumedAt: new Date() });
        return true;
      }
      const attempts = row.attempts + 1;
      await tokens.update({ id: row.id }, { attempts, consumedAt: attempts >= EMAIL_OTP_MAX_ATTEMPTS ? new Date() : null });
      return false;
    });
  }

  private async replaceRecoveryCodes(manager: EntityManager, userId: string): Promise<string[]> {
    const repo = manager.getRepository(RecoveryCodeEntity);
    await repo.delete({ userId });
    const codes = generateRecoveryCodes();
    await repo.save(codes.map((code) => repo.create({ userId, codeHash: hashRecoveryCode(code), usedAt: null })));
    return codes;
  }

  private assertNotLocked(user: UserEntity) {
    if (user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > Date.now()) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'TWO_FACTOR_LOCKED', 'Too many incorrect codes. Try again in a few minutes.', {
        retryAt: user.twoFactorLockedUntil.toISOString(),
      });
    }
  }

  private async recordFailure(user: UserEntity) {
    const expiredLock = user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() <= Date.now();
    const failures = (expiredLock ? 0 : user.twoFactorFailedAttempts) + 1;
    const locked = failures >= MAX_TWO_FACTOR_FAILURES;
    await this.users().update(
      { id: user.id },
      { twoFactorFailedAttempts: locked ? 0 : failures, twoFactorLockedUntil: locked ? new Date(Date.now() + TWO_FACTOR_LOCK_MS) : expiredLock ? null : user.twoFactorLockedUntil },
    );
  }

  private hashEmailCode(userId: string, code: string): string {
    return hmacHex(this.config.jwtSecret, `email-otp:${userId}:${code}`);
  }

  private users() {
    return this.dataSource.getRepository(UserEntity);
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.users().findOneBy({ id: userId });
    if (!user) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'User no longer exists');
    return user;
  }

  private async requireEnabledUser(userId: string): Promise<UserEntity> {
    const user = await this.requireUser(userId);
    if (!user.twoFactorEnabledAt) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'TWO_FACTOR_NOT_ENABLED', 'Two-factor authentication is not on');
    }
    return user;
  }
}

function invalidCode() {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TWO_FACTOR_CODE', 'That code is incorrect or has expired');
}

function looksLikeRecoveryCode(code: string): boolean {
  return !/^\s*\d{6}\s*$/.test(code);
}
