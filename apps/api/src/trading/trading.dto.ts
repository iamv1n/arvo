import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATE_PATTERN, MONEY_PATTERN } from '../common/validation';

export const TRADE_SEGMENTS = [
  'EQUITY_DELIVERY',
  'EQUITY_INTRADAY',
  'EQUITY_FUTURES',
  'EQUITY_OPTIONS',
  'INDEX_FUTURES',
  'INDEX_OPTIONS',
  'CURRENCY_FUTURES',
  'CURRENCY_OPTIONS',
  'COMMODITY_FUTURES',
  'COMMODITY_OPTIONS',
] as const;

export const TRADE_EXCHANGES = ['NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'BCD', 'MCX'] as const;
export const TRADE_SIDES = ['BUY', 'SELL'] as const;
export const TRADE_IMPORT_SOURCES = ['TRADEBOOK_CSV', 'PNL_CSV', 'CONTRACT_NOTE_PDF'] as const;

/** Whole units only: Indian exchanges do not fill fractions. */
const QUANTITY_PATTERN = /^\d{1,15}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const FY_PATTERN = /^\d{4}-\d{2}$/;
const POSITIVE_MONEY = /^\d{1,15}(\.\d{1,4})?$/;

const nullable = () => ValidateIf((_o: unknown, value: unknown) => value !== null);

export class TradeFilterDto {
  @ApiPropertyOptional({ example: '2025-04-01' }) @IsOptional() @Matches(DATE_PATTERN) from?: string;
  @ApiPropertyOptional({ example: '2026-03-31' }) @IsOptional() @Matches(DATE_PATTERN) to?: string;
  @ApiPropertyOptional({ enum: TRADE_SEGMENTS }) @IsOptional() @IsIn(TRADE_SEGMENTS as unknown as string[]) segment?: (typeof TRADE_SEGMENTS)[number];
  @ApiPropertyOptional({ example: 'NIFTY' }) @IsOptional() @IsString() @Length(1, 64) underlying?: string;
  @ApiPropertyOptional({ example: 'NIFTY25JUN24500CE' }) @IsOptional() @IsString() @Length(1, 64) symbol?: string;
  @ApiPropertyOptional({ enum: TRADE_SIDES }) @IsOptional() @IsIn(TRADE_SIDES as unknown as string[]) side?: (typeof TRADE_SIDES)[number];
  @ApiPropertyOptional({ example: 'Zerodha' }) @IsOptional() @IsString() @Length(1, 60) broker?: string;
}

export class AsOfFilterDto extends TradeFilterDto {
  @ApiPropertyOptional({ example: '2026-09-19', description: 'Every figure is computed for this date' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  asOf?: string;
}

export class ChargesDto {
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) brokerage?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) stt?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) exchangeCharges?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) sebiCharges?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) stampDuty?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) gst?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) dpCharges?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(POSITIVE_MONEY) otherCharges?: string;
  @ApiPropertyOptional({ description: 'The contract note total; anything unexplained lands in "other"' })
  @IsOptional()
  @Matches(POSITIVE_MONEY)
  total?: string;
}

export class CreateTradeDto {
  @ApiProperty({ example: '2025-06-02' }) @Matches(DATE_PATTERN) date!: string;
  @ApiPropertyOptional({ example: '09:20:31' }) @IsOptional() @nullable() @Matches(TIME_PATTERN) time?: string | null;
  @ApiPropertyOptional({ example: 'Zerodha' }) @IsOptional() @IsString() @Length(1, 60) broker?: string;
  @ApiPropertyOptional({ enum: TRADE_EXCHANGES }) @IsOptional() @IsIn(TRADE_EXCHANGES as unknown as string[]) exchange?: (typeof TRADE_EXCHANGES)[number];
  @ApiPropertyOptional({ enum: TRADE_SEGMENTS, description: 'Derived from the symbol when it is left out' })
  @IsOptional()
  @IsIn(TRADE_SEGMENTS as unknown as string[])
  segment?: (typeof TRADE_SEGMENTS)[number];
  @ApiProperty({ example: 'NIFTY25JUN24500CE' }) @IsString() @Length(1, 64) symbol!: string;
  @ApiPropertyOptional({ example: 'INE009A01021' }) @IsOptional() @nullable() @IsString() @Length(1, 12) isin?: string | null;
  @ApiProperty({ enum: TRADE_SIDES }) @IsIn(TRADE_SIDES as unknown as string[]) side!: (typeof TRADE_SIDES)[number];
  @ApiProperty({ example: '75', description: 'Whole units: shares, or contracts × lot size' }) @Matches(QUANTITY_PATTERN) quantity!: string;
  @ApiProperty({ example: '120.25' }) @Matches(POSITIVE_MONEY) price!: string;
  @ApiPropertyOptional({ example: 25 }) @IsOptional() @IsInt() @Min(1) @Max(100_000) lotSize?: number;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsString() @Length(1, 64) orderId?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsString() @Length(1, 500) notes?: string | null;
  @ApiPropertyOptional({ type: ChargesDto, description: 'What the contract note said; the rest is estimated' })
  @IsOptional()
  @nullable()
  @ValidateNested()
  @Type(() => ChargesDto)
  charges?: ChargesDto | null;
}

