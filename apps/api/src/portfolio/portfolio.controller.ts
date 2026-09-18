import {
  FinanceCore,
  MAX_PORTFOLIO_IMPORT_BYTES,
  formatMoney,
  formatUnits,
  positionCashflows,
  xirrPercent,
  type Position,
} from '@arvo/finance-core';
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { UserId } from '../common/auth.decorators';
import { baseCurrency, today } from '../planning/planning.controller';
import {
  AsOfQueryDto,
  CapitalGainsQueryDto,
  CreateHoldingDto,
  CreateHoldingTransactionDto,
  GoalProjectionDto,
  ImportRowDecisionDto,
  RebalanceDto,
  ReturnsQueryDto,
  SetPriceDto,
  UpdateHoldingDto,
  UpdateHoldingTransactionDto,
  UploadPortfolioImportDto,
} from './portfolio.dto';

const strip = <T extends { userId: string }>({ userId: _u, ...rest }: T) => rest;

/** The position shape the UI drills into: money as strings, no bigints. */
const presentPosition = (position: Position) => ({
  units: formatUnits(position.units),
  invested: formatMoney(position.invested),
  withdrawn: formatMoney(position.withdrawn),
  income: formatMoney(position.income),
  netInvested: formatMoney(position.netInvested),
  costBasis: formatMoney(position.costBasis),
  value: formatMoney(position.value),
  valueSource: position.valueSource,
  price: position.price === null ? null : formatMoney(position.price),
  priceDate: position.priceDate,
  unrealisedGain: formatMoney(position.unrealisedGain),
  xirrPercent: xirrPercent(positionCashflows(position)),
  lots: position.lots.map((lot) => ({ date: lot.date, units: formatUnits(lot.units), cost: formatMoney(lot.cost) })),
  realised: position.realised.map((sale) => ({
    buyDate: sale.buyDate,
    sellDate: sale.sellDate,
    units: formatUnits(sale.units),
    cost: formatMoney(sale.cost),
    proceeds: formatMoney(sale.proceeds),
    gain: formatMoney(sale.gain),
    heldDays: sale.heldDays,
  })),
  warnings: position.warnings,
});

