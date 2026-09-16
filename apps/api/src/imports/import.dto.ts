import type { ImportBatchRecord, ImportRowRecord } from '@arvo/finance-core';
import { ImportStatus, TransactionType } from '@arvo/types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATE_PATTERN, MONEY_PATTERN } from '../common/validation';

const ROW_STATUSES = ['VALID', 'INVALID', 'POSSIBLE_DUPLICATE', 'AMBIGUOUS'] as const;
const DECISIONS = ['PENDING', 'ACCEPT', 'REJECT'] as const;
const DATE_FORMATS = [
  'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY', 'DD/MM/YY', 'MM/DD/YY',
  'DD-MM-YY', 'DD-MMM-YYYY', 'DD MMM YYYY', 'DD-MMM-YY', 'DD MMM YY', 'MMM DD, YYYY', 'YYYY/MM/DD',
] as const;

/** Multipart fields besides the file itself (documented with @ApiBody on the route). */
export class UploadImportDto {
  @ApiProperty() @IsUUID() accountId!: string;
}

const optionalColumn = () => [IsOptional(), ValidateIf((_: unknown, v: unknown) => v !== null), IsInt(), Min(0), Max(500)];
function Column() {
  return (target: object, key: string) => optionalColumn().forEach((d) => d(target, key));
}

export class ColumnMappingDto {
  @ApiProperty() @IsInt() @Min(0) @Max(50) tableIndex!: number;
  @ApiProperty({ description: '-1 when there is no header row' }) @IsInt() @Min(-1) headerRowIndex!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(500) date!: number;
  @ApiProperty({ type: [Number] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @IsInt({ each: true }) @Min(0, { each: true }) description!: number[];
  @ApiPropertyOptional() @Column() amount?: number;
  @ApiPropertyOptional() @Column() debit?: number;
  @ApiPropertyOptional() @Column() credit?: number;
  @ApiPropertyOptional() @Column() direction?: number;
  @ApiPropertyOptional() @Column() currency?: number;
  @ApiPropertyOptional() @Column() reference?: number;
  @ApiPropertyOptional() @Column() balance?: number;
  @ApiProperty({ enum: DATE_FORMATS }) @IsIn(DATE_FORMATS) dateFormat!: (typeof DATE_FORMATS)[number];
  @ApiProperty() @IsBoolean() invertAmounts!: boolean;
}

export class ProcessImportDto {
  @ApiProperty({ type: ColumnMappingDto })
  @ValidateNested()
  @Type(() => ColumnMappingDto)
  mapping!: ColumnMappingDto;
}

const toArray = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value);

export class ImportRowsQueryDto {
  @ApiPropertyOptional({ enum: ROW_STATUSES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsIn(ROW_STATUSES, { each: true })
  status?: (typeof ROW_STATUSES)[number][];

  @ApiPropertyOptional({ enum: DECISIONS, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsIn(DECISIONS, { each: true })
  decision?: (typeof DECISIONS)[number][];

  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

const nullable = ValidateIf((_, v) => v !== null);

export class UpdateImportRowDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) description?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_PATTERN) amount?: string;
  @ApiPropertyOptional({ enum: TransactionType, enumName: 'TransactionType' }) @IsOptional() @IsEnum(TransactionType) type?: TransactionType;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @nullable @IsUUID() categoryId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @nullable @IsString() @MaxLength(120) merchantName?: string | null;
  @ApiPropertyOptional({ enum: DECISIONS }) @IsOptional() @IsIn(DECISIONS) decision?: (typeof DECISIONS)[number];
}

export class ImportDecisionDto {
  @ApiProperty({ enum: DECISIONS }) @IsIn(DECISIONS) decision!: (typeof DECISIONS)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  rowIds?: string[];

  @ApiPropertyOptional({ enum: ROW_STATUSES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(ROW_STATUSES, { each: true })
  statuses?: (typeof ROW_STATUSES)[number][];
}

export class ImportBatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() filename!: string;
  @ApiProperty({ enum: ['CSV', 'XLSX', 'PDF'] }) fileType!: string;
  @ApiProperty() fileSize!: number;
  @ApiProperty({ enum: ImportStatus, enumName: 'ImportStatus' }) status!: ImportStatus;
  @ApiProperty() totalRows!: number;
  @ApiProperty() processedRows!: number;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true }) mapping!: unknown;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true, description: 'Tables, headers, sample rows and suggested mapping' }) detection!: unknown;
  @ApiProperty({ type: String, nullable: true }) duplicateOfBatchId!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) completedAt!: Date | null;

  static from(b: ImportBatchRecord): ImportBatchDto {
    const { userId: _u, storageKey: _s, fileHash: _h, updatedAt: _up, ...rest } = b;
    return rest;
  }
}

export class ImportRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() rowNumber!: number;
  @ApiProperty({ type: [String] }) raw!: string[];
  @ApiProperty({ type: String, nullable: true }) date!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) amount!: string | null;
  @ApiProperty({ type: String, nullable: true }) currency!: string | null;
  @ApiProperty({ enum: TransactionType, nullable: true }) type!: TransactionType | null;
  @ApiProperty({ type: String, nullable: true }) merchantName!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoryId!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['RULE', 'MERCHANT', 'HISTORY', 'AI', 'USER'] }) categorizationSource!: string | null;
  @ApiProperty({ type: String, nullable: true }) sourceReference!: string | null;
  @ApiProperty({ enum: ROW_STATUSES }) status!: string;
  @ApiProperty({ enum: DECISIONS }) decision!: string;
  @ApiProperty({ type: String, nullable: true }) duplicateOfTransactionId!: string | null;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) issues!: unknown[];
  @ApiProperty({ type: String, nullable: true }) transactionId!: string | null;

  static from(r: ImportRowRecord): ImportRowDto {
    const { userId: _u, batchId: _b, fingerprint: _f, createdAt: _c, updatedAt: _up, ...rest } = r;
    return rest;
  }
}

export class ImportSummaryDto {
  @ApiProperty({ type: ImportBatchDto }) batch!: ImportBatchDto;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'total, byStatus, byDecision, committed' }) counts!: unknown;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) errors!: { rowNumber: number | null; code: string; message: string }[];
}
