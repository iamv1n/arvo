import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATE_PATTERN } from '../common/validation';
import { TRADE_EXCHANGES, TRADE_SEGMENTS } from '../trading/trading.dto';

/*
 * Request shapes for the Strategy Lab.
 *
 * Numbers arrive as decimal strings, like everywhere else in Arvo: a premium of 149.95 typed
 * into a form has to reach the engine as 149.95 and not as whatever JSON.parse made of it.
 *
 * The strategy rule tree is the one exception — it is validated by zod in strategy-schema.ts,
 * because a recursive tree in decorators is unreadable. Here it is just an object.
 */

const POSITIVE_MONEY = /^\d{1,15}(\.\d{1,4})?$/;
const SIGNED_MONEY = /^-?\d{1,15}(\.\d{1,4})?$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9&._-]{0,63}$/;

export const LEG_KINDS = ['CALL', 'PUT', 'FUTURE', 'UNDERLYING'] as const;
export const LEG_ACTIONS = ['BUY', 'SELL'] as const;
export const BAR_TIMEFRAMES = ['DAY', 'MINUTE'] as const;
export const TEMPLATE_IDS = [
  'LONG_STRADDLE',
  'SHORT_STRADDLE',
  'LONG_STRANGLE',
  'SHORT_STRANGLE',
  'IRON_CONDOR',
  'IRON_BUTTERFLY',
  'BULL_CALL_SPREAD',
  'BEAR_CALL_SPREAD',
  'BULL_PUT_SPREAD',
  'BEAR_PUT_SPREAD',
  'CALENDAR_CALL',
  'COVERED_CALL',
  'PROTECTIVE_PUT',
] as const;

const nullable = () => ValidateIf((_object: unknown, value: unknown) => value !== null && value !== undefined);

export class StrategyLegDto {
  @ApiProperty({ enum: LEG_KINDS }) @IsIn(LEG_KINDS as unknown as string[]) kind!: (typeof LEG_KINDS)[number];
  @ApiProperty({ enum: LEG_ACTIONS }) @IsIn(LEG_ACTIONS as unknown as string[]) action!: (typeof LEG_ACTIONS)[number];
  @ApiProperty({ example: 1, description: 'Whole lots' }) @IsInt() @Min(1) @Max(10_000) lots!: number;
  @ApiProperty({ example: 75 }) @IsInt() @Min(1) @Max(100_000) lotSize!: number;
  @ApiPropertyOptional({ example: '24000', description: 'Required for CALL and PUT' })
  @IsOptional()
  @nullable()
  @Matches(POSITIVE_MONEY)
  strike?: string | null;
  @ApiProperty({ example: '150.25', description: 'Premium per unit, or the entry price for a future or the underlying' })
  @Matches(POSITIVE_MONEY)
  premium!: string;
  @ApiPropertyOptional({ example: '2026-10-29' }) @IsOptional() @nullable() @Matches(DATE_PATTERN) expiry?: string | null;
  @ApiPropertyOptional({ example: '14', description: "This leg's own implied volatility; falls back to the market default" })
  @IsOptional()
  @nullable()
  @Matches(POSITIVE_MONEY)
  impliedVolatilityPercent?: string | null;
  @ApiPropertyOptional({ example: 'Short call' }) @IsOptional() @nullable() @IsString() @Length(1, 60) label?: string | null;
}

export class MarketAssumptionsDto {
  @ApiProperty({ example: '24000' }) @Matches(POSITIVE_MONEY) spot!: string;
  @ApiProperty({ example: '2026-09-19' }) @Matches(DATE_PATTERN) asOf!: string;
  @ApiPropertyOptional({ example: '6.5' }) @IsOptional() @Matches(POSITIVE_MONEY) riskFreeRatePercent?: string;
  @ApiPropertyOptional({ example: '0' }) @IsOptional() @Matches(POSITIVE_MONEY) dividendYieldPercent?: string;
  @ApiPropertyOptional({ example: '14' }) @IsOptional() @Matches(POSITIVE_MONEY) impliedVolatilityPercent?: string;
}

