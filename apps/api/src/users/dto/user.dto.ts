import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'INR' }) currency!: string;
  @ApiProperty({ example: 'Asia/Kolkata' }) timezone!: string;
  @ApiProperty({ type: Date, nullable: true }) emailVerifiedAt!: Date | null;
  @ApiProperty() twoFactorEnabled!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
