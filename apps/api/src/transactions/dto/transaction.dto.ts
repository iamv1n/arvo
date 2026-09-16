import type { TransactionRecord } from '@arvo/finance-core';
import { TransactionSource, TransactionStatus, TransactionType } from '@arvo/types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DATE_PATTERN, MONEY_PATTERN } from '../../common/validation';

export class TransactionDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty({ example: '2026-08-14' }) date!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) merchantId!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoryId!: string | null;
  @ApiProperty({ example: '-649.00', description: 'Negative = money left the account' }) amount!: string;
  @ApiProperty({ example: 'INR' }) currency!: string;
  @ApiProperty({ enum: TransactionType, enumName: 'TransactionType' }) type!: TransactionType;
  @ApiProperty({ enum: TransactionStatus, enumName: 'TransactionStatus' }) status!: TransactionStatus;
  @ApiProperty({ enum: TransactionSource, enumName: 'TransactionSource' }) source!: TransactionSource;
  @ApiProperty({ type: String, nullable: true }) sourceReference!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) metadata!: Record<string, unknown>;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(t: TransactionRecord): TransactionDto {
    return {
      id: t.id,
      accountId: t.accountId,
      date: t.date,
      description: t.description,
      merchantId: t.merchantId,
      categoryId: t.categoryId,
      amount: t.amount,
      currency: t.currency,
      type: t.type,
      status: t.status,
      source: t.source,
      sourceReference: t.sourceReference,
      notes: t.notes,
      metadata: t.metadata,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}

export class TransactionPageDto {
  @ApiProperty({ type: [TransactionDto] }) items!: TransactionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListTransactionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() merchantId?: string;

  @ApiPropertyOptional({ enum: TransactionType, isArray: true, description: 'Comma-separated or repeated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(TransactionType, { each: true })
  type?: TransactionType[];

  @ApiPropertyOptional({ example: '2026-08-01' }) @IsOptional() @Matches(DATE_PATTERN) from?: string;
  @ApiPropertyOptional({ example: '2026-08-31' }) @IsOptional() @Matches(DATE_PATTERN) to?: string;
  @ApiPropertyOptional({ description: 'Matches description or merchant name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 50, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateTransactionDto {
  @ApiProperty() @IsUUID() accountId!: string;
  @ApiProperty({ example: '2026-08-14' }) @Matches(DATE_PATTERN) date!: string;
  @ApiProperty({ example: 'Swiggy order' }) @IsString() @Length(1, 500) description!: string;

  @ApiProperty({ example: '-450.00', description: 'Signed from the account perspective' })
  @Matches(MONEY_PATTERN)
  amount!: string;

  @ApiProperty({ enum: TransactionType, enumName: 'TransactionType' })
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ApiPropertyOptional({ example: 'INR' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() merchantId?: string;

  @ApiPropertyOptional({ description: 'Matched to an existing merchant by name, or created' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  merchantName?: string;

  @ApiPropertyOptional({ enum: TransactionStatus, enumName: 'TransactionStatus' })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

const nullable = ValidateIf((_, v) => v !== null);

export class UpdateTransactionDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) description?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_PATTERN) amount?: string;

  @ApiPropertyOptional({ enum: TransactionType, enumName: 'TransactionType' })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @nullable @IsUUID() categoryId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @nullable @IsUUID() merchantId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) merchantName?: string;

  @ApiPropertyOptional({ enum: TransactionStatus, enumName: 'TransactionStatus' })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @nullable
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class BulkCategorizeDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  transactionIds!: string[];

  @ApiProperty({ type: String, nullable: true, description: 'null clears the category' })
  @nullable
  @IsUUID()
  categoryId!: string | null;
}

export class BulkCategorizeResultDto {
  @ApiProperty() updated!: number;
}
