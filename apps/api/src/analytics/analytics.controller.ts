import { UserEntity } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { UserId } from '../common/auth.decorators';
import {
  ComparePeriodsQueryDto,
  CurrencyQueryDto,
  DismissRecurringDto,
  MonthlySeriesDto,
  MonthQueryDto,
  NetWorthDto,
  PeriodQueryDto,
  PeriodSummaryDto,
} from './analytics.dto';
import { TransactionDto } from '../transactions/dto/transaction.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get('summary')
  @ApiOkResponse({ type: PeriodSummaryDto, description: 'Income, expenses, cashflow and category spend for a period' })
  async summary(@UserId() userId: string, @Query() query: PeriodQueryDto): Promise<PeriodSummaryDto> {
    return this.core.analytics.summary(userId, { ...query, currency: query.currency ?? (await this.baseCurrency(userId)) });
  }

  @Get('monthly')
  @ApiOkResponse({ type: MonthlySeriesDto })
  async monthly(@UserId() userId: string, @Query() query: PeriodQueryDto): Promise<MonthlySeriesDto> {
    const currency = query.currency ?? (await this.baseCurrency(userId));
    return { items: await this.core.analytics.monthly(userId, { ...query, currency }) };
  }

  @Get('net-worth')
  @ApiOkResponse({ type: NetWorthDto })
  async netWorth(@UserId() userId: string, @Query() query: CurrencyQueryDto): Promise<NetWorthDto> {
    return this.core.analytics.netWorth(userId, query.currency ?? (await this.baseCurrency(userId)));
  }

  @Get('compare')
  @ApiOperation({ summary: 'Compare two periods: totals, category changes and the largest expenses' })
  async compare(@UserId() userId: string, @Query() q: ComparePeriodsQueryDto) {
    const result = await this.core.insights.comparePeriods(userId, {
      current: { from: q.from, to: q.to },
      previous: { from: q.previousFrom, to: q.previousTo },
      currency: q.currency ?? (await this.baseCurrency(userId)),
      accountId: q.accountId,
    });
    return { ...result, largestExpenses: result.largestExpenses.map(TransactionDto.from) };
  }

  @Get('merchants')
  @ApiOperation({ summary: 'Spending by merchant for a period, net of refunds' })
  async merchants(@UserId() userId: string, @Query() q: PeriodQueryDto) {
    const currency = q.currency ?? (await this.baseCurrency(userId));
    return { items: await this.core.insights.spendingByMerchant(userId, { ...q, currency }) };
  }

  @Get('recurring')
  @ApiOperation({ summary: 'Detect and list recurring charges with monthly cost' })
  async recurring(@UserId() userId: string, @Query() q: CurrencyQueryDto) {
    const overview = await this.core.insights.recurring(userId, {
      currency: q.currency ?? (await this.baseCurrency(userId)),
      asOf: new Date().toISOString().slice(0, 10),
    });
    return { ...overview, series: overview.series.map(({ userId: _u, key: _k, ...s }) => s) };
  }

  @Patch('recurring/:id')
  @ApiOperation({ summary: 'Dismiss or restore a detected recurring charge' })
  async dismissRecurring(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DismissRecurringDto) {
    const { userId: _u, key: _k, ...series } = await this.core.insights.setRecurringDismissed(userId, id, dto.isDismissed);
    return series;
  }

  @Get('snapshot')
  @ApiOperation({ summary: 'Structured monthly financial snapshot' })
  async snapshot(@UserId() userId: string, @Query() q: MonthQueryDto) {
    return this.core.insights.snapshot(userId, {
      month: q.month,
      currency: q.currency ?? (await this.baseCurrency(userId)),
      asOf: new Date().toISOString().slice(0, 10),
    });
  }

  private async baseCurrency(userId: string): Promise<string> {
    return (await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId }))?.currency ?? 'INR';
  }
}
