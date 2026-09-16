import { FinanceCore } from '@arvo/finance-core';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserId } from '../common/auth.decorators';
import { CategoryDto, CategoryListDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOkResponse({ type: CategoryListDto, description: 'System and personal categories; build the tree from parentId' })
  async list(@UserId() userId: string): Promise<CategoryListDto> {
    return { items: (await this.core.categories.list(userId)).map(CategoryDto.from) };
  }

  @Post()
  @ApiCreatedResponse({ type: CategoryDto })
  async create(@UserId() userId: string, @Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return CategoryDto.from(await this.core.categories.create(userId, dto));
  }

  @Patch(':id')
  @ApiOkResponse({ type: CategoryDto })
  async update(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return CategoryDto.from(await this.core.categories.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.core.categories.delete(userId, id);
  }
}
