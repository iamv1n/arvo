import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import type { ReminderFrequency } from '@arvo/database';
import { escapeHtml } from '../mail/templates';
import { Public, UserId } from '../common/auth.decorators';
import { ApiError } from '../common/api-exception.filter';
import { RemindersService, type ReminderSettings } from './reminders.service';

const FREQUENCIES: ReminderFrequency[] = ['off', 'every_15_days', 'monthly'];

export class ReminderSettingsDto implements ReminderSettings {
  @ApiProperty({ enum: FREQUENCIES }) frequency!: ReminderFrequency;
  @ApiProperty({ nullable: true, type: Number, minimum: 1, maximum: 28 }) day!: number | null;
  @ApiProperty({ nullable: true, type: Date }) lastImportAt!: Date | null;
  @ApiProperty({ nullable: true, type: Number }) daysSinceLastImport!: number | null;
  @ApiProperty({ nullable: true, type: Date }) nextReminderAt!: Date | null;
  @ApiProperty() overdue!: boolean;
}

export class UpdateReminderSettingsDto {
  @ApiPropertyOptional({ enum: FREQUENCIES })
  @IsOptional()
  @IsIn(FREQUENCIES)
  frequency?: ReminderFrequency;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 28, description: 'Preferred day of month for monthly reminders' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(28)
  day?: number | null;
}

export class UnsubscribeQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  token!: string;
}

@ApiTags('reminders')
@Controller()
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

  @ApiBearerAuth()
  @Get('me/reminders')
  @ApiOkResponse({ type: ReminderSettingsDto })
  get(@UserId() userId: string): Promise<ReminderSettings> {
    return this.reminders.getSettings(userId);
  }

  @ApiBearerAuth()
  @Patch('me/reminders')
  @ApiOkResponse({ type: ReminderSettingsDto })
  update(@UserId() userId: string, @Body() dto: UpdateReminderSettingsDto): Promise<ReminderSettings> {
    return this.reminders.updateSettings(userId, dto);
  }

  @Public()
  @Get('reminders/unsubscribe')
  @ApiOperation({ summary: 'One-click unsubscribe link from reminder emails; returns a small HTML page' })
  async unsubscribePage(@Query() query: UnsubscribeQueryDto, @Res() res: Response) {
    let ok = true;
    try {
      await this.reminders.unsubscribe(query.token);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      ok = false;
    }
    res
      .status(ok ? 200 : 400)
      .type('html')
      .send(page(ok ? 'You are unsubscribed' : 'This link is invalid', ok ? 'Arvo will no longer email you upload reminders. You can turn them back on in Settings → Preferences.' : 'Open Settings → Preferences in Arvo to change upload reminders.'));
  }

  @Public()
  @Post('reminders/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC 8058 one-click unsubscribe' })
  async unsubscribe(@Query() query: UnsubscribeQueryDto): Promise<{ ok: true }> {
    await this.reminders.unsubscribe(query.token);
    return { ok: true };
  }
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Arvo</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f5f1;color:#161a2e;font:16px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif">
<main style="max-width:440px;padding:32px;background:#fefdfb;border:1px solid #e1ded6;border-radius:14px">
<div style="font:500 22px Georgia,serif;margin-bottom:12px">Arvo</div>
<h1 style="font:500 24px/1.3 Georgia,serif;margin:0 0 8px">${escapeHtml(title)}</h1>
<p style="margin:0;color:#4b4f63">${escapeHtml(body)}</p>
</main></body></html>`;
}