export class UploadTradeImportDto {
  @ApiPropertyOptional({ enum: TRADE_IMPORT_SOURCES })
  @IsOptional()
  @IsIn(TRADE_IMPORT_SOURCES as unknown as string[])
  source?: (typeof TRADE_IMPORT_SOURCES)[number];
  @ApiPropertyOptional({ example: 'Zerodha', description: 'Overrides the broker guessed from the layout' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  broker?: string;
}

export class ImportRowDecisionDto {
  @ApiProperty({ description: 'false skips the row; true puts a skipped row back in' }) @IsBoolean() include!: boolean;
}

export class JournalEntryDto {
  @ApiPropertyOptional() @IsOptional() @nullable() @IsString() @Length(1, 4000) notes?: string | null;
  @ApiPropertyOptional({ type: [String], example: ['Breakout'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  setupTags?: string[];
  @ApiPropertyOptional({ type: [String], example: ['Calm'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  emotionTags?: string[];
  @ApiPropertyOptional({ type: [String], example: ['No stop at all'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  mistakes?: string[];
  @ApiPropertyOptional({ example: '24300', description: 'Used for the R-multiple' })
  @IsOptional()
  @nullable()
  @Matches(MONEY_PATTERN)
  stopPrice?: string | null;
  @ApiPropertyOptional({ example: '24800' }) @IsOptional() @nullable() @Matches(MONEY_PATTERN) targetPrice?: string | null;
}

export class TaxQueryDto {
  @ApiPropertyOptional({ example: '2025-26', description: 'Indian financial year, April to March' })
  @IsOptional()
  @Matches(FY_PATTERN)
  fy?: string;
  @ApiPropertyOptional({ example: '2026-09-19' }) @IsOptional() @Matches(DATE_PATTERN) asOf?: string;
}

export class AsOfQueryDto {
  @ApiPropertyOptional({ example: '2026-09-19' }) @IsOptional() @Matches(DATE_PATTERN) asOf?: string;
}

export class BrokeragePlanDto {
  @ApiProperty({ example: '0.03' }) @Matches(POSITIVE_MONEY) percent!: string;
  @ApiProperty({ example: '20', nullable: true, description: 'null for an uncapped plan' })
  @nullable()
  @Matches(POSITIVE_MONEY)
  cap!: string | null;
  @ApiProperty({ example: '0' }) @Matches(POSITIVE_MONEY) flat!: string;
}

export class BrokerConfigDto {
  @ApiProperty({ example: 'Zerodha' }) @IsString() @Length(1, 60) broker!: string;
  @ApiProperty({ description: 'Brokerage plan per segment; anything missing uses the discount default' })
  @ValidateNested()
  @Type(() => Object)
  plans!: Partial<Record<(typeof TRADE_SEGMENTS)[number], BrokeragePlanDto>>;
  @ApiProperty({ example: '13', description: 'Per scrip per day on delivery sells, before GST' })
  @Matches(POSITIVE_MONEY)
  dpChargePerScrip!: string;
  @ApiProperty({ example: '300' }) @Matches(POSITIVE_MONEY) annualMaintenance!: string;
}

export class TradingSettingsDto {
  @ApiPropertyOptional({ type: [BrokerConfigDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BrokerConfigDto)
  brokers?: BrokerConfigDto[];
  @ApiPropertyOptional({ example: 15 }) @IsOptional() @IsInt() @Min(1) @Max(720) revengeWindowMinutes?: number;
  @ApiPropertyOptional({ example: '2' }) @IsOptional() @Matches(POSITIVE_MONEY) overTradingMultiple?: string;
  @ApiPropertyOptional({ example: '12' }) @IsOptional() @Matches(POSITIVE_MONEY) assumedIndexReturnPercent?: string;
  @ApiPropertyOptional({ example: '7' }) @IsOptional() @Matches(POSITIVE_MONEY) assumedFdRatePercent?: string;
  @ApiPropertyOptional({ example: 'NIFTY 50 TRI' }) @IsOptional() @nullable() @IsString() @Length(1, 80) benchmarkSeries?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  setupTags?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  emotionTags?: string[];
}
