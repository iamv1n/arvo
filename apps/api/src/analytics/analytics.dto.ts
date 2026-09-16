import { AccountType } from '@arvo/types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_PATTERN } from '../common/validation';

export class PeriodQueryDto {
  @ApiProperty({ example: '2026-08-01' }) @Matches(DATE_PATTERN) from!: string;
  @ApiProperty({ example: '2026-08-31' }) @Matches(DATE_PATTERN) to!: string;
  @ApiPropertyOptional({ example: 'INR', description: 'Defaults to your base currency' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
}

export class CurrencyQueryDto {
  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

class CategorySpendDto {
  @ApiProperty({ type: String, nullable: true }) categoryId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) parentName!: string | null;
  @ApiProperty({ example: '3049.50' }) amount!: string;
  @ApiProperty() transactionCount!: number;
}

class UnclassifiedDto {
  @ApiProperty() inflow!: string;
  @ApiProperty() outflow!: string;
  @ApiProperty() transactionCount!: number;
}

export class PeriodSummaryDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() income!: string;
  @ApiProperty() expenses!: string;
  @ApiProperty() netCashflow!: string;
  @ApiProperty({ type: Number, nullable: true }) savingsRate!: number | null;
  @ApiProperty() transfersVolume!: string;
  @ApiProperty({ type: UnclassifiedDto }) unclassified!: UnclassifiedDto;
  @ApiProperty({ type: [CategorySpendDto] }) spendingByCategory!: CategorySpendDto[];
  @ApiProperty({ type: [CategorySpendDto] }) spendingByTopCategory!: CategorySpendDto[];
  @ApiProperty() transactionCount!: number;
}

class MonthlyPointDto {
  @ApiProperty({ example: '2026-08' }) month!: string;
  @ApiProperty() income!: string;
  @ApiProperty() expenses!: string;
  @ApiProperty() netCashflow!: string;
}

export class MonthlySeriesDto {
  @ApiProperty({ type: [MonthlyPointDto] }) items!: MonthlyPointDto[];
}

class NetWorthAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: AccountType, enumName: 'AccountType' }) type!: AccountType;
  @ApiProperty({ enum: ['ASSET', 'LIABILITY'] }) kind!: 'ASSET' | 'LIABILITY';
  @ApiProperty() balance!: string;
}

export class NetWorthDto {
  @ApiProperty() currency!: string;
  @ApiProperty() assets!: string;
  @ApiProperty({ description: 'Amount owed, positive' }) liabilities!: string;
  @ApiProperty() netWorth!: string;
  @ApiProperty({ type: [NetWorthAccountDto] }) accounts!: NetWorthAccountDto[];
  @ApiProperty() excludedAccountCount!: number;
}

export class ComparePeriodsQueryDto {
  @ApiProperty({ example: '2026-08-01' }) @Matches(DATE_PATTERN) from!: string;
  @ApiProperty({ example: '2026-08-31' }) @Matches(DATE_PATTERN) to!: string;
  @ApiProperty({ example: '2026-07-01' }) @Matches(DATE_PATTERN) previousFrom!: string;
  @ApiProperty({ example: '2026-07-31' }) @Matches(DATE_PATTERN) previousTo!: string;
  @ApiPropertyOptional({ example: 'INR' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
}

export class MonthQueryDto {
  @ApiProperty({ example: '2026-08' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
  @ApiPropertyOptional({ example: 'INR' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
}

export class DismissRecurringDto {
  @ApiProperty() @IsBoolean() isDismissed!: boolean;
}
