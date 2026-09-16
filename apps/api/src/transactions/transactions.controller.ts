import { FinanceCore } from '@arvo/finance-core';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserId } from '../common/auth.decorators';
import {
  BulkCategorizeDto,
  BulkCategorizeResultDto,
  BulkUpdateTransactionsDto,
  CreateTransactionDto,
  ListTransactionsQueryDto,
  TransactionDto,
  TransactionPageDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOkResponse({ type: TransactionPageDto })
  async list(@UserId() userId: string, @Query() query: ListTransactionsQueryDto): Promise<TransactionPageDto> {
    const { type, status, source, ...filter } = query;
    const page = await this.core.transactions.list(userId, { ...filter, types: type, statuses: status, sources: source });
    return {
      items: page.items.map(TransactionDto.from),
      total: page.total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }

  @Post('bulk-categorize')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BulkCategorizeResultDto })
  async bulkCategorize(@UserId() userId: string, @Body() dto: BulkCategorizeDto): Promise<BulkCategorizeResultDto> {
    return { updated: await this.core.transactions.bulkCategorize(userId, dto.transactionIds, dto.categoryId) };
  }

  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BulkCategorizeResultDto, description: 'Apply a category and/or merchant to many transactions' })
  async bulkUpdate(@UserId() userId: string, @Body() dto: BulkUpdateTransactionsDto): Promise<BulkCategorizeResultDto> {
    const { transactionIds, ...changes } = dto;
    return { updated: await this.core.transactions.bulkUpdate(userId, transactionIds, changes) };
  }

  @Get(':id')
  @ApiOkResponse({ type: TransactionDto })
  async get(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TransactionDto> {
    return TransactionDto.from(await this.core.transactions.get(userId, id));
  }

  @Post()
  @ApiCreatedResponse({ type: TransactionDto })
  async create(@UserId() userId: string, @Body() dto: CreateTransactionDto): Promise<TransactionDto> {
    return TransactionDto.from(await this.core.transactions.create(userId, dto));
  }

  @Patch(':id')
  @ApiOkResponse({ type: TransactionDto })
  async update(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionDto> {
    return TransactionDto.from(await this.core.transactions.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.core.transactions.delete(userId, id);
  }
}