@ApiTags('holdings')
@ApiBearerAuth()
@Controller('holdings')
export class HoldingsController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every holding, alphabetically' })
  async list(@UserId() userId: string) {
    return { items: (await this.core.holdings.list(userId)).map(strip) };
  }

  @Post()
  async create(@UserId() userId: string, @Body() dto: CreateHoldingDto) {
    const currency = dto.currency ?? (await baseCurrency(this.dataSource, userId));
    return strip(await this.core.holdings.create(userId, { ...dto, currency }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One holding with its position, lots, realised gains and transactions' })
  async detail(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Query() query: AsOfQueryDto) {
    const holding = await this.core.holdings.require(userId, id);
    const { position, transactions } = await this.core.holdings.detail(userId, id, query.asOf ?? today());
    return {
      holding: strip(holding),
      asOf: position.asOf,
      position: presentPosition(position),
      transactions: transactions.map(strip),
    };
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHoldingDto) {
    return strip(await this.core.holdings.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.holdings.delete(userId, id);
  }

  @Post(':id/price')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record the latest known price or NAV' })
  async setPrice(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPriceDto) {
    return strip(await this.core.holdings.setPrice(userId, id, dto));
  }

  @Get(':id/transactions')
  async transactions(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { items: (await this.core.holdings.transactions(userId, id)).map(strip) };
  }

  @Post(':id/transactions')
  async addTransaction(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateHoldingTransactionDto) {
    return strip(await this.core.holdings.addTransaction(userId, id, dto));
  }

  @Patch(':id/transactions/:transactionId')
  async updateTransaction(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: UpdateHoldingTransactionDto,
  ) {
    return strip(await this.core.holdings.updateTransaction(userId, transactionId, dto));
  }

  @Delete(':id/transactions/:transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTransaction(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    await this.core.holdings.deleteTransaction(userId, transactionId);
  }
}

@ApiTags('portfolio')
@ApiBearerAuth()
@Controller('portfolio')
export class PortfolioController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Invested, current value, gain and XIRR, with the top holdings' })
  async summary(@UserId() userId: string, @Query() query: AsOfQueryDto) {
    return this.core.portfolio.summary(userId, await this.context(userId, query.asOf));
  }

  @Get('allocation')
  @ApiOperation({ summary: 'Allocation by asset class, market cap, sector and AMC, plus concentration and cost drag' })
  async allocation(@UserId() userId: string, @Query() query: AsOfQueryDto) {
    return this.core.portfolio.allocation(userId, await this.context(userId, query.asOf));
  }

  @Get('returns')
  @ApiOperation({ summary: 'XIRR overall, per asset class and per holding, against an imported index' })
  async returns(@UserId() userId: string, @Query() query: ReturnsQueryDto) {
    return this.core.portfolio.returns(userId, { ...(await this.context(userId, query.asOf)), benchmark: query.benchmark });
  }

  @Get('capital-gains')
  @ApiOperation({ summary: 'Realised and unrealised gains, harvesting headroom and lock-ins. Information, not advice.' })
  async capitalGains(@UserId() userId: string, @Query() query: CapitalGainsQueryDto) {
    return this.core.portfolio.capitalGains(userId, {
      ...(await this.context(userId, query.asOf)),
      financialYear: query.financialYear,
      config: query.ltcgExemption ? { ltcgExemption: query.ltcgExemption } : undefined,
    });
  }

  @Get('overlap')
  @ApiOperation({ summary: 'Common holdings between funds whose portfolio disclosures you imported' })
  async overlap(@UserId() userId: string, @Query() query: AsOfQueryDto) {
    return this.core.portfolio.overlap(userId, await this.context(userId, query.asOf));
  }

  @Post('rebalance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Minimum trades to reach a target allocation, with tax and exit-load notes. Information, not advice.' })
  async rebalance(@UserId() userId: string, @Body() dto: RebalanceDto) {
    return this.core.portfolio.rebalance(userId, {
      ...(await this.context(userId, dto.asOf)),
      targets: dto.targets,
      driftBandPercent: dto.driftBandPercent,
    });
  }

  @Post('goal-projection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seeded Monte Carlo projection for each goal from the holdings mapped to it. An estimate, not advice.' })
  async goalProjection(@UserId() userId: string, @Body() dto: GoalProjectionDto) {
    return this.core.portfolio.goalProjection(userId, {
      ...(await this.context(userId, dto.asOf)),
      monthlyContributions: dto.monthlyContributions,
    });
  }

  private async context(userId: string, asOf?: string): Promise<{ asOf: string; currency: string }> {
    return { asOf: asOf ?? today(), currency: await baseCurrency(this.dataSource, userId) };
  }
}

@ApiTags('portfolio-imports')
@ApiBearerAuth()
@Controller('portfolio/imports')
export class PortfolioImportsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  async list(@UserId() userId: string) {
    return { items: (await this.core.portfolioImports.list(userId)).map(strip) };
  }

  @Post()
  @ApiOperation({
    summary: 'Upload a CAS PDF, broker CSV, AMFI NAV file, index series or fund disclosure',
    description: 'Transaction files land in review; reference files (NAV, index, disclosure) are applied straight away.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Max 15 MB' },
        source: { type: 'string', enum: ['CAS_PDF', 'BROKER_CSV', 'AMFI_NAV', 'BENCHMARK_CSV', 'FUND_DISCLOSURE_CSV'] },
        holdingId: { type: 'string', format: 'uuid' },
        series: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PORTFOLIO_IMPORT_BYTES, files: 1, fields: 5 } }))
  async upload(@UserId() userId: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadPortfolioImportDto) {
    if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'IMPORT_FILE_REQUIRED', 'Attach a statement file as "file"');
    const summary = await this.core.portfolioImports.upload(userId, {
      filename: file.originalname,
      bytes: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
      source: dto.source,
      holdingId: dto.holdingId,
      series: dto.series,
    });
    return presentImport(summary);
  }

  @Get(':id')
  async summary(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return presentImport(await this.core.portfolioImports.summary(userId, id));
  }

  @Patch(':id/rows/:rowId')
  @ApiOperation({ summary: 'Keep, skip, or point a parsed row at an existing holding' })
  async decide(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: ImportRowDecisionDto,
  ) {
    return strip(await this.core.portfolioImports.setRowDecision(userId, id, rowId, dto));
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Write the reviewed rows into your holdings' })
  async commit(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return presentImport(await this.core.portfolioImports.commit(userId, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.portfolioImports.delete(userId, id);
  }
}

function presentImport(summary: Awaited<ReturnType<FinanceCore['portfolioImports']['summary']>>) {
  return {
    batch: strip(summary.batch),
    counts: summary.counts,
    applied: summary.applied,
    rows: summary.rows.map(strip),
  };
}
