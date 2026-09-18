import {
  FinanceCore,
  MAX_ATTACHMENT_BYTES,
  MAX_TRADE_IMPORT_BYTES,
  MISTAKE_CHECKLIST,
  TRADING_DISCLAIMER,
  itr3Rows,
  type TradePosition,
} from '@arvo/finance-core';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiError } from '../common/api-exception.filter';
import { UserId } from '../common/auth.decorators';
import { today } from '../planning/planning.controller';
import {
  AsOfFilterDto,
  AsOfQueryDto,
  CreateTradeDto,
  ImportRowDecisionDto,
  JournalEntryDto,
  TaxQueryDto,
  TradeFilterDto,
  TradingSettingsDto,
  UploadTradeImportDto,
} from './trading.dto';

/*
 * The trading journal over HTTP.
 *
 * Every read takes an `asOf` so a report can be re-opened months later and still say the same
 * thing, and everything is user-scoped by the guard — a position id belonging to someone else
 * is reported as absent, never as forbidden.
 *
 * Level 0–1: this describes trades the user has already made. Nothing here suggests one.
 */

const strip = <T extends { userId: string }>({ userId: _u, ...rest }: T) => rest;

/** The position shape the UI drills into. */
const presentPosition = (position: TradePosition) => strip(position);

@ApiTags('trades')
@ApiBearerAuth()
@Controller('trades')
export class TradesController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOperation({ summary: 'Every fill, in fill order, with its charges' })
  async list(@UserId() userId: string, @Query() query: TradeFilterDto) {
    const items = await this.core.trading.listTrades(userId, query);
    return { items: items.map(strip), brokers: await this.core.trading.listBrokers(userId) };
  }

  @Post()
  @ApiOperation({ summary: 'Record a fill by hand; charges are estimated unless you supply them' })
  async create(@UserId() userId: string, @Body() dto: CreateTradeDto) {
    return strip(await this.core.trading.createTrade(userId, dto));
  }

  @Get(':id')
  async detail(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return strip(await this.core.trading.requireTrade(userId, id));
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTradeDto) {
    return strip(await this.core.trading.updateTrade(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.trading.deleteTrade(userId, id);
  }
}

@ApiTags('trade-imports')
@ApiBearerAuth()
@Controller('trades/imports')
export class TradeImportsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  async list(@UserId() userId: string) {
    return { items: (await this.core.tradeImports.list(userId)).map(strip) };
  }

  @Post()
  @ApiOperation({
    summary: 'Upload a tradebook or P&L CSV, or a text contract note PDF',
    description: 'Rows land in review with duplicates already marked; nothing reaches the journal until you commit.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Max 15 MB' },
        source: { type: 'string', enum: ['TRADEBOOK_CSV', 'PNL_CSV', 'CONTRACT_NOTE_PDF'] },
        broker: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_TRADE_IMPORT_BYTES, files: 1, fields: 5 } }))
  async upload(@UserId() userId: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadTradeImportDto) {
    if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'IMPORT_FILE_REQUIRED', 'Attach a tradebook file as "file"');
    const summary = await this.core.tradeImports.upload(userId, {
      filename: file.originalname,
      bytes: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
      source: dto.source,
      broker: dto.broker,
    });
    return presentImport(summary);
  }

  @Get(':id')
  async summary(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return presentImport(await this.core.tradeImports.summary(userId, id));
  }

  @Patch(':id/rows/:rowId')
  @ApiOperation({ summary: 'Keep or skip a parsed fill' })
  async decide(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: ImportRowDecisionDto,
  ) {
    return presentImport(await this.core.tradeImports.decideRow(userId, id, rowId, dto.include));
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Write the reviewed fills into the journal, with charges settled per order' })
  async commit(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return presentImport(await this.core.tradeImports.commit(userId, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.tradeImports.delete(userId, id);
  }
}

@ApiTags('positions')
@ApiBearerAuth()
@Controller('positions')
export class PositionsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOperation({ summary: 'Round trips rebuilt from your fills by FIFO matching, newest first' })
  async list(@UserId() userId: string, @Query() query: AsOfFilterDto) {
    const { asOf, ...filter } = query;
    const result = await this.core.trading.positions(userId, asOf ?? today(), filter);
    return {
      asOf: asOf ?? today(),
      items: result.positions.map(presentPosition),
      openCount: result.open.length,
      closedCount: result.closed.length,
      warnings: result.warnings,
      disclaimer: TRADING_DISCLAIMER,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One round trip: entries, exits, charge breakdown and its journal entry' })
  async detail(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Query() query: AsOfQueryDto) {
    const { position, journal } = await this.core.trading.position(userId, query.asOf ?? today(), id);
    return { position: presentPosition(position), journal: journal ? strip(journal) : null, mistakeChecklist: MISTAKE_CHECKLIST };
  }
}

@ApiTags('trading')
@ApiBearerAuth()
@Controller('trading')
export class TradingController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Win rate, expectancy, profit factor, drawdown and the edge breakdowns' })
  async metrics(@UserId() userId: string, @Query() query: AsOfFilterDto) {
    const { asOf, ...filter } = query;
    const metrics = await this.core.trading.metrics(userId, asOf ?? today(), filter);
    return { ...metrics, disclaimer: TRADING_DISCLAIMER };
  }

  @Get('behaviour')
  @ApiOperation({ summary: 'Patterns in how you traded, each with the fills it was derived from' })
  async behaviour(@UserId() userId: string, @Query() query: AsOfFilterDto) {
    const { asOf, ...filter } = query;
    return { ...(await this.core.trading.behaviour(userId, asOf ?? today(), filter)), disclaimer: TRADING_DISCLAIMER };
  }

  @Get('reality-check')
  @ApiOperation({ summary: 'Each year’s F&O and intraday result against an index or a deposit. An estimate.' })
  async realityCheck(@UserId() userId: string, @Query() query: AsOfQueryDto) {
    return this.core.trading.realityCheck(userId, query.asOf ?? today());
  }

  @Get('tax')
  @ApiOperation({ summary: 'Speculative, non-speculative and capital gains for a financial year, with turnover' })
  async tax(@UserId() userId: string, @Query() query: TaxQueryDto) {
    const asOf = query.asOf ?? today();
    const years = await this.core.trading.financialYears(userId, asOf);
    const financialYear = query.fy ?? years[0] ?? financialYearOf(asOf);
    return { ...(await this.core.trading.tax(userId, asOf, financialYear)), availableYears: years };
  }

  @Get('exports/itr3')
  @ApiOperation({ summary: 'The ITR-3 helper worksheet as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async itr3(@UserId() userId: string, @Query() query: TaxQueryDto, @Res({ passthrough: true }) response: Response) {
    const asOf = query.asOf ?? today();
    const years = await this.core.trading.financialYears(userId, asOf);
    const financialYear = query.fy ?? years[0] ?? financialYearOf(asOf);
    const summary = await this.core.trading.tax(userId, asOf, financialYear);
    response.setHeader('Content-Disposition', `attachment; filename="arvo-itr3-${financialYear}.csv"`);
    return toCsv([
      ['Section', 'Item', 'Amount', 'Note'],
      ...itr3Rows(summary).map((row) => [row.section, row.item, row.amount, row.note]),
      [],
      ['Charges summary', '', '', ''],
      ['Brokerage', '', summary.chargesSummary.brokerage, ''],
      ['STT / CTT', '', summary.chargesSummary.stt, ''],
      ['Exchange transaction charges', '', summary.chargesSummary.exchangeCharges, ''],
      ['SEBI turnover fee', '', summary.chargesSummary.sebiCharges, ''],
      ['Stamp duty', '', summary.chargesSummary.stampDuty, ''],
      ['GST', '', summary.chargesSummary.gst, ''],
      ['DP charges', '', summary.chargesSummary.dpCharges, ''],
      ['Other', '', summary.chargesSummary.otherCharges, ''],
      ['Total charges', '', summary.chargesSummary.total, ''],
      ['Deductible against business income', '', summary.chargesSummary.deductibleAgainstBusiness, 'Excludes charges on delivery trades'],
      [],
      ['', '', '', summary.disclaimer],
    ]);
  }

  @Get('journal/:positionId')
  async journal(@UserId() userId: string, @Param('positionId', ParseUUIDPipe) positionId: string) {
    const entry = await this.core.trading.journal(userId, positionId);
    return { entry: entry ? strip(entry) : null, mistakeChecklist: MISTAKE_CHECKLIST };
  }

  @Put('journal/:positionId')
  @ApiOperation({ summary: 'Notes, setup and emotion tags, the mistakes checklist and the stop you used' })
  async saveJournal(@UserId() userId: string, @Param('positionId', ParseUUIDPipe) positionId: string, @Body() dto: JournalEntryDto) {
    return strip(await this.core.trading.saveJournal(userId, positionId, dto));
  }

  @Post('journal/:positionId/screenshots')
  @ApiOperation({ summary: 'Attach a screenshot, stored on this machine only' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'PNG, JPEG or WebP, max 5 MB' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  async addScreenshot(
    @UserId() userId: string,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Attach an image as "file"');
    const entry = await this.core.trading.addAttachment(userId, positionId, {
      filename: file.originalname,
      mimeType: file.mimetype,
      bytes: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
    });
    return strip(entry);
  }

  @Get('journal/:positionId/screenshots/:name')
  @ApiOperation({ summary: 'Read back a screenshot from local storage' })
  async screenshot(
    @UserId() userId: string,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Param('name') name: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.core.trading.readAttachment(userId, positionId, `${userId}/${name}`);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/["\r\n]/g, '')}"`);
    return Buffer.from(file.bytes);
  }

  @Delete('journal/:positionId/screenshots/:name')
  async deleteScreenshot(@UserId() userId: string, @Param('positionId', ParseUUIDPipe) positionId: string, @Param('name') name: string) {
    return strip(await this.core.trading.removeAttachment(userId, positionId, `${userId}/${name}`));
  }

  @Get('settings')
  async settings(@UserId() userId: string) {
    return strip(await this.core.trading.settings(userId));
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Broker plans and the thresholds the behaviour flags use' })
  async saveSettings(@UserId() userId: string, @Body() dto: TradingSettingsDto) {
    return strip(await this.core.trading.saveSettings(userId, dto));
  }
}

function presentImport(summary: Awaited<ReturnType<FinanceCore['tradeImports']['summary']>>) {
  return { batch: strip(summary.batch), counts: summary.counts, rows: summary.rows.map(strip) };
}

/** The Indian financial year a date falls in, e.g. "2025-26". */
function financialYearOf(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)).join(',')).join('\n');
}
