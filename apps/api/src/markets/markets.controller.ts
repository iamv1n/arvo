import { FinanceCore, MARKETS_DISCLAIMER, describeAlert } from '@arvo/finance-core';
import { MAX_CALENDAR_BYTES, parseCorporateActionsFile, parseHolidaysFile, parseIposFile } from '@arvo/imports';
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
import { AlertsScheduler } from './alerts.scheduler';
import {
  BuildDigestDto,
  CorporateActionDto,
  CreateAlertDto,
  CreateFeedDto,
  CreateWatchlistDto,
  CreateWatchlistItemDto,
  DateRangeDto,
  HolidayImportDto,
  IpoDto,
  MarkReadDto,
  RefreshQuotesDto,
  ReorderDto,
  SetQuoteDto,
  UpdateAlertDto,
  UpdateFeedDto,
  UpdateNotificationSettingsDto,
  UpdateWatchlistDto,
  UpdateWatchlistItemDto,
  alertParamsOf,
} from './markets.dto';
import { NewsService } from './news.service';

/*
 * Markets & Alerts over HTTP.
 *
 * Advice level 3 and no further. Every rule evaluated here was written by the user; there is no
 * endpoint that ranks instruments, scores an opportunity or suggests a trade, and the responses
 * that could be mistaken for one carry the disclaimer saying they are not.
 *
 * Everything is user-scoped like the rest of the API: a watchlist, alert or calendar entry
 * belonging to someone else is reported as absent, never as forbidden.
 */

const strip = <T extends { userId: string }>({ userId: _userId, ...rest }: T) => rest;

const today = (): string => new Date().toISOString().slice(0, 10);

const shift = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Attach a CSV or XLSX file');
  if (file.size > MAX_CALENDAR_BYTES) throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE', 'That calendar file is too large');
  return file;
}

