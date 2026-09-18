import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATE_PATTERN, MONEY_PATTERN } from '../common/validation';

export const INSTRUMENT_KINDS = [
  'EQUITY',
  'MUTUAL_FUND',
  'ETF',
  'NPS',
  'EPF',
  'PPF',
  'FD',
  'RD',
  'SGB',
  'GOLD',
  'BOND',
  'CASH',
  'REAL_ESTATE',
  'OTHER',
] as const;
export const ASSET_CLASSES = ['EQUITY', 'DEBT', 'GOLD', 'REAL_ESTATE', 'CASH', 'OTHER'] as const;
export const HOLDING_TRANSACTION_TYPES = [
  'BUY',
  'SIP',
  'SWITCH_IN',
  'CONTRIBUTION',
  'BONUS',
  'SELL',
  'SWITCH_OUT',
  'WITHDRAWAL',
  'MATURITY',
  'DIVIDEND',
  'INTEREST',
  'VALUE_UPDATE',
] as const;

/** Positive decimal with up to 5 fraction digits, matching the units scale. */
export const UNITS_PATTERN = /^\d{1,18}(\.\d{1,5})?$/;
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;

const nullableString = () => ValidateIf((_o: unknown, value: unknown) => value !== null);

export class CreateHoldingDto {
  @ApiProperty({ example: 'Parag Parikh Flexi Cap Direct Growth' }) @IsString() @Length(1, 160) name!: string;
  @ApiProperty({ enum: INSTRUMENT_KINDS }) @IsIn(INSTRUMENT_KINDS as unknown as string[]) kind!: (typeof INSTRUMENT_KINDS)[number];
  @ApiPropertyOptional({ enum: ASSET_CLASSES }) @IsOptional() @IsIn(ASSET_CLASSES as unknown as string[]) assetClass?: (typeof ASSET_CLASSES)[number];
  @ApiPropertyOptional({ example: 'INR' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional({ example: 'INF879O01027' }) @IsOptional() @nullableString() @IsString() @Length(1, 12) isin?: string | null;
  @ApiPropertyOptional({ example: '122639' }) @IsOptional() @nullableString() @IsString() @Length(1, 24) schemeCode?: string | null;
  @ApiPropertyOptional({ example: 'INFY' }) @IsOptional() @nullableString() @IsString() @Length(1, 32) symbol?: string | null;
  @ApiPropertyOptional({ example: '12345678 / 90' }) @IsOptional() @nullableString() @IsString() @Length(1, 64) folio?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullableString() @IsString() @Length(1, 120) amc?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullableString() @IsString() @Length(1, 80) sector?: string | null;
  @ApiPropertyOptional({ enum: ['LARGE', 'MID', 'SMALL'] }) @IsOptional() @nullableString() @IsIn(['LARGE', 'MID', 'SMALL']) marketCap?: 'LARGE' | 'MID' | 'SMALL' | null;
  @ApiPropertyOptional({ enum: ['DIRECT', 'REGULAR'] }) @IsOptional() @nullableString() @IsIn(['DIRECT', 'REGULAR']) plan?: 'DIRECT' | 'REGULAR' | null;
  @ApiPropertyOptional({ example: '0.63' }) @IsOptional() @nullableString() @Matches(PERCENT_PATTERN) expenseRatio?: string | null;
  @ApiPropertyOptional({ example: '0.35' }) @IsOptional() @nullableString() @Matches(PERCENT_PATTERN) directExpenseRatio?: string | null;
  @ApiPropertyOptional({ example: 365 }) @IsOptional() @nullableString() @IsInt() @Min(0) @Max(3660) exitLoadDays?: number | null;
  @ApiPropertyOptional({ example: '1' }) @IsOptional() @nullableString() @Matches(PERCENT_PATTERN) exitLoadPercent?: string | null;
  @ApiPropertyOptional({ example: 36, description: 'ELSS is 36' }) @IsOptional() @nullableString() @IsInt() @Min(0) @Max(600) lockInMonths?: number | null;
  @ApiPropertyOptional({ example: '89.4512' }) @IsOptional() @nullableString() @Matches(MONEY_PATTERN) latestPrice?: string | null;
  @ApiPropertyOptional({ example: '2026-09-18' }) @IsOptional() @nullableString() @Matches(DATE_PATTERN) latestPriceDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullableString() @IsUUID() goalId?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullableString() @IsString() @Length(1, 1000) notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateHoldingDto extends CreateHoldingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) declare name: string;
  @ApiPropertyOptional({ enum: INSTRUMENT_KINDS })
  @IsOptional()
  @IsIn(INSTRUMENT_KINDS as unknown as string[])
  declare kind: (typeof INSTRUMENT_KINDS)[number];
}

export class CreateHoldingTransactionDto {
  @ApiProperty({ example: '2026-04-15' }) @Matches(DATE_PATTERN) date!: string;
  @ApiProperty({ enum: HOLDING_TRANSACTION_TYPES })
  @IsIn(HOLDING_TRANSACTION_TYPES as unknown as string[])
  type!: (typeof HOLDING_TRANSACTION_TYPES)[number];
  @ApiPropertyOptional({ example: '1043.514' }) @IsOptional() @nullableString() @Matches(UNITS_PATTERN) units?: string | null;
  @ApiPropertyOptional({ example: '47.9127' }) @IsOptional() @nullableString() @Matches(MONEY_PATTERN) price?: string | null;
  @ApiPropertyOptional({ example: '50000', description: 'Derived from units × price when omitted' })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  amount?: string;
  @ApiPropertyOptional({ example: '12.50' }) @IsOptional() @Matches(MONEY_PATTERN) charges?: string;
  @ApiPropertyOptional() @IsOptional() @nullableString() @IsString() @Length(1, 300) note?: string | null;
}

export class UpdateHoldingTransactionDto extends CreateHoldingTransactionDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_PATTERN) declare date: string;
  @ApiPropertyOptional({ enum: HOLDING_TRANSACTION_TYPES })
  @IsOptional()
  @IsIn(HOLDING_TRANSACTION_TYPES as unknown as string[])
  declare type: (typeof HOLDING_TRANSACTION_TYPES)[number];
}

