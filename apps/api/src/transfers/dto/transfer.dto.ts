import type { TransferDetail } from '@arvo/finance-core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN, MONEY_PATTERN } from '../../common/validation';
import { TransactionDto } from '../../transactions/dto/transaction.dto';

export class TransferDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: TransactionDto, description: 'Outflow leg' }) from!: TransactionDto;
  @ApiProperty({ type: TransactionDto, description: 'Inflow leg' }) to!: TransactionDto;
  @ApiProperty() createdAt!: Date;

  static from(t: TransferDetail): TransferDto {
    return { id: t.id, from: TransactionDto.from(t.from), to: TransactionDto.from(t.to), createdAt: t.createdAt };
  }
}

export class TransferListDto {
  @ApiProperty({ type: [TransferDto] }) items!: TransferDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class CreateTransferDto {
  @ApiProperty() @IsUUID() fromAccountId!: string;
  @ApiProperty() @IsUUID() toAccountId!: string;
  @ApiProperty({ example: '10000.00', description: 'Positive amount moved' }) @Matches(MONEY_PATTERN) amount!: string;
  @ApiProperty({ example: '2026-08-20' }) @Matches(DATE_PATTERN) date!: string;
  @ApiProperty({ example: 'Credit card bill' }) @IsString() @Length(1, 500) description!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class LinkTransferDto {
  @ApiProperty({ description: 'The outflow transaction (negative amount)' }) @IsUUID() fromTransactionId!: string;
  @ApiProperty({ description: 'The inflow transaction (positive amount)' }) @IsUUID() toTransactionId!: string;
}
