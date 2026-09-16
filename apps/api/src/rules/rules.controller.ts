import { FinanceCore, type RuleRecord } from '@arvo/finance-core';
import { TransactionType } from '@arvo/types';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { UserId } from '../common/auth.decorators';

class RuleConditionDto {
  @ApiProperty({ enum: ['description', 'merchant', 'amount', 'direction'] })
  @IsIn(['description', 'merchant', 'amount', 'direction'])
  field!: 'description' | 'merchant' | 'amount' | 'direction';

  @ApiProperty({ enum: ['contains', 'equals', 'starts_with', 'gte', 'lte'] })
  @IsIn(['contains', 'equals', 'starts_with', 'gte', 'lte'])
  operator!: 'contains' | 'equals' | 'starts_with' | 'gte' | 'lte';

  @ApiProperty({ example: 'swiggy' }) @IsString() @Length(1, 200) value!: string;
}

class RuleActionsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) merchantName?: string;
  @ApiPropertyOptional({ enum: TransactionType }) @IsOptional() @IsEnum(TransactionType) type?: TransactionType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() markRecurring?: boolean;
}

class CreateRuleDto {
  @ApiProperty({ example: 'Food delivery' }) @IsString() @Length(1, 120) name!: string;
  @ApiPropertyOptional({ description: 'Lower runs first' }) @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiProperty({ type: [RuleConditionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions!: RuleConditionDto[];

  @ApiProperty({ type: RuleActionsDto })
  @ValidateNested()
  @Type(() => RuleActionsDto)
  actions!: RuleActionsDto;
}

class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ type: [RuleConditionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions?: RuleConditionDto[];

  @ApiPropertyOptional({ type: RuleActionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RuleActionsDto)
  actions?: RuleActionsDto;
}

const present = ({ userId: _u, ...rule }: RuleRecord) => rule;

@ApiTags('rules')
@ApiBearerAuth()
@Controller('rules')
export class RulesController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  async list(@UserId() userId: string) {
    return { items: (await this.core.rules.list(userId)).map(present) };
  }

  @Post()
  async create(@UserId() userId: string, @Body() dto: CreateRuleDto) {
    return present(await this.core.rules.create(userId, dto));
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto) {
    return present(await this.core.rules.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.rules.delete(userId, id);
  }
}
