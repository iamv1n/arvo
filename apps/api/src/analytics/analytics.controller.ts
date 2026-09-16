import { UserEntity } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { UserId } from '../common/auth.decorators';
import { CurrencyQueryDto, MonthlySeriesDto, NetWorthDto, PeriodQueryDto, PeriodSummaryDto } from './analytics.dto';

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

  private async baseCurrency(userId: string): Promise<string> {
    return (await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId }))?.currency ?? 'INR';
  }
}
