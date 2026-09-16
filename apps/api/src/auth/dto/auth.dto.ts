import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

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