export class MarginOptionsDto {
  @ApiPropertyOptional({ example: '15', description: 'Percent of notional held against a naked short leg' })
  @IsOptional()
  @Matches(POSITIVE_MONEY)
  nakedPercentOfNotional?: string;
  @ApiPropertyOptional({ example: '3', description: 'Percent still held when a long leg defines the risk' })
  @IsOptional()
  @Matches(POSITIVE_MONEY)
  hedgedPercentOfNotional?: string;
}

export class PayoffDto {
  @ApiProperty({ type: [StrategyLegDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => StrategyLegDto)
  legs!: StrategyLegDto[];

  @ApiProperty({ type: MarketAssumptionsDto }) @ValidateNested() @Type(() => MarketAssumptionsDto) assumptions!: MarketAssumptionsDto;

  @ApiPropertyOptional({ type: MarginOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MarginOptionsDto)
  margin?: MarginOptionsDto;
}

export class ImpliedVolatilityDto {
  @ApiProperty({ example: '24000' }) @Matches(POSITIVE_MONEY) spot!: string;
  @ApiProperty({ example: '23800' }) @Matches(POSITIVE_MONEY) strike!: string;
  @ApiProperty({ example: '2026-10-29' }) @Matches(DATE_PATTERN) expiry!: string;
  @ApiProperty({ example: '2026-09-19' }) @Matches(DATE_PATTERN) asOf!: string;
  @ApiProperty({ enum: ['CE', 'PE'] }) @IsIn(['CE', 'PE']) right!: 'CE' | 'PE';
  @ApiProperty({ example: '420', description: 'The premium you actually see quoted' }) @Matches(POSITIVE_MONEY) premium!: string;
  @ApiPropertyOptional({ example: '6.5' }) @IsOptional() @Matches(POSITIVE_MONEY) riskFreeRatePercent?: string;
  @ApiPropertyOptional({ example: '0' }) @IsOptional() @Matches(POSITIVE_MONEY) dividendYieldPercent?: string;
}

export class TemplateDto {
  @ApiProperty({ enum: TEMPLATE_IDS }) @IsIn(TEMPLATE_IDS as unknown as string[]) template!: (typeof TEMPLATE_IDS)[number];
  @ApiProperty({ example: '24000' }) @Matches(POSITIVE_MONEY) spot!: string;
  @ApiProperty({ example: '50', description: 'Distance between adjacent strikes' }) @Matches(POSITIVE_MONEY) strikeStep!: string;
  @ApiProperty({ example: 75 }) @IsInt() @Min(1) @Max(100_000) lotSize!: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() @Min(1) @Max(10_000) lots?: number;
  @ApiProperty({ example: '2026-10-29' }) @Matches(DATE_PATTERN) expiry!: string;
  @ApiPropertyOptional({ example: '2026-11-26', description: 'Required for a calendar' })
  @IsOptional()
  @nullable()
  @Matches(DATE_PATTERN)
  farExpiry?: string | null;
  @ApiProperty({ example: '2026-09-19' }) @Matches(DATE_PATTERN) asOf!: string;
  @ApiPropertyOptional({ example: '14' }) @IsOptional() @Matches(POSITIVE_MONEY) impliedVolatilityPercent?: string;
  @ApiPropertyOptional({ example: '6.5' }) @IsOptional() @Matches(POSITIVE_MONEY) riskFreeRatePercent?: string;
  @ApiPropertyOptional({ example: '0' }) @IsOptional() @Matches(POSITIVE_MONEY) dividendYieldPercent?: string;
}

export class RolloverDto {
  @ApiProperty({ example: '24100' }) @Matches(POSITIVE_MONEY) nearPrice!: string;
  @ApiProperty({ example: '24160' }) @Matches(POSITIVE_MONEY) farPrice!: string;
}

export class FuturesDto {
  @ApiProperty({ example: 'NIFTY' }) @Matches(SYMBOL_PATTERN) underlying!: string;
  @ApiPropertyOptional({ enum: TRADE_SEGMENTS }) @IsOptional() @IsIn(TRADE_SEGMENTS as unknown as string[]) segment?: (typeof TRADE_SEGMENTS)[number];
  @ApiPropertyOptional({ enum: TRADE_EXCHANGES }) @IsOptional() @IsIn(TRADE_EXCHANGES as unknown as string[]) exchange?: (typeof TRADE_EXCHANGES)[number];
  @ApiProperty({ example: '2026-09-19' }) @Matches(DATE_PATTERN) date!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) @Max(10_000) lots!: number;
  @ApiProperty({ example: 75 }) @IsInt() @Min(1) @Max(100_000) lotSize!: number;
  @ApiProperty({ example: '24100' }) @Matches(POSITIVE_MONEY) futuresPrice!: string;
  @ApiProperty({ example: '24000' }) @Matches(POSITIVE_MONEY) spot!: string;
  @ApiPropertyOptional({ enum: ['BUY', 'SELL'] }) @IsOptional() @IsIn(['BUY', 'SELL']) side?: 'BUY' | 'SELL';
  @ApiPropertyOptional({ example: '2026-10-29' }) @IsOptional() @nullable() @Matches(DATE_PATTERN) expiry?: string | null;
  @ApiPropertyOptional({ example: '24150', description: 'Price to mark against' })
  @IsOptional()
  @nullable()
  @Matches(POSITIVE_MONEY)
  markPrice?: string | null;
  @ApiPropertyOptional({ example: '12' }) @IsOptional() @Matches(POSITIVE_MONEY) marginPercentOfNotional?: string;
  @ApiPropertyOptional({ type: RolloverDto })
  @IsOptional()
  @nullable()
  @ValidateNested()
  @Type(() => RolloverDto)
  rollover?: RolloverDto | null;
}

export class SizingDto {
  @ApiProperty({ example: '500000' }) @Matches(POSITIVE_MONEY) capital!: string;
  @ApiPropertyOptional({ example: '1' }) @IsOptional() @Matches(POSITIVE_MONEY) riskPercent?: string;
  @ApiPropertyOptional({ example: '5000', description: 'A flat risk per trade; overrides riskPercent' })
  @IsOptional()
  @nullable()
  @Matches(POSITIVE_MONEY)
  riskAmount?: string | null;
  @ApiProperty({ example: '1000' }) @Matches(POSITIVE_MONEY) entryPrice!: string;
  @ApiProperty({ example: '980' }) @Matches(POSITIVE_MONEY) stopPrice!: string;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() @Min(1) @Max(100_000) lotSize?: number;
  @ApiPropertyOptional({ example: '1060' }) @IsOptional() @nullable() @Matches(POSITIVE_MONEY) targetPrice?: string | null;
}

export class RiskOfRuinDto {
  @ApiProperty({ example: '50' }) @Matches(POSITIVE_MONEY) winRatePercent!: string;
  @ApiProperty({ example: '2' }) @Matches(POSITIVE_MONEY) payoffRatio!: string;
  @ApiProperty({ example: '2' }) @Matches(POSITIVE_MONEY) riskPercent!: string;
  @ApiPropertyOptional({ example: '100' }) @IsOptional() @Matches(POSITIVE_MONEY) ruinDrawdownPercent?: string;
}

export class SaveStrategyDto {
  @ApiProperty({ example: 'NIFTY 20/50 crossover' }) @IsString() @Length(1, 120) name!: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsString() @Length(0, 2_000) description?: string | null;
  @ApiProperty({ description: 'The rule tree; validated against the strategy schema', type: Object })
  @IsObject()
  spec!: Record<string, unknown>;
}

export class UpdateStrategyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsString() @Length(0, 2_000) description?: string | null;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() spec?: Record<string, unknown>;
}

export class RunBacktestDto {
  @ApiPropertyOptional({ description: 'Run a saved strategy by id' }) @IsOptional() @IsString() @Length(36, 36) strategyId?: string;
  @ApiPropertyOptional({ description: 'Or run an unsaved spec directly', type: Object }) @IsOptional() @IsObject() spec?: Record<string, unknown>;
  @ApiPropertyOptional({ example: '2024-01-01' }) @IsOptional() @Matches(DATE_PATTERN) from?: string;
  @ApiPropertyOptional({ example: '2025-12-31' }) @IsOptional() @Matches(DATE_PATTERN) to?: string;
  @ApiPropertyOptional({ example: 0.7, description: 'Fraction of the bars used as the in-sample half' })
  @IsOptional()
  @nullable()
  @IsNumber()
  @Min(0.1)
  @Max(0.9)
  walkForwardSplit?: number | null;
  @ApiPropertyOptional({ default: true, description: 'Set false to run without storing the result' })
  @IsOptional()
  @IsBoolean()
  save?: boolean;
}

export class BacktestFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(36, 36) strategyId?: string;
}

