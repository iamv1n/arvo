import { AccountEntity, ImportBatchEntity, TransactionEntity, UserEntity, type ReminderFrequency } from '@arvo/database';
import { ImportStatus } from '@arvo/types';
import { HttpStatus, Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, IsNull, Not } from 'typeorm';
import { hmacHex, safeEqualHex } from '../auth/security';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MAILER, type Mailer } from '../mail/mailer';
import { templates } from '../mail/templates';
import { latest, nextReminderDue, wholeDaysBetween } from './due';

export const REMINDER_CHECK_INTERVAL_MS = 3_600_000;

export interface ReminderSettings {
  frequency: ReminderFrequency;
  day: number | null;
  lastImportAt: Date | null;
  daysSinceLastImport: number | null;
  /** When the next email would go out (null when off). */
  nextReminderAt: Date | null;
  /** No committed import within the chosen period. */
  overdue: boolean;
  /** Email the weekly advisor briefing on Monday mornings. */
  weeklyBriefing: boolean;
}

@Injectable()
export class RemindersService implements OnApplicationBootstrap {
  private readonly logger = new Logger('reminders');
  private running = false;

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SchedulerRegistry) private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.remindersEnabled || this.config.nodeEnv === 'test') return;
    const tick = () => {
      this.runDueReminders().catch((error: unknown) => this.logger.error({ msg: 'reminder run failed', error: String(error) }));
    };
    this.scheduler.addInterval('upload-reminders', setInterval(tick, REMINDER_CHECK_INTERVAL_MS));
    setTimeout(tick, 30_000).unref();
    this.logger.log({ msg: 'upload reminders scheduled', every_ms: REMINDER_CHECK_INTERVAL_MS });
  }

  async getSettings(userId: string, now = new Date()): Promise<ReminderSettings> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId });
    if (!user) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'User no longer exists');
    return this.describe(user, await this.lastImportAt(userId), now);
  }

  async updateSettings(userId: string, input: { frequency?: ReminderFrequency; day?: number | null; weeklyBriefing?: boolean }): Promise<ReminderSettings> {
    const patch: Partial<UserEntity> = {};
    if (input.frequency !== undefined) patch.reminderFrequency = input.frequency;
    if (input.day !== undefined) patch.reminderDay = input.day;
    if (input.weeklyBriefing !== undefined) patch.weeklyBriefing = input.weeklyBriefing;
    if (Object.keys(patch).length) await this.dataSource.getRepository(UserEntity).update({ id: userId }, patch);
    return this.getSettings(userId);
  }

  /**
   * Sends every reminder that is due at `now`. Idempotent: a reminder moves the anchor forward,
   * and the send is claimed with a conditional update so concurrent runs can't double-send.
   */
  async runDueReminders(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const users = await this.dataSource.getRepository(UserEntity).find({
        where: { reminderFrequency: Not('off'), emailVerifiedAt: Not(IsNull()) },
      });
      let sent = 0;
      for (const user of users) {
        try {
          if (await this.remindIfDue(user, now)) sent++;
        } catch (error) {
          this.logger.error({ msg: 'reminder failed', user_id: user.id, error: String(error) });
        }
      }
      if (sent) this.logger.log({ msg: 'upload reminders sent', count: sent });
      return sent;
    } finally {
      this.running = false;
    }
  }

  /** Validates an unsubscribe token and turns reminders off. */
  async unsubscribe(token: string): Promise<void> {
    const [userId, signature] = token.split('.');
    if (!userId || !signature || !/^[0-9a-f-]{36}$/.test(userId) || !safeEqualHex(signature, this.sign(userId))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TOKEN', 'This unsubscribe link is invalid');
    }
    await this.dataSource.getRepository(UserEntity).update({ id: userId }, { reminderFrequency: 'off' });
  }

  unsubscribeToken(userId: string): string {
    return `${userId}.${this.sign(userId)}`;
  }

  private async remindIfDue(user: UserEntity, now: Date): Promise<boolean> {
    const lastImportAt = await this.lastImportAt(user.id);
    const anchor = latest(lastImportAt ?? user.createdAt, user.lastReminderSentAt);
    const due = nextReminderDue(user.reminderFrequency, anchor, user.reminderDay);
    if (!due || now.getTime() < due.getTime()) return false;

    const claimed = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder()
      .update()
      .set({ lastReminderSentAt: now })
      .where('id = :id AND last_reminder_sent_at IS NOT DISTINCT FROM :previous', { id: user.id, previous: user.lastReminderSentAt })
      .execute();
    if (!claimed.affected) return false;

    const web = this.config.publicWebUrl;
    await this.mailer.send(
      templates.uploadReminder(user.email, {
        name: user.name,
        daysSinceImport: lastImportAt ? wholeDaysBetween(lastImportAt, now) : null,
        staleAccounts: lastImportAt ? await this.staleAccounts(user.id, lastImportAt) : [],
        importsUrl: `${web}/imports`,
        settingsUrl: `${web}/settings?tab=preferences`,
        unsubscribeUrl: `${this.config.publicApiUrl}/reminders/unsubscribe?token=${encodeURIComponent(this.unsubscribeToken(user.id))}`,
      }),
    );
    return true;
  }

  private describe(user: UserEntity, lastImportAt: Date | null, now: Date): ReminderSettings {
    const base = lastImportAt ?? user.createdAt;
    const frequency = user.reminderFrequency;
    const overdueAt = nextReminderDue(frequency, base, user.reminderDay);
    return {
      frequency,
      day: user.reminderDay,
      lastImportAt,
      daysSinceLastImport: lastImportAt ? wholeDaysBetween(lastImportAt, now) : null,
      nextReminderAt: nextReminderDue(frequency, latest(base, user.lastReminderSentAt), user.reminderDay),
      overdue: !!overdueAt && now.getTime() >= overdueAt.getTime(),
      weeklyBriefing: user.weeklyBriefing,
    };
  }

  private async lastImportAt(userId: string): Promise<Date | null> {
    const row = await this.dataSource
      .getRepository(ImportBatchEntity)
      .createQueryBuilder('b')
      .select('MAX(b.completed_at)', 'at')
      .where('b.user_id = :userId AND b.status = :status', { userId, status: ImportStatus.COMPLETED })
      .getRawOne<{ at: Date | string | null }>();
    return row?.at ? new Date(row.at) : null;
  }

  /** Active accounts with no transactions recorded since the last import. */
  private async staleAccounts(userId: string, since: Date): Promise<string[]> {
    const rows = await this.dataSource
      .getRepository(AccountEntity)
      .createQueryBuilder('a')
      .select('a.name', 'name')
      .where('a.user_id = :userId AND a.is_active = true', { userId })
      .andWhere(
        `NOT EXISTS (${this.dataSource
          .getRepository(TransactionEntity)
          .createQueryBuilder('t')
          .select('1')
          .where('t.account_id = a.id AND t.created_at > :since')
          .getQuery()})`,
        { since },
      )
      .orderBy('a.name')
      .getRawMany<{ name: string }>();
    return rows.map((r) => r.name);
  }

  private sign(userId: string): string {
    return hmacHex(this.config.jwtSecret, `reminders-unsubscribe:${userId}`);
  }
}
