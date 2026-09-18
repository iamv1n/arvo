import { describeAlert, type AlertDelivery, type Notifier } from '@arvo/finance-core';
import { UserEntity } from '@arvo/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MARKETS_NOTIFIER, NotifierRelay } from './tokens';
import { MAILER, type Mailer } from '../mail/mailer';
import { templates } from '../mail/templates';

/*
 * Delivery outside the app: email through the existing mailer, and Telegram through an
 * injectable sender.
 *
 * The in-app copy is written by finance-core before this is called, and quiet hours have
 * already been applied there, so everything reaching here is meant to leave the machine. A
 * failure on one channel never stops the other: a Telegram outage must not swallow the email.
 */

/** Posts one message to a chat. Injectable so tests can watch without a network. */
export interface TelegramSender {
  send(chatId: string, text: string): Promise<void>;
}

export const TELEGRAM_SENDER = Symbol('TELEGRAM_SENDER');

/** The sender used when no bot token is configured: it refuses rather than pretending. */
export const disabledTelegramSender: TelegramSender = {
  send: async () => {
    throw new Error('Telegram is not configured on this server');
  },
};

export function createTelegramSender(botToken: string | null, fetcher: typeof fetch = fetch): TelegramSender {
  if (!botToken) return disabledTelegramSender;
  return {
    send: async (chatId, text) => {
      const response = await fetcher(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
    },
  };
}

@Injectable()
export class MarketsNotifier implements Notifier {
  private readonly logger = new Logger('markets');

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TELEGRAM_SENDER) private readonly telegram: TelegramSender,
    @Inject(MARKETS_NOTIFIER) relay: NotifierRelay,
  ) {
    // FinanceCore was handed the relay before this class could exist; this closes the loop.
    relay.attach(this);
  }

  async deliver(delivery: AlertDelivery): Promise<void> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ id: delivery.userId });
    if (!user) return;
    const web = this.config.publicWebUrl;

    if (delivery.channels.includes('EMAIL')) {
      try {
        await this.mailer.send(this.compose(delivery, user.email, user.name, web));
      } catch (error) {
        this.logger.error({ msg: 'alert email failed', user_id: user.id, error: String(error) });
      }
    }

    if (delivery.channels.includes('TELEGRAM')) {
      const chatId = String(delivery.meta.telegramChatId ?? '') || (await this.chatId(delivery.userId));
      if (!chatId) return;
      try {
        await this.telegram.send(chatId, `${delivery.title}\n\n${delivery.body}`);
      } catch (error) {
        this.logger.warn({ msg: 'telegram send failed', user_id: user.id, error: String(error) });
      }
    }
  }

  private compose(delivery: AlertDelivery, email: string, name: string, web: string) {
    const settingsUrl = `${web}/markets?tab=notifications`;
    if (delivery.kind === 'GUARDRAIL') {
      return templates.guardrailBreached(email, {
        name,
        label: delivery.title,
        limit: String(delivery.meta.limit ?? ''),
        actual: String(delivery.meta.actual ?? ''),
        periodStart: String(delivery.meta.periodStart ?? ''),
        tradingUrl: `${web}/trading`,
        settingsUrl,
      });
    }
    const alert = delivery.alert;
    return templates.alertTriggered(email, {
      name,
      alertName: delivery.title,
      message: delivery.body,
      rule: alert ? describeAlert(alert.name, alert.params, alert.repeats) : delivery.body,
      firedAt: delivery.trigger?.firedAt ?? new Date(),
      evidence: evidenceLines(delivery.trigger?.evidence ?? {}),
      alertsUrl: `${web}/markets?tab=alerts`,
      settingsUrl,
    });
  }

  private async chatId(userId: string): Promise<string | null> {
    const row = await this.dataSource.query<{ telegram_chat_id: string | null }[]>(
      'SELECT telegram_chat_id FROM markets_notification_settings WHERE user_id = $1',
      [userId],
    );
    return row[0]?.telegram_chat_id ?? null;
  }
}

/** The evidence snapshot as readable lines. Nested structures are summarised, not dumped. */
function evidenceLines(evidence: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(evidence)) {
    if (key === 'kind' || key === 'evaluatedAt' || value === null || value === undefined) continue;
    if (Array.isArray(value)) lines.push(`${label(key)}: ${value.length} item${value.length === 1 ? '' : 's'}`);
    else if (typeof value === 'object') continue;
    else lines.push(`${label(key)}: ${String(value)}`);
  }
  return lines.slice(0, 8);
}

const label = (key: string): string => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
