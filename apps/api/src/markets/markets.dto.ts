import {
  ALERT_CHANNELS,
  ALERT_KINDS,
  CORPORATE_ACTION_KINDS,
  IPO_STATUSES,
  type AlertChannel,
  type AlertKind,
  type AlertParams,
  type CorporateActionKind,
  type DigestFrequency,
  type IpoStatus,
} from '@arvo/finance-core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/*
 * Request shapes for Markets & Alerts.
 *
 * Money arrives as a decimal string and is validated by pattern rather than parsed as a number,
 * like everywhere else in Arvo: a float would silently lose the last paisa somewhere between
 * the browser and the ledger.
 *
 * Alert parameters are the one place a raw object crosses the boundary. They are a nine-armed
 * discriminated union, and class-validator has no honest way to express that, so the DTO checks
 * the shape is an object with a matching `kind` and finance-core does the real validation —
 * which is the layer that must reject a bad rule anyway, since MCP and the scheduler reach it
 * without passing through here.
 */

const MONEY = /^-?\d{1,15}(\.\d{1,4})?$/;
const POSITIVE_MONEY = /^\d{1,15}(\.\d{1,4})?$/;
const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9&._-]{0,63}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateWatchlistDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateWatchlistDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class CreateWatchlistItemDto {
  @ApiProperty({ description: 'Exchange trading symbol, e.g. INFY or NIFTY' })
  @IsString()
  @Matches(SYMBOL, { message: 'symbol must be a plain instrument symbol' })
  symbol!: string;

  @ApiPropertyOptional({ nullable: true, example: 'NSE' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  exchange?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  isin?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  schemeCode?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateWatchlistItemDto extends CreateWatchlistItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SYMBOL)
  declare symbol: string;
}

export class ReorderDto {
  @ApiProperty({ type: [String], description: 'Item ids in the order they should appear' })
  @IsArray()
  @ArrayMaxSize(250)
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class SetQuoteDto {
  @ApiProperty()
  @IsString()
  @Matches(SYMBOL)
  symbol!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  exchange?: string | null;

  @ApiProperty({ example: '1523.40' })
  @Matches(MONEY)
  price!: string;

  @ApiPropertyOptional({ nullable: true, example: '1498.10' })
  @IsOptional()
  @Matches(MONEY)
  previousClose?: string | null;

  @ApiProperty({ example: '2026-09-15' })
  @IsISO8601({ strict: true })
  asOf!: string;
}

export class RefreshQuotesDto {
  @ApiPropertyOptional({ description: 'Ignore the refresh cooldown. Rate limits still apply upstream.' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsISO8601({ strict: true })
  asOf?: string;
}

export class DateRangeDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class CorporateActionDto {
  @ApiProperty()
  @IsString()
  @Matches(SYMBOL)
  symbol!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @ApiProperty({ enum: CORPORATE_ACTION_KINDS })
  @IsIn(CORPORATE_ACTION_KINDS)
  kind!: CorporateActionKind;

  @ApiProperty({ example: '2026-09-18' })
  @IsISO8601({ strict: true })
  exDate!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  recordDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  payDate?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Per-share amount for a dividend or buyback' })
  @IsOptional()
  @Matches(MONEY)
  amount?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1:1' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ratio?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class IpoDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(SYMBOL)
  symbol?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  openDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  closeDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(POSITIVE_MONEY)
  priceBandLow?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(POSITIVE_MONEY)
  priceBandHigh?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 1_000_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  lotSize?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  listingDate?: string | null;

  @ApiPropertyOptional({ enum: IPO_STATUSES })
  @IsOptional()
  @IsIn(IPO_STATUSES)
  status?: IpoStatus;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class HolidayImportDto {
  @ApiPropertyOptional({ default: 'NSE' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  exchange?: string;
}

export class CreateAlertDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ALERT_KINDS })
  @IsIn(ALERT_KINDS)
  kind!: AlertKind;

  @ApiProperty({
    description: 'Parameters for the chosen kind; its `kind` field must match. Validated in full by the engine.',
    example: { kind: 'PRICE_LEVEL', symbol: 'NIFTY', exchange: 'NSE', direction: 'ABOVE', level: '25000' },
  })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ default: 1440, minimum: 0, maximum: 43200, description: 'Minimum gap between firings, in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(43_200)
  cooldownMinutes?: number;

  @ApiPropertyOptional({ default: false, description: 'False means one-shot: the alert turns itself off after firing' })
  @IsOptional()
  @IsBoolean()
  repeats?: boolean;

  @ApiPropertyOptional({ enum: ALERT_CHANNELS, isArray: true, default: ['IN_APP'] })
  @IsOptional()
  @IsArray()
  @IsIn(ALERT_CHANNELS, { each: true })
  channels?: AlertChannel[];
}

export class UpdateAlertDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 43200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(43_200)
  cooldownMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  repeats?: boolean;

  @ApiPropertyOptional({ enum: ALERT_CHANNELS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(ALERT_CHANNELS, { each: true })
  channels?: AlertChannel[];
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'Leave empty to mark everything read' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids?: string[];
}

export class ExpiryRuleDto {
  @ApiProperty({ example: 'NIFTY' })
  @IsString()
  @MaxLength(32)
  index!: string;

  @ApiProperty({ description: 'Has weekly contracts as well as monthly ones' })
  @IsBoolean()
  weekly!: boolean;

  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday. NSE indices are 2 (Tuesday) as of September 2026.' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty()
  @IsBoolean()
  monthly!: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Chat id the bot posts to; the token is server configuration' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '22:00' })
  @IsOptional()
  @Matches(TIME, { message: 'Use HH:MM, 24-hour' })
  quietHoursStart?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '07:00' })
  @IsOptional()
  @Matches(TIME, { message: 'Use HH:MM, 24-hour' })
  quietHoursEnd?: string | null;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 43200, description: 'A market alert on data older than this is skipped, not fired' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43_200)
  staleQuoteMinutes?: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 3600 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  refreshCooldownSeconds?: number;

  @ApiPropertyOptional({ enum: ['off', 'daily', 'weekly'] })
  @IsOptional()
  @IsIn(['off', 'daily', 'weekly'])
  newsDigestFrequency?: DigestFrequency;

  @ApiPropertyOptional({ type: [ExpiryRuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ExpiryRuleDto)
  expiryRules?: ExpiryRuleDto[];
}

export class UpdateGuardrailsDto {
  @ApiPropertyOptional({ nullable: true, description: 'Realised loss in a day at which the cool-off banner appears' })
  @IsOptional()
  @Matches(POSITIVE_MONEY)
  maxLossPerDay?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(POSITIVE_MONEY)
  maxLossPerWeek?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxTradesPerDay?: number | null;
}

export class CreateFeedDto {
  @ApiProperty({ example: 'https://example.com/markets.xml' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;
}

export class UpdateFeedDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class BuildDigestDto {
  @ApiPropertyOptional({ example: '2026-09-08' })
  @IsOptional()
  @IsISO8601({ strict: true })
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsISO8601({ strict: true })
  periodEnd?: string;
}

/** Narrows the DTO's loose object to the engine's union; the engine validates the rest. */
export function alertParamsOf(kind: AlertKind, params: Record<string, unknown>): AlertParams {
  return { ...params, kind } as AlertParams;
}
