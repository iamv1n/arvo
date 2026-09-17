import { FinanceCore } from '@arvo/finance-core';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { DataSource } from 'typeorm';
import { UserId } from '../common/auth.decorators';
import { DATE_PATTERN, MONEY_PATTERN } from '../common/validation';
import { baseCurrency, today } from './planning.controller';

const ADJUSTMENTS_EXAMPLE = [
  { type: 'category', categoryId: '00000000-0000-4000-8000-000000000001', mode: 'amount', value: '10000' },
  { type: 'category', categoryId: '00000000-0000-4000-8000-000000000002', mode: 'percent', value: '-50' },
  { type: 'income', mode: 'percent', value: '5', fromMonth: '2027-01' },
  { type: 'one_off', month: '2026-12', amount: '70000', label: 'Laptop' },
];

class AffordabilityDto {
  @ApiProperty({ example: '70000' }) @Matches(MONEY_PATTERN) amount!: string;
  @ApiPropertyOptional({ example: '2026-12-01', description: 'Purchase date (default today), within 12 months' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  date?: string;
  @ApiPropertyOptional({ example: 3, default: 3 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(24) bufferMonths?: number;
}

class WhatIfDto {
  @ApiProperty({ example: ADJUSTMENTS_EXAMPLE, description: 'Validated by Finance Core' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  adjustments!: object[];
}

class CreateScenarioDto extends WhatIfDto {
  @ApiProperty({ example: 'Move to a bigger flat' }) @IsString() @Length(1, 120) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 500)
  description?: string | null;
}

class UpdateScenarioDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) name?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 500)
  description?: string | null;
  @ApiPropertyOptional({ example: ADJUSTMENTS_EXAMPLE }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsObject({ each: true }) adjustments?: object[];
}

class CompareQueryDto {
  @ApiProperty({ example: 'id1,id2', description: 'Comma-separated scenario ids (1–5)' })
  @Matches(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,4}$/i)
  ids!: string;
}

const strip = <T extends { userId: string }>({ userId: _u, ...rest }: T) => rest;

@ApiTags('planning')
@ApiBearerAuth()
@Controller('planning')
export class PlanningController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get('savings-opportunities')
  @ApiOperation({ summary: 'Ranked savings opportunities with estimated monthly saving and evidence' })
  async savings(@UserId() userId: string) {
    return this.core.savings.opportunities(userId, { currency: await baseCurrency(this.dataSource, userId), asOf: today() });
  }

  @Post('affordability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Can I afford it? Cash after purchase, buffer and a 12-month projection' })
  async affordability(@UserId() userId: string, @Body() dto: AffordabilityDto) {
    return this.core.scenarios.affordability(userId, { ...dto, currency: await baseCurrency(this.dataSource, userId), asOf: today() });
  }

  @Post('what-if')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Project ad-hoc adjustments 12 months ahead against the baseline' })
  async whatIf(@UserId() userId: string, @Body() dto: WhatIfDto) {
    return this.core.scenarios.whatIf(userId, { adjustments: dto.adjustments, currency: await baseCurrency(this.dataSource, userId), asOf: today() });
  }
}

@ApiTags('scenarios')
@ApiBearerAuth()
@Controller('scenarios')
export class ScenariosController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get()
  async list(@UserId() userId: string) {
    return { items: (await this.core.scenarios.list(userId)).map(strip) };
  }

  @Get('compare')
  @ApiOperation({ summary: 'Run several saved scenarios side by side' })
  async compare(@UserId() userId: string, @Query() q: CompareQueryDto) {
    const result = await this.core.scenarios.compare(userId, q.ids.split(','), { currency: await baseCurrency(this.dataSource, userId), asOf: today() });
    return result;
  }

  @Post()
  async create(@UserId() userId: string, @Body() dto: CreateScenarioDto) {
    return strip(await this.core.scenarios.create(userId, { ...dto, asOf: today() }));
  }

  @Get(':id')
  async get(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return strip(await this.core.scenarios.require(userId, id));
  }

  @Get(':id/run')
  @ApiOperation({ summary: "Run a saved scenario against today's baseline" })
  async run(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.core.scenarios.run(userId, id, { currency: await baseCurrency(this.dataSource, userId), asOf: today() });
    return { ...result, scenario: strip(result.scenario) };
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScenarioDto) {
    return strip(await this.core.scenarios.update(userId, id, { ...dto, asOf: today() }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.scenarios.delete(userId, id);
  }
}