export class CreatePaperAccountDto {
  @ApiProperty({ example: 'Intraday practice' }) @IsString() @Length(1, 120) name!: string;
  @ApiProperty({ example: '500000' }) @Matches(POSITIVE_MONEY) startingCapital!: string;
}

export class RenamePaperAccountDto {
  @ApiProperty({ example: 'Swing practice' }) @IsString() @Length(1, 120) name!: string;
}

export class PlacePaperOrderDto {
  @ApiProperty({ example: 'INFY' }) @Matches(SYMBOL_PATTERN) symbol!: string;
  @ApiPropertyOptional({ enum: BAR_TIMEFRAMES }) @IsOptional() @IsIn(BAR_TIMEFRAMES as unknown as string[]) timeframe?: (typeof BAR_TIMEFRAMES)[number];
  @ApiProperty({ enum: ['BUY', 'SELL'] }) @IsIn(['BUY', 'SELL']) side!: 'BUY' | 'SELL';
  @ApiProperty({ example: '100', description: 'Whole units' }) @Matches(/^\d{1,15}$/) quantity!: string;
  @ApiPropertyOptional({ enum: ['MARKET', 'LIMIT'] }) @IsOptional() @IsIn(['MARKET', 'LIMIT']) orderType?: 'MARKET' | 'LIMIT';
  @ApiPropertyOptional({ example: '1450.50' }) @IsOptional() @nullable() @Matches(POSITIVE_MONEY) limitPrice?: string | null;
  @ApiProperty({ example: '2024-06-03', description: 'The moment in the imported series the order is placed at' })
  @Matches(DATE_PATTERN)
  placedDate!: string;
  @ApiPropertyOptional({ example: '09:20' }) @IsOptional() @nullable() @Matches(TIME_PATTERN) placedTime?: string | null;
  @ApiPropertyOptional({ enum: TRADE_EXCHANGES }) @IsOptional() @IsIn(TRADE_EXCHANGES as unknown as string[]) exchange?: (typeof TRADE_EXCHANGES)[number];
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() @Min(1) @Max(100_000) lotSize?: number;
}

export class UploadBarsDto {
  @ApiPropertyOptional({ example: 'NIFTY', description: 'Overrides the symbol found in the file' })
  @IsOptional()
  @Matches(SYMBOL_PATTERN)
  symbol?: string;
}

export class SeriesFilterDto {
  @ApiProperty({ example: 'NIFTY' }) @Matches(SYMBOL_PATTERN) symbol!: string;
  @ApiProperty({ enum: BAR_TIMEFRAMES }) @IsIn(BAR_TIMEFRAMES as unknown as string[]) timeframe!: (typeof BAR_TIMEFRAMES)[number];
}

export { SIGNED_MONEY };