@ApiTags('markets')
@ApiBearerAuth()
@Controller('watchlists')
export class WatchlistsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOperation({ summary: 'The user’s watchlists, in their own order' })
  async list(@UserId() userId: string) {
    return { watchlists: (await this.core.markets.listWatchlists(userId)).map(strip), disclaimer: MARKETS_DISCLAIMER };
  }

  @Post()
  async create(@UserId() userId: string, @Body() dto: CreateWatchlistDto) {
    return strip(await this.core.markets.createWatchlist(userId, dto));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'A watchlist with last prices, day change, 52-week range and the user’s own position',
    description: 'Prices come from the user’s entries, imported bars and any configured provider. A stale row says so rather than pretending.',
  })
  view(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Query() query: DateRangeDto) {
    return this.core.markets.watchlistView(userId, id, { asOf: query.to ?? today(), currency: 'INR' });
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWatchlistDto) {
    return strip(await this.core.markets.updateWatchlist(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.markets.deleteWatchlist(userId, id);
  }

  @Post(':id/items')
  async addItem(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateWatchlistItemDto) {
    return strip(await this.core.markets.addItem(userId, id, dto));
  }

  @Post(':id/items/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Applies an explicit order to a list’s rows' })
  async reorder(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) {
    return { items: (await this.core.markets.reorderItems(userId, id, dto.ids)).map(strip) };
  }

  @Patch('items/:itemId')
  async updateItem(@UserId() userId: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: UpdateWatchlistItemDto) {
    return strip(await this.core.markets.updateItem(userId, itemId, dto));
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(@UserId() userId: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    await this.core.markets.deleteItem(userId, itemId);
  }
}

@ApiTags('markets')
@ApiBearerAuth()
@Controller('market')
export class MarketController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(NewsService) private readonly news: NewsService,
  ) {}

  // ---- quotes ----

  @Get('quotes')
  @ApiOperation({ summary: 'Last known price per instrument, with where it came from and when' })
  async quotes(@UserId() userId: string) {
    const settings = await this.core.markets.settings(userId);
    return {
      quotes: (await this.core.markets.listQuotes(userId)).map(strip),
      driver: this.core.markets.quoteDriver,
      staleMinutes: settings.staleQuoteMinutes,
    };
  }

  @Post('quotes')
  @ApiOperation({ summary: 'Records a price the user entered by hand' })
  async setQuote(@UserId() userId: string, @Body() dto: SetQuoteDto) {
    return strip(await this.core.markets.setQuote(userId, dto));
  }

  @Post('quotes/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refreshes prices from local sources and any configured provider',
    description: 'Never reaches a network unless MARKET_DATA_DRIVER is configured. A provider failure leaves the last known prices in place and says so.',
  })
  async refresh(@UserId() userId: string, @Body() dto: RefreshQuotesDto) {
    const result = await this.core.markets.refreshQuotes(userId, { asOf: dto.asOf ?? today(), force: dto.force });
    return { ...result, quotes: result.quotes.map(strip) };
  }

  @Delete('quotes/:symbol')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteQuote(@UserId() userId: string, @Param('symbol') symbol: string) {
    await this.core.markets.deleteQuote(userId, symbol, null);
  }

  // ---- calendars ----

  @Get('calendars/events')
  @ApiOperation({ summary: 'Expiries, corporate actions and IPOs merged into one dated list' })
  async events(@UserId() userId: string, @Query() query: DateRangeDto) {
    const from = query.from ?? today();
    return { events: await this.core.markets.upcomingEvents(userId, { from, to: query.to ?? shift(from, 60) }), disclaimer: MARKETS_DISCLAIMER };
  }

  @Get('calendars/expiries')
  @ApiOperation({
    summary: 'F&O expiries computed from the configured rules and the imported holiday list',
    description: 'Deterministic: the same rules and holidays always give the same dates. Weekday is configurable per index because exchanges move it.',
  })
  async expiries(@UserId() userId: string, @Query() query: DateRangeDto) {
    const from = query.from ?? today();
    const settings = await this.core.markets.settings(userId);
    return { expiries: await this.core.markets.expiries(userId, { from, to: query.to ?? shift(from, 90) }), rules: settings.expiryRules };
  }

  @Get('calendars/corporate-actions')
  async corporateActions(@UserId() userId: string, @Query() query: DateRangeDto) {
    return { actions: (await this.core.markets.listCorporateActions(userId, query)).map(strip) };
  }

  @Post('calendars/corporate-actions')
  async createCorporateAction(@UserId() userId: string, @Body() dto: CorporateActionDto) {
    return strip(
      await this.core.markets.createCorporateAction(userId, {
        symbol: dto.symbol,
        name: dto.name ?? null,
        kind: dto.kind,
        exDate: dto.exDate,
        recordDate: dto.recordDate ?? null,
        payDate: dto.payDate ?? null,
        amount: dto.amount ?? null,
        ratio: dto.ratio ?? null,
        notes: dto.notes ?? null,
      }),
    );
  }

  @Patch('calendars/corporate-actions/:id')
  async updateCorporateAction(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CorporateActionDto) {
    return strip(await this.core.markets.updateCorporateAction(userId, id, dto));
  }

  @Delete('calendars/corporate-actions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCorporateAction(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.markets.deleteCorporateAction(userId, id);
  }

  @Post('calendars/corporate-actions/import')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Imports corporate actions from a CSV or XLSX exchange export. Nothing is fetched.' })
  async importCorporateActions(@UserId() userId: string, @UploadedFile() file?: Express.Multer.File) {
    const upload = requireFile(file);
    const { rows, warnings } = await parseCorporateActionsFile(upload.buffer, upload.originalname);
    return { imported: await this.core.markets.importCorporateActions(userId, rows), parsed: rows.length, warnings };
  }

  @Get('calendars/holidays')
  async holidays(@UserId() userId: string, @Query('exchange') exchange?: string) {
    return { holidays: await this.core.markets.listHolidays(userId, exchange) };
  }

  @Post('calendars/holidays/import')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, exchange: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Replaces the trading holidays for one exchange',
    description: 'Replacing rather than merging is deliberate: a day the exchange withdrew must disappear, or every expiry after it shifts for ever.',
  })
  async importHolidays(@UserId() userId: string, @Body() dto: HolidayImportDto, @UploadedFile() file?: Express.Multer.File) {
    const upload = requireFile(file);
    const { rows, warnings } = await parseHolidaysFile(upload.buffer, upload.originalname);
    return { imported: await this.core.markets.replaceHolidays(userId, dto.exchange ?? 'NSE', rows), parsed: rows.length, warnings };
  }

  @Get('calendars/ipos')
  async ipos(@UserId() userId: string) {
    return { ipos: (await this.core.markets.listIpos(userId)).map(strip) };
  }

  @Post('calendars/ipos')
  async createIpo(@UserId() userId: string, @Body() dto: IpoDto) {
    return strip(
      await this.core.markets.createIpo(userId, {
        name: dto.name,
        symbol: dto.symbol ?? null,
        openDate: dto.openDate ?? null,
        closeDate: dto.closeDate ?? null,
        priceBandLow: dto.priceBandLow ?? null,
        priceBandHigh: dto.priceBandHigh ?? null,
        lotSize: dto.lotSize ?? null,
        listingDate: dto.listingDate ?? null,
        status: dto.status ?? 'UPCOMING',
        notes: dto.notes ?? null,
      }),
    );
  }

  @Patch('calendars/ipos/:id')
  async updateIpo(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IpoDto) {
    return strip(await this.core.markets.updateIpo(userId, id, dto));
  }

  @Delete('calendars/ipos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIpo(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.markets.deleteIpo(userId, id);
  }

  @Post('calendars/ipos/import')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async importIpos(@UserId() userId: string, @UploadedFile() file?: Express.Multer.File) {
    const upload = requireFile(file);
    const { rows, warnings } = await parseIposFile(upload.buffer, upload.originalname);
    return { imported: await this.core.markets.importIpos(userId, rows), parsed: rows.length, warnings };
  }

  // ---- guardrails ----

  @Get('cool-off')
  @ApiOperation({
    summary: 'Whether the user’s own trading limits are breached today or this week',
    description: 'Informational. Nothing here blocks an action; the banner it drives is a note from the user to themselves.',
  })
  coolOff(@UserId() userId: string, @Query('asOf') asOf?: string) {
    return this.core.markets.coolOff(userId, asOf ?? today());
  }

  // ---- news ----

  @Get('news/status')
  status(@UserId() userId: string) {
    return this.news.status(userId);
  }

  @Get('news/feeds')
  async feeds(@UserId() userId: string) {
    return { feeds: (await this.core.markets.listFeeds(userId)).map(strip) };
  }

  @Post('news/feeds')
  async addFeed(@UserId() userId: string, @Body() dto: CreateFeedDto) {
    return strip(await this.core.markets.addFeed(userId, dto));
  }

  @Patch('news/feeds/:id')
  async updateFeed(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeedDto) {
    return strip(await this.core.markets.updateFeed(userId, id, dto));
  }

  @Delete('news/feeds/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFeed(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.markets.deleteFeed(userId, id);
  }

  @Get('news/digests')
  async digests(@UserId() userId: string) {
    return { digests: (await this.core.markets.listDigests(userId)).map(strip) };
  }

  @Post('news/digests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Builds a digest from the user’s own feeds, for holdings and watchlist instruments only',
    description: 'Requires NEWS_DIGEST_ENABLED. With AI_PROVIDER=none the headlines are stored unsummarised rather than the feature disappearing.',
  })
  async buildDigest(@UserId() userId: string, @Body() dto: BuildDigestDto) {
    const end = dto.periodEnd ?? today();
    return strip(await this.news.build(userId, { periodStart: dto.periodStart ?? shift(end, -7), periodEnd: end }));
  }

  @Delete('news/digests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDigest(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.markets.deleteDigest(userId, id);
  }
}

