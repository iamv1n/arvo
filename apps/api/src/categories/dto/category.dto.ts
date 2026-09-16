import type { CategoryRecord } from '@arvo/finance-core';
import { CategoryType } from '@arvo/types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty({ enum: CategoryType, enumName: 'CategoryType' }) type!: CategoryType;
  @ApiProperty({ description: 'System categories are shared and read-only' }) isSystem!: boolean;

  static from(c: CategoryRecord): CategoryDto {
    return { id: c.id, name: c.name, parentId: c.parentId, type: c.type, isSystem: c.isSystem };
  }
}

export class CategoryListDto {
  @ApiProperty({ type: [CategoryDto] }) items!: CategoryDto[];
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Coffee' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({ enum: CategoryType, enumName: 'CategoryType' })
  @IsEnum(CategoryType)
  type!: CategoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;
}
