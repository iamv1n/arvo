import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'asha@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 256 })
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  password!: string;

  @ApiProperty({ example: 'Asha' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'INR', description: 'Base currency (ISO 4217)' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', description: 'IANA timezone' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Refresh token. Browsers can rely on the httpOnly cookie instead.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  refreshToken?: string;
}

export class TokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Seconds until the access token expires' })
  expiresIn!: number;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  refreshTokenExpiresAt!: string;
}

export type TwoFactorMethod = 'totp' | 'email' | 'recovery';

export class TwoFactorChallengeDto {
  @ApiProperty({ enum: [true] })
  twoFactorRequired!: true;

  @ApiProperty({ description: 'Short-lived token for POST /auth/2fa/verify' })
  challengeToken!: string;

  @ApiProperty({ enum: ['totp', 'email', 'recovery'], isArray: true })
  methods!: TwoFactorMethod[];

  @ApiProperty({ description: 'Seconds until the challenge expires' })
  expiresIn!: number;
}

export type LoginResponse = TokenResponseDto | TwoFactorChallengeDto;

export class OkDto {
  @ApiProperty()
  ok!: boolean;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @Length(10, 256)
  token!: string;
}

export class EmailDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 10, maxLength: 256 })
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty({ minLength: 10, maxLength: 256 })
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  newPassword!: string;
}

export class CodeDto {
  @ApiProperty({ description: 'Authenticator code, or a recovery code where accepted' })
  @IsString()
  @Length(6, 32)
  code!: string;
}

export class DisableTwoFactorDto extends CodeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class ChallengeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  challengeToken!: string;
}

export class VerifyTwoFactorDto extends ChallengeDto {
  @ApiProperty({ enum: ['totp', 'email', 'recovery'] })
  @IsIn(['totp', 'email', 'recovery'])
  method!: TwoFactorMethod;

  @ApiProperty()
  @IsString()
  @Length(6, 32)
  code!: string;
}

export class TotpSetupDto {
  @ApiProperty() otpauthUri!: string;
  @ApiProperty({ description: 'Base32 secret for manual entry' }) secret!: string;
  @ApiProperty({ description: 'QR code PNG as a data: URL' }) qrDataUrl!: string;
}

export class RecoveryCodesDto {
  @ApiProperty({ type: [String], description: 'Shown once' }) recoveryCodes!: string[];
}

export class TwoFactorStatusDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ nullable: true, type: Date }) enabledAt!: Date | null;
  @ApiProperty() recoveryCodesRemaining!: number;
}