@ApiTags('markets')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(AlertsScheduler) private readonly scheduler: AlertsScheduler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every alert the user has written, with its status and plain-language rule' })
  async list(@UserId() userId: string) {
    const alerts = await this.core.markets.listAlerts(userId);
    return {
      alerts: alerts.map((alert) => ({ ...strip(alert), rule: describeAlert(alert.name, alert.params, alert.repeats) })),
      disclaimer: MARKETS_DISCLAIMER,
    };
  }

  @Post()
  async create(@UserId() userId: string, @Body() dto: CreateAlertDto) {
    const alert = await this.core.markets.createAlert(userId, {
      name: dto.name,
      kind: dto.kind,
      params: alertParamsOf(dto.kind, dto.params),
      isEnabled: dto.isEnabled ?? true,
      cooldownMinutes: dto.cooldownMinutes ?? 1440,
      repeats: dto.repeats ?? false,
      channels: dto.channels ?? ['IN_APP'],
    });
    return { ...strip(alert), rule: describeAlert(alert.name, alert.params, alert.repeats) };
  }

  @Get(':id')
  async find(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const alert = await this.core.markets.requireAlert(userId, id);
    return {
      ...strip(alert),
      rule: describeAlert(alert.name, alert.params, alert.repeats),
      triggers: (await this.core.markets.listTriggers(userId, id)).map(strip),
    };
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlertDto) {
    const existing = await this.core.markets.requireAlert(userId, id);
    const alert = await this.core.markets.updateAlert(userId, id, {
      ...dto,
      params: dto.params ? alertParamsOf(existing.kind, dto.params) : undefined,
    });
    return { ...strip(alert), rule: describeAlert(alert.name, alert.params, alert.repeats) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.markets.deleteAlert(userId, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluates one alert without firing it',
    description: 'Ignores cooldown and the enabled flag so the user can see what the rule would say right now. Notifies nobody and records nothing.',
  })
  test(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.core.markets.testAlert(userId, id);
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluates every alert of the signed-in user now',
    description: 'Idempotent inside each alert’s cooldown, and a market-dependent alert on stale data records "skipped" rather than firing.',
  })
  async evaluate(@UserId() userId: string) {
    const results = await this.core.markets.evaluateUser(userId);
    return { evaluated: results.length, fired: results.filter((r) => r.fired).length, results };
  }

  @Post('evaluate/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Runs the scheduler’s pass once, for this install. Used by the “evaluate now” button and by tests.' })
  run() {
    return this.scheduler.run();
  }

  @Get(':id/triggers')
  async triggers(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { triggers: (await this.core.markets.listTriggers(userId, id)).map(strip) };
  }
}

@ApiTags('markets')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get('notifications')
  async list(@UserId() userId: string, @Query('unreadOnly') unreadOnly?: string, @Query('limit') limit?: string) {
    const notifications = await this.core.markets.listNotifications(userId, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? Math.min(Math.max(Number(limit) || 50, 1), 200) : 50,
    });
    return { notifications: notifications.map(strip), unread: await this.core.markets.unreadCount(userId) };
  }

  @Get('notifications/unread-count')
  async unread(@UserId() userId: string) {
    return { unread: await this.core.markets.unreadCount(userId) };
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marks the given notifications read, or everything when no ids are given' })
  async markRead(@UserId() userId: string, @Body() dto: MarkReadDto) {
    const marked = dto.ids?.length ? await this.core.markets.markRead(userId, dto.ids) : await this.core.markets.markAllRead(userId);
    return { marked, unread: await this.core.markets.unreadCount(userId) };
  }

  @Get('me/notification-settings')
  async settings(@UserId() userId: string) {
    return strip(await this.core.markets.settings(userId));
  }

  @Patch('me/notification-settings')
  async updateSettings(@UserId() userId: string, @Body() dto: UpdateNotificationSettingsDto) {
    return strip(await this.core.markets.saveSettings(userId, dto));
  }
}
