import { FinanceCore } from '@arvo/finance-core';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto, pageResponse } from '../common/pagination';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserId } from '../common/auth.decorators';
import { MerchantDto, MerchantListDto, MerchantNameDto } from './dto/merchant.dto';

class MerchantQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive name search' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

@ApiTags('merchants')
@ApiBearerAuth()
@Controller('merchants')
export class MerchantsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOkResponse({ type: MerchantListDto })
  async list(@UserId() userId: string, @Query() query: MerchantQueryDto) {
    const page = await this.core.merchants.page(userId, query);
    return pageResponse({ items: page.items.map(MerchantDto.from), total: page.total }, query);
  }

  @Post()
  @ApiCreatedResponse({ type: MerchantDto })
  async create(@UserId() userId: string, @Body() dto: MerchantNameDto): Promise<MerchantDto> {
    return MerchantDto.from(await this.core.merchants.create(userId, dto.name));
  }

  @Patch(':id')
  @ApiOkResponse({ type: MerchantDto })
  async rename(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MerchantNameDto,
  ): Promise<MerchantDto> {
    return MerchantDto.from(await this.core.merchants.rename(userId, id, dto.name));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.core.merchants.delete(userId, id);
  }
}
