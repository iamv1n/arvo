import { UserEntity } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { DataSource } from 'typeorm';
import { UserId } from '../common/auth.decorators';
import { DATE_PATTERN, MONEY_PATTERN } from '../common/validation';

export const today = () => new Date().toISOString().slice(0, 10);

export async function baseCurrency(dataSource: DataSource, userId: string): Promise<string> {
  return (await dataSource.getRepository(UserEntity).findOneBy({ id: userId }))?.currency ?? 'INR';
}

class BudgetMonthQueryDto {
  @ApiPropertyOptional({ example: '2026-09' }) @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
}

class CreateBudgetDto {
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiProperty({ example: '8000' }) @Matches(MONEY_PATTERN) amount!: string;
  @ApiPropertyOptional({ example: 'INR' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rollover?: boolean;
}

class UpdateBudgetDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_PATTERN) amount?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rollover?: boolean;
}

class CreateGoalDto {
  @ApiProperty({ example: 'Emergency fund' }) @IsString() @Length(1, 120) name!: string;
  @ApiProperty({ example: '200000' }) @Matches(MONEY_PATTERN) targetAmount!: string;
  @ApiPropertyOptional({ example: 'INR' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiProperty({ example: '2027-03-31' }) @Matches(DATE_PATTERN) targetDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() accountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_PATTERN) savedAmount?: string;
}

class UpdateGoalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_PATTERN) targetAmount?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_PATTERN) targetDate?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() accountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_PATTERN) savedAmount?: string;
}

const strip = <T extends { userId: string }>({ userId: _u, ...rest }: T) => rest;

@ApiTags('budgets')
@ApiBearerAuth()
@Controller('budgets')
export class BudgetsController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Budgets with pacing for a month (default: current month, as of today)' })
  async list(@UserId() userId: string, @Query() q: BudgetMonthQueryDto) {
    const result = await this.core.budgets.status(userId, { asOf: today(), month: q.month });
    return { ...result, budgets: result.budgets.map(strip) };
  }

  @Post()
  async create(@UserId() userId: string, @Body() dto: CreateBudgetDto) {
    const currency = dto.currency ?? (await baseCurrency(this.dataSource, userId));
    return strip(await this.core.budgets.create(userId, { ...dto, currency }));
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBudgetDto) {
    return strip(await this.core.budgets.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.budgets.delete(userId, id);
  }
}

@ApiTags('goals')
@ApiBearerAuth()
@Controller('goals')
export class GoalsController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Goals with progress, required monthly contribution and status' })
  async list(@UserId() userId: string) {
    const result = await this.core.goals.status(userId, { asOf: today() });
    return { ...result, goals: result.goals.map(strip) };
  }

  @Post()
  async create(@UserId() userId: string, @Body() dto: CreateGoalDto) {
    const currency = dto.currency ?? (await baseCurrency(this.dataSource, userId));
    return strip(await this.core.goals.create(userId, { ...dto, currency }));
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGoalDto) {
    return strip(await this.core.goals.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.goals.delete(userId, id);
  }
}
