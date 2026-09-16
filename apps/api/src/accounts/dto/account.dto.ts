import type { AccountWithBalance } from '@arvo/finance-core';
import { AccountType } from '@arvo/types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { MONEY_PATTERN } from '../../common/validation';

export class AccountDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: AccountType, enumName: 'AccountType' }) type!: AccountType;
  @ApiProperty({ type: String, nullable: true }) institution!: string | null;
  @ApiProperty({ example: 'INR' }) currency!: string;
  @ApiProperty({ example: '10000.00' }) openingBalance!: string;
  @ApiProperty({ example: '25430.50', description: 'Opening balance plus all transactions' }) balance!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(a: AccountWithBalance): AccountDto {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      currency: a.currency,
      openingBalance: a.openingBalance,
      balance: a.balance,
      isActive: a.isActive,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}

export class AccountListDto {
  @ApiProperty({ type: [AccountDto] }) items!: AccountDto[];
}

export class CreateAccountDto {
  @ApiProperty({ example: 'HDFC Savings' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ enum: AccountType, enumName: 'AccountType' })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @ApiPropertyOptional({ example: 'INR', description: 'Defaults to your base currency' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: '10000.00', description: 'Negative for amounts owed (credit cards, loans)' })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  openingBalance?: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ enum: AccountType, enumName: 'AccountType' })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  institution?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY_PATTERN)
  openingBalance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
