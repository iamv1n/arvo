import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public, UserId } from '../common/auth.decorators';
import { AccountSecurityService } from './account-security.service';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { setRefreshCookie } from './auth.controller';
import {
  ChallengeDto,
  ChangePasswordDto,
  CodeDto,
  DisableTwoFactorDto,
  EmailDto,
  OkDto,
  RecoveryCodesDto,
  ResetPasswordDto,
  TokenDto,
  TokenResponseDto,
  TotpSetupDto,
  TwoFactorStatusDto,
  VerifyTwoFactorDto,
} from './dto/auth.dto';
import { TwoFactorService } from './two-factor.service';

const STRICT = { default: { limit: 5, ttl: 60_000 } };
const MODERATE = { default: { limit: 10, ttl: 60_000 } };

/** Email verification, password recovery and two-factor authentication. */
@ApiTags('auth')
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class SecurityController {
  constructor(
    @Inject(AccountSecurityService) private readonly account: AccountSecurityService,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle(MODERATE)
  @ApiOkResponse({ type: OkDto })
  async verifyEmail(@Body() dto: TokenDto): Promise<OkDto> {
    await this.account.verifyEmail(dto.token);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiOperation({ summary: 'Sends a new verification link; sent is false when already verified' })
  async resendVerification(@UserId() userId: string): Promise<{ sent: boolean }> {
    return { sent: await this.account.resendVerification(userId) };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOperation({ summary: 'Emails a reset link if the account exists. Always returns 200.' })
  @ApiOkResponse({ type: OkDto })
  async forgotPassword(@Body() dto: EmailDto): Promise<OkDto> {
    await this.account.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOkResponse({ type: OkDto })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<OkDto> {
    await this.account.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOperation({ summary: 'Changes the password, signs out other sessions and returns new tokens' })
  @ApiOkResponse({ type: TokenResponseDto })
  async changePassword(@UserId() userId: string, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    return setRefreshCookie(res, await this.account.changePassword(userId, dto.currentPassword, dto.newPassword), this.config);
  }

  @ApiBearerAuth()
  @Get('2fa')
  @ApiOkResponse({ type: TwoFactorStatusDto })
  status(@UserId() userId: string): Promise<TwoFactorStatusDto> {
    return this.twoFactor.status(userId);
  }

  @ApiBearerAuth()
  @Post('2fa/totp/setup')
  @HttpCode(HttpStatus.OK)
  @Throttle(MODERATE)
  @ApiOkResponse({ type: TotpSetupDto })
  setupTotp(@UserId() userId: string): Promise<TotpSetupDto> {
    return this.twoFactor.setupTotp(userId);
  }

  @ApiBearerAuth()
  @Post('2fa/totp/enable')
  @HttpCode(HttpStatus.OK)
  @Throttle(MODERATE)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async enableTotp(@UserId() userId: string, @Body() dto: CodeDto): Promise<RecoveryCodesDto> {
    return { recoveryCodes: await this.twoFactor.enableTotp(userId, dto.code) };
  }

  @ApiBearerAuth()
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOkResponse({ type: OkDto })
  async disable(@UserId() userId: string, @Body() dto: DisableTwoFactorDto): Promise<OkDto> {
    await this.twoFactor.disable(userId, dto.password, dto.code);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Post('2fa/recovery-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async regenerate(@UserId() userId: string, @Body() dto: CodeDto): Promise<RecoveryCodesDto> {
    return { recoveryCodes: await this.twoFactor.regenerateRecoveryCodes(userId, dto.code) };
  }

  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(MODERATE)
  @ApiOperation({ summary: 'Completes a two-step login' })
  @ApiOkResponse({ type: TokenResponseDto })
  async verify(@Body() dto: VerifyTwoFactorDto, @Res({ passthrough: true }) res: Response) {
    return setRefreshCookie(res, await this.twoFactor.verifyChallenge(dto.challengeToken, dto.method, dto.code), this.config);
  }

  @Public()
  @Post('2fa/email/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiOkResponse({ type: OkDto })
  async sendEmailCode(@Body() dto: ChallengeDto): Promise<OkDto> {
    await this.twoFactor.sendEmailCode(dto.challengeToken);
    return { ok: true };
  }
}
