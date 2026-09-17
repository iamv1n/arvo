import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsIn, IsObject, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import type { Request, Response } from 'express';
import { ApiError } from '../common/api-exception.filter';
import { Public, UserId } from '../common/auth.decorators';
import { page, UnsubscribeQueryDto } from '../reminders/reminders.controller';
import { AdvisorProviders } from './advisor-providers';
import { AdvisorService, type AdvisorStreamEvent } from './advisor.service';
import { BriefingsService } from './briefings.service';
import { SuggestionsService } from './suggestions.service';

class CreateConversationDto {
  @ApiPropertyOptional({ example: 'Spending less' }) @IsOptional() @IsString() @Length(1, 120) title?: string;
}

class SendMessageDto {
  @ApiProperty({ example: 'How can I spend ₹5,000 less a month?' }) @IsString() @Length(1, 4000) content!: string;
}

class SuggestionQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'approved', 'dismissed', 'all'], default: 'pending' })
  @IsOptional()
  @IsIn(['pending', 'approved', 'dismissed', 'all'])
  status?: 'pending' | 'approved' | 'dismissed' | 'all';
}

class ApproveSuggestionDto {
  @ApiPropertyOptional({ description: 'Edited payload; validated again before it is applied' }) @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

class AdvisorSettingsDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Provider override; null uses the install default' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['anthropic', 'openai', 'gemini', 'ollama', 'fake'])
  provider?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'claude-sonnet-5' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  model?: string | null;
}

/** Rate limit for model calls per user address. */
const ASK_LIMIT = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('advisor')
@Controller('advisor')
export class AdvisorController {
  constructor(
    @Inject(AdvisorService) private readonly advisor: AdvisorService,
    @Inject(AdvisorProviders) private readonly providers: AdvisorProviders,
    @Inject(SuggestionsService) private readonly suggestions: SuggestionsService,
    @Inject(BriefingsService) private readonly briefings: BriefingsService,
  ) {}

  @ApiBearerAuth()
  @Get('status')
  @ApiOperation({ summary: 'Whether the advisor is enabled, the active provider and model, advice level and configured providers' })
  status(@UserId() userId: string) {
    return this.providers.status(userId);
  }

  @ApiBearerAuth()
  @Patch('settings')
  @ApiOperation({ summary: 'Per-user provider and model override (limited to providers configured on this install)' })
  settings(@UserId() userId: string, @Body() dto: AdvisorSettingsDto) {
    return this.providers.updateOverride(userId, dto);
  }

  @ApiBearerAuth()
  @Get('conversations')
  list(@UserId() userId: string) {
    return this.advisor.list(userId);
  }

  @ApiBearerAuth()
  @Post('conversations')
  create(@UserId() userId: string, @Body() dto: CreateConversationDto) {
    return this.advisor.create(userId, dto.title);
  }

  @ApiBearerAuth()
  @Get('conversations/:id')
  get(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.advisor.get(userId, id);
  }

  @ApiBearerAuth()
  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.advisor.delete(userId, id);
  }

  @ApiBearerAuth()
  @Post('conversations/:id/messages')
  @UseGuards(ThrottlerGuard)
  @Throttle(ASK_LIMIT)
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Ask the advisor. Streams server-sent events: delta, tool_call, tool_result, suggestion, done, error' })
  async send(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto, @Req() req: Request, @Res() res: Response) {
    const run = await this.advisor.prepareMessage(userId, id, dto.content);
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const emit = ({ event, data }: AdvisorStreamEvent) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const heartbeat = setInterval(() => !res.writableEnded && res.write(': keep-alive\n\n'), 15_000);
    try {
      await run(emit, controller.signal);
    } finally {
      clearInterval(heartbeat);
      void req;
      res.end();
    }
  }

  @ApiBearerAuth()
  @Get('suggestions')
  @ApiOperation({ summary: 'Advisor suggestions (default: pending)' })
  async listSuggestions(@UserId() userId: string, @Query() q: SuggestionQueryDto) {
    const status = q.status ?? 'pending';
    return { items: await this.suggestions.list(userId, status === 'all' ? undefined : status) };
  }

  @ApiBearerAuth()
  @Post('suggestions/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a suggestion, optionally with an edited payload. The only way a draft is saved.' })
  approve(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveSuggestionDto) {
    return this.suggestions.approve(userId, id, dto.payload);
  }

  @ApiBearerAuth()
  @Post('suggestions/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.suggestions.dismiss(userId, id);
  }

  @ApiBearerAuth()
  @Get('briefings/latest')
  @ApiOperation({ summary: 'The most recent weekly briefing, or null' })
  async latestBriefing(@UserId() userId: string) {
    return { briefing: await this.briefings.latest(userId) };
  }

  @ApiBearerAuth()
  @Post('briefings/generate')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: "Build this week's briefing now (deterministic figures, AI narrative when enabled)" })
  async generateBriefing(@UserId() userId: string) {
    return { briefing: await this.briefings.generate(userId) };
  }

  @Public()
  @Get('briefings/unsubscribe')
  @ApiOperation({ summary: 'One-click unsubscribe link from briefing emails; returns a small HTML page' })
  async unsubscribePage(@Query() query: UnsubscribeQueryDto, @Res() res: Response) {
    let ok = true;
    try {
      await this.briefings.unsubscribe(query.token);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      ok = false;
    }
    res
      .status(ok ? 200 : 400)
      .type('html')
      .send(
        page(
          ok ? 'You are unsubscribed' : 'This link is invalid',
          ok ? 'Arvo will no longer email you the weekly briefing. You can turn it back on in Settings → Preferences.' : 'Open Settings → Preferences in Arvo to change the weekly briefing email.',
        ),
      );
  }

  @Public()
  @Post('briefings/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC 8058 one-click unsubscribe' })
  async unsubscribe(@Query() query: UnsubscribeQueryDto): Promise<{ ok: true }> {
    await this.briefings.unsubscribe(query.token);
    return { ok: true };
  }
}