export class SetPriceDto {
  @ApiProperty({ example: '89.4512' }) @Matches(MONEY_PATTERN) price!: string;
  @ApiProperty({ example: '2026-09-18' }) @Matches(DATE_PATTERN) date!: string;
}

export class AsOfQueryDto {
  @ApiPropertyOptional({ example: '2026-09-19', description: 'Defaults to today' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  asOf?: string;
}

export class ReturnsQueryDto extends AsOfQueryDto {
  @ApiPropertyOptional({ example: 'NIFTY 50 TRI' }) @IsOptional() @IsString() @Length(1, 80) benchmark?: string;
}

export class CapitalGainsQueryDto extends AsOfQueryDto {
  @ApiPropertyOptional({ example: '2026-27' }) @IsOptional() @Matches(/^\d{4}-\d{2}$/) financialYear?: string;
  @ApiPropertyOptional({ example: '125000', description: 'Section 112A exemption for the year' })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  ltcgExemption?: string;
}

export class RebalanceTargetDto {
  @ApiProperty({ enum: ASSET_CLASSES }) @IsIn(ASSET_CLASSES as unknown as string[]) assetClass!: (typeof ASSET_CLASSES)[number];
  @ApiProperty({ example: '60' }) @Matches(PERCENT_PATTERN) percent!: string;
}

export class RebalanceDto {
  @ApiProperty({ type: [RebalanceTargetDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => RebalanceTargetDto)
  targets!: RebalanceTargetDto[];

  @ApiPropertyOptional({ example: 2, description: 'Classes within this many points of target are left alone' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  driftBandPercent?: number;

  @ApiPropertyOptional({ example: '2026-09-19' }) @IsOptional() @Matches(DATE_PATTERN) asOf?: string;
}

export class GoalProjectionDto extends AsOfQueryDto {
  @ApiPropertyOptional({ type: Object, description: 'Planned monthly contribution per goal id' })
  @IsOptional()
  @IsObject()
  monthlyContributions?: Record<string, string>;
}

export class UploadPortfolioImportDto {
  @ApiPropertyOptional({ enum: ['CAS_PDF', 'BROKER_CSV', 'AMFI_NAV', 'BENCHMARK_CSV', 'FUND_DISCLOSURE_CSV'] })
  @IsOptional()
  @IsIn(['CAS_PDF', 'BROKER_CSV', 'AMFI_NAV', 'BENCHMARK_CSV', 'FUND_DISCLOSURE_CSV'])
  source?: 'CAS_PDF' | 'BROKER_CSV' | 'AMFI_NAV' | 'BENCHMARK_CSV' | 'FUND_DISCLOSURE_CSV';

  @ApiPropertyOptional({ description: 'Required for a fund portfolio disclosure' }) @IsOptional() @IsUUID() holdingId?: string;
  @ApiPropertyOptional({ description: 'Overrides the index name for a benchmark file' }) @IsOptional() @IsString() @Length(1, 80) series?: string;
}

export class ImportRowDecisionDto {
  @ApiProperty({ enum: ['NEW', 'SKIPPED'] }) @IsIn(['NEW', 'SKIPPED']) status!: 'NEW' | 'SKIPPED';
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @nullableString() @IsUUID() holdingId?: string | null;
}
