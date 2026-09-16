import { FinanceCore } from '@arvo/finance-core';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PageQueryDto, pageResponse } from '../common/pagination';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserId } from '../common/auth.decorators';
import { CreateTransferDto, LinkTransferDto, TransferDto, TransferListDto } from './dto/transfer.dto';

@ApiTags('transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOkResponse({ type: TransferListDto })
  async list(@UserId() userId: string, @Query() query: PageQueryDto) {
    const page = await this.core.transfers.list(userId, query);
    return pageResponse({ items: page.items.map(TransferDto.from), total: page.total }, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: TransferDto })
  async get(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TransferDto> {
    return TransferDto.from(await this.core.transfers.get(userId, id));
  }

  @Post()
  @ApiOperation({ summary: 'Record a new movement between two of your accounts' })
  @ApiCreatedResponse({ type: TransferDto })
  async create(@UserId() userId: string, @Body() dto: CreateTransferDto): Promise<TransferDto> {
    return TransferDto.from(await this.core.transfers.create(userId, dto));
  }

  @Post('link')
  @ApiOperation({ summary: 'Link two existing transactions as a transfer' })
  @ApiCreatedResponse({ type: TransferDto })
  async link(@UserId() userId: string, @Body() dto: LinkTransferDto): Promise<TransferDto> {
    return TransferDto.from(await this.core.transfers.link(userId, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink; both transactions remain with their previous types' })
  @ApiNoContentResponse()
  async unlink(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.core.transfers.unlink(userId, id);
  }
}
