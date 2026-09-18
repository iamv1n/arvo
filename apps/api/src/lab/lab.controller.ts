import {
  DEFAULT_ASSUMPTIONS,
  FinanceCore,
  LAB_DISCLAIMER,
  MAX_BAR_IMPORT_BYTES,
  type MarketAssumptions,
  type StrategyLeg,
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
import { ApiError } from '../common/api-exception.filter';
import { UserId } from '../common/auth.decorators';
import {
  BacktestFilterDto,
  CreatePaperAccountDto,
  FuturesDto,
  ImpliedVolatilityDto,
  PayoffDto,
  PlacePaperOrderDto,
  RenamePaperAccountDto,
  RiskOfRuinDto,
  RunBacktestDto,
  SaveStrategyDto,
  SeriesFilterDto,
  SizingDto,
  StrategyLegDto,
  TemplateDto,
  UpdateStrategyDto,
  UploadBarsDto,
  type MarketAssumptionsDto,
} from './lab.dto';
import { parseStrategySpec } from './strategy-schema';

/*
 * The Strategy Lab over HTTP.
 *
 * Advice level 1–2: education and simulation. There is no endpoint here that places an order,
 * reaches a market, or returns a recommendation about a named security, and every response
 * carries a disclaimer saying so.
 *
 * Half of the surface is stateless — a payoff, a Greek, an implied volatility, a futures
 * calculation, a position size — and touches no storage at all. The rest is user-scoped like
 * everything else: a strategy, backtest, paper account or price series belonging to someone
 * else is reported as absent, never as forbidden.
 */

const strip = <T extends { userId: string }>({ userId: _userId, ...rest }: T) => rest;

/** The lab's own defaults, applied where the form left a field blank. */
const assumptionsOf = (dto: MarketAssumptionsDto): MarketAssumptions => ({
  spot: dto.spot,
  asOf: dto.asOf,
  riskFreeRatePercent: dto.riskFreeRatePercent ?? DEFAULT_ASSUMPTIONS.riskFreeRatePercent,
  dividendYieldPercent: dto.dividendYieldPercent ?? DEFAULT_ASSUMPTIONS.dividendYieldPercent,
  impliedVolatilityPercent: dto.impliedVolatilityPercent ?? DEFAULT_ASSUMPTIONS.impliedVolatilityPercent,
});

const legsOf = (dtos: StrategyLegDto[]): StrategyLeg[] =>
  dtos.map((leg) => ({
    kind: leg.kind,
    action: leg.action,
    lots: leg.lots,
    lotSize: leg.lotSize,
    strike: leg.strike ?? null,
    premium: leg.premium,
    expiry: leg.expiry ?? null,
    impliedVolatilityPercent: leg.impliedVolatilityPercent ?? null,
    label: leg.label ?? null,
  }));

@ApiTags('lab')
@ApiBearerAuth()
@Controller('lab')
export class LabController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  // ---- stateless computes ----

  @Post('payoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payoff, breakevens, extremes, Greeks and a margin estimate for a multi-leg structure',
    description: 'Stateless. Nothing is saved, nothing is ordered, and the margin figure is a labelled approximation.',
  })
  payoff(@Body() dto: PayoffDto) {
    return this.core.lab.payoff(legsOf(dto.legs), assumptionsOf(dto.assumptions), {
      margin: dto.margin
        ? {
            nakedPercentOfNotional: dto.margin.nakedPercentOfNotional ?? '15',
            hedgedPercentOfNotional: dto.margin.hedgedPercentOfNotional ?? '3',
          }
        : undefined,
    });
  }

  @Post('greeks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Per-leg and net Greeks, in trader units: theta per day, vega and rho per point' })
  greeks(@Body() dto: PayoffDto) {
    return this.core.lab.greeks(legsOf(dto.legs), assumptionsOf(dto.assumptions));
  }

  @Post('iv')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The volatility a quoted premium implies, by Newton guarded with bisection' })
  impliedVolatility(@Body() dto: ImpliedVolatilityDto) {
    return this.core.lab.impliedVolatility({
      spot: dto.spot,
      strike: dto.strike,
      expiry: dto.expiry,
      asOf: dto.asOf,
      right: dto.right,
      premium: dto.premium,
      riskFreeRatePercent: dto.riskFreeRatePercent ?? DEFAULT_ASSUMPTIONS.riskFreeRatePercent,
      dividendYieldPercent: dto.dividendYieldPercent ?? DEFAULT_ASSUMPTIONS.dividendYieldPercent,
    });
  }

  @Get('templates')
  @ApiOperation({ summary: 'The prebuilt structures the payoff builder offers' })
  templates() {
    return this.core.lab.templates();
  }

  @Post('templates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Builds a named structure, with theoretical premiums so the chart has a starting point' })
  buildTemplate(@Body() dto: TemplateDto) {
    return this.core.lab.template({
      template: dto.template,
      spot: dto.spot,
      strikeStep: dto.strikeStep,
      lotSize: dto.lotSize,
      lots: dto.lots ?? 1,
      expiry: dto.expiry,
      farExpiry: dto.farExpiry ?? null,
      asOf: dto.asOf,
      impliedVolatilityPercent: dto.impliedVolatilityPercent ?? DEFAULT_ASSUMPTIONS.impliedVolatilityPercent,
      riskFreeRatePercent: dto.riskFreeRatePercent,
      dividendYieldPercent: dto.dividendYieldPercent,
    });
  }

  @Post('futures')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Notional, MTM, basis and the cost of rolling, with charges from the statutory table' })
  futures(@UserId() userId: string, @Body() dto: FuturesDto) {
    return this.core.lab.futures(userId, {
      underlying: dto.underlying.toUpperCase(),
      segment: dto.segment ?? 'INDEX_FUTURES',
      exchange: dto.exchange ?? 'NFO',
      date: dto.date,
      lots: dto.lots,
      lotSize: dto.lotSize,
      futuresPrice: dto.futuresPrice,
      spot: dto.spot,
      side: dto.side ?? 'BUY',
      expiry: dto.expiry ?? null,
      markPrice: dto.markPrice ?? null,
      marginPercentOfNotional: dto.marginPercentOfNotional ?? '12',
      rollover: dto.rollover ?? null,
    });
  }

  @Post('sizing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fixed-fractional or fixed-risk position size from a stop distance' })
  sizing(@Body() dto: SizingDto) {
    return this.core.lab.sizing({
      capital: dto.capital,
      riskPercent: dto.riskPercent ?? '1',
      riskAmount: dto.riskAmount ?? null,
      entryPrice: dto.entryPrice,
      stopPrice: dto.stopPrice,
      lotSize: dto.lotSize ?? 1,
      targetPrice: dto.targetPrice ?? null,
    });
  }

  @Post('risk-of-ruin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Risk of ruin for a fixed-fractional trader, with a fractional Kelly explainer' })
  riskOfRuin(@Body() dto: RiskOfRuinDto) {
    return this.core.lab.riskOfRuin({
      winRatePercent: dto.winRatePercent,
      payoffRatio: dto.payoffRatio,
      riskPercent: dto.riskPercent,
      ruinDrawdownPercent: dto.ruinDrawdownPercent ?? '100',
    });
  }

  // ---- library ----

  @Get('library')
  @ApiOperation({ summary: 'The explainer index: how each structure works, when it fails, and a worked example' })
  library() {
    return this.core.lab.library();
  }

  @Get('library/:slug')
  @ApiOperation({ summary: 'One explainer, as markdown' })
  libraryEntry(@Param('slug') slug: string) {
    return this.core.lab.library(slug);
  }

  // ---- saved strategies ----

  @Get('strategies')
  async listStrategies(@UserId() userId: string) {
    return { items: (await this.core.lab.listStrategies(userId)).map(strip) };
  }

  @Post('strategies')
  async createStrategy(@UserId() userId: string, @Body() dto: SaveStrategyDto) {
    const created = await this.core.lab.createStrategy(userId, {
      name: dto.name,
      description: dto.description ?? null,
      spec: parseStrategySpec(dto.spec),
    });
    return strip(created);
  }

  @Get('strategies/:id')
  async strategy(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return strip(await this.core.lab.requireStrategy(userId, id));
  }

  @Patch('strategies/:id')
  async updateStrategy(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStrategyDto) {
    const updated = await this.core.lab.updateStrategy(userId, id, {
      name: dto.name,
      description: dto.description,
      spec: dto.spec === undefined ? undefined : parseStrategySpec(dto.spec),
    });
    return strip(updated);
  }

  @Delete('strategies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStrategy(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.lab.deleteStrategy(userId, id);
  }

  // ---- backtests ----

  @Post('backtests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Runs a strategy over your imported bars',
    description:
      'Bounded at 200,000 bars and fifteen seconds of wall clock, checked inside the loop, so a run cannot occupy a request thread indefinitely. Deterministic: the same spec over the same bars gives exactly the same numbers.',
  })
  async runBacktest(@UserId() userId: string, @Body() dto: RunBacktestDto) {
    if (!dto.strategyId && !dto.spec) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'LAB_SPEC_REQUIRED', 'Give either a saved strategyId or a spec to run');
    }
    const { result, record } = await this.core.lab.runBacktest(userId, {
      strategyId: dto.strategyId,
      spec: dto.spec ? parseStrategySpec(dto.spec) : undefined,
      from: dto.from,
      to: dto.to,
      walkForwardSplit: dto.walkForwardSplit ?? null,
      save: dto.save,
    });
    return { id: record?.id ?? null, result };
  }

  @Get('backtests')
  async listBacktests(@UserId() userId: string, @Query() query: BacktestFilterDto) {
    return { items: await this.core.lab.listBacktests(userId, query.strategyId), disclaimer: LAB_DISCLAIMER };
  }

  @Get('backtests/:id')
  async backtest(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return strip(await this.core.lab.requireBacktest(userId, id));
  }

  @Delete('backtests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBacktest(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.lab.deleteBacktest(userId, id);
  }

  // ---- market data ----

  @Get('market-data')
  @ApiOperation({ summary: 'The price series you have imported' })
  async series(@UserId() userId: string) {
    return this.core.lab.listSeries(userId);
  }

  @Delete('market-data')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Removes every bar of one symbol and timeframe' })
  async deleteSeries(@UserId() userId: string, @Query() query: SeriesFilterDto) {
    await this.core.lab.deleteSeries(userId, query.symbol, query.timeframe);
  }

  @Get('market-data/imports')
  async listBarImports(@UserId() userId: string) {
    return { items: (await this.core.lab.listBarImports(userId)).map(strip) };
  }

  @Post('market-data/imports')
  @ApiOperation({
    summary: 'Upload an OHLCV CSV or XLSX for review',
    description: 'The file is parsed and held; nothing reaches the bar table until you commit. No network is involved at any point.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Max 25 MB' },
        symbol: { type: 'string', description: 'Overrides the symbol found in the file' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BAR_IMPORT_BYTES, files: 1, fields: 4 } }))
  async uploadBars(@UserId() userId: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadBarsDto) {
    if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'IMPORT_FILE_REQUIRED', 'Attach a price file as "file"');
    const batch = await this.core.lab.uploadBars(userId, {
      filename: file.originalname,
      bytes: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
      symbol: dto.symbol,
    });
    return strip({ ...batch, parsed: [] });
  }

  @Get('market-data/imports/:id')
  @ApiOperation({ summary: 'The review screen: what was read, with the first and last twenty bars' })
  async previewBarImport(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const { batch, head, tail } = await this.core.lab.previewBarImport(userId, id);
    return { batch: strip(batch), head, tail };
  }

  @Post('market-data/imports/:id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Writes the reviewed bars into your price store; re-importing an overlap is a no-op' })
  async commitBarImport(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const { batch, inserted } = await this.core.lab.commitBarImport(userId, id);
    return { batch: strip(batch), inserted };
  }

  @Delete('market-data/imports/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBarImport(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.lab.deleteBarImport(userId, id);
  }

  // ---- paper trading ----

  @Get('paper')
  async listPaperAccounts(@UserId() userId: string) {
    return { items: (await this.core.lab.listPaperAccounts(userId)).map(strip), disclaimer: LAB_DISCLAIMER };
  }

  @Post('paper')
  @ApiOperation({ summary: 'Opens a simulated account. It has no connection to any broker and can never place a live order.' })
  async createPaperAccount(@UserId() userId: string, @Body() dto: CreatePaperAccountDto) {
    return strip(await this.core.lab.createPaperAccount(userId, dto));
  }

  @Get('paper/:id')
  @ApiOperation({ summary: 'Positions, orders and P&L after charges for one paper account' })
  async paperAccount(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const view = await this.core.lab.paperAccount(userId, id);
    return { ...view, account: strip(view.account), orders: view.orders.map(strip) };
  }

  @Patch('paper/:id')
  async renamePaperAccount(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RenamePaperAccountDto) {
    return strip(await this.core.lab.renamePaperAccount(userId, id, dto.name));
  }

  @Delete('paper/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePaperAccount(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.lab.deletePaperAccount(userId, id);
  }

  @Post('paper/:id/orders')
  @ApiOperation({
    summary: 'Places a simulated order against your imported bars',
    description:
      'A market order fills at the open of the first bar after the moment you placed it; a limit order waits for a bar that reaches its price. An order with no bar to fill against stays pending rather than filling at a made-up price. The fill is written into the trading journal marked as paper, so it never affects your real metrics.',
  })
  async placePaperOrder(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlacePaperOrderDto) {
    return strip(
      await this.core.lab.placePaperOrder(userId, id, {
        symbol: dto.symbol,
        timeframe: dto.timeframe ?? 'DAY',
        side: dto.side,
        quantity: dto.quantity,
        orderType: dto.orderType ?? 'MARKET',
        limitPrice: dto.limitPrice ?? null,
        placedDate: dto.placedDate,
        placedTime: dto.placedTime ?? null,
        exchange: dto.exchange ?? 'NSE',
        lotSize: dto.lotSize ?? 1,
      }),
    );
  }

  @Delete('paper/orders/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancels a pending simulated order' })
  async cancelPaperOrder(@UserId() userId: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return strip(await this.core.lab.cancelPaperOrder(userId, orderId));
  }
}
