import { AuthTokenEntity, RefreshTokenEntity, UserEntity } from '@arvo/database';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { templates } from '../mail/templates';
import { AuthService, hashPassword } from './auth.service';
import type { TokenResponseDto } from './dto/auth.dto';
import { generateToken, hashToken, isTokenUsable } from './security';

export const PASSWORD_RESET_TTL_MS = 3_600_000;

/** Email verification, password reset and password change. */
@Injectable()
export class AccountSecurityService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async verifyEmail(token: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(AuthTokenEntity);
      const row = await tokens.findOne({
        where: { tokenHash: hashToken(token), purpose: 'email_verification' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || !isTokenUsable(row)) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TOKEN', 'This verification link is invalid or has expired');
      }
      const now = new Date();
      await tokens.update({ userId: row.userId, purpose: 'email_verification', consumedAt: IsNull() }, { consumedAt: now });
      await manager.getRepository(UserEntity).update({ id: row.userId, emailVerifiedAt: IsNull() }, { emailVerifiedAt: now });
    });
  }

  /** Returns false when the address is already verified. */
  async resendVerification(userId: string): Promise<boolean> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId });
    if (!user) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'User no longer exists');
    if (user.emailVerifiedAt) return false;
    await this.auth.sendVerificationEmail(user);
    return true;
  }

  /** Always succeeds from the caller's point of view so accounts can't be enumerated. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ email: email.trim().toLowerCase() });
    if (!user) return;
    const token = generateToken();
    await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(AuthTokenEntity);
      await tokens.update({ userId: user.id, purpose: 'password_reset', consumedAt: IsNull() }, { consumedAt: new Date() });
      await tokens.save(
        tokens.create({ userId: user.id, purpose: 'password_reset', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) }),
      );
    });
    this.auth.deliver(templates.passwordReset(user.email, user.name, `${this.config.publicWebUrl}/reset-password?token=${encodeURIComponent(token)}`));
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(AuthTokenEntity);
      const row = await tokens.findOne({ where: { tokenHash: hashToken(token), purpose: 'password_reset' }, lock: { mode: 'pessimistic_write' } });
      if (!row || !isTokenUsable(row)) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TOKEN', 'This reset link is invalid or has expired');
      }
      const users = manager.getRepository(UserEntity);
      const found = await users.findOneByOrFail({ id: row.userId });
      await tokens.update({ userId: row.userId, purpose: 'password_reset', consumedAt: IsNull() }, { consumedAt: new Date() });
      // Receiving the link proves control of the inbox.
      await users.update({ id: found.id }, { passwordHash: await hashPassword(password), emailVerifiedAt: found.emailVerifiedAt ?? new Date() });
      await this.auth.revokeAllSessions(found.id, manager);
      return found;
    });
    this.auth.deliver(templates.passwordChanged(user.email, user.name, `${this.config.publicWebUrl}/settings?tab=account`));
  }

  /** Changes the password, signs out every other session and returns fresh tokens for this one. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<TokenResponseDto> {
    const users = this.dataSource.getRepository(UserEntity);
    const user = await users.findOneBy({ id: userId });
    if (!user) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'User no longer exists');
    if (!(await this.auth.verifyPassword(user, currentPassword))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_PASSWORD', 'Current password is incorrect');
    }
    const passwordHash = await hashPassword(newPassword);
    const tokens = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UserEntity).update({ id: userId }, { passwordHash });
      await this.auth.revokeAllSessions(userId, manager);
      await manager.getRepository(AuthTokenEntity).update({ userId, purpose: 'password_reset', consumedAt: IsNull() }, { consumedAt: new Date() });
      return this.auth.issueTokens(userId, manager.getRepository(RefreshTokenEntity));
    });
    this.auth.deliver(templates.passwordChanged(user.email, user.name, `${this.config.publicWebUrl}/settings?tab=account`));
    return tokens;
  }
}

