import { assembleBriefing, briefingNarrative, formatAmount, PROVIDER_LABELS, weekStartOf, type Briefing } from '@arvo/ai';
import { AdvisorBriefingEntity, UserEntity } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { HttpStatus, Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, IsNull, Not } from 'typeorm';
import { hmacHex, safeEqualHex } from '../auth/security';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MAILER, type Mailer } from '../mail/mailer';
import { templates } from '../mail/templates';
import { RemindersService } from '../reminders/reminders.service';
import { AdvisorProviders } from './advisor-providers';
import { briefingDue, localParts } from './local-time';

export const BRIEFING_CHECK_INTERVAL_MS = 3_600_000;
const NARRATIVE_TIMEOUT_MS = 30_000;
const STALE_IMPORT_DAYS = 30;

export interface BriefingView {
  id: string;
  weekStart: string;
  asOf: string;
  data: Briefing;
  narrative: string | null;
  provider: string | null;
  model: string | null;
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const present = (b: AdvisorBriefingEntity): BriefingView => ({
  id: b.id,
  weekStart: b.weekStart,
  asOf: b.asOf,
  data: b.data as unknown as Briefing,
  narrative: b.narrative,
  provider: b.provider,
  model: b.model,
  emailedAt: b.emailedAt,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

@Injectable()
export class BriefingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('briefings');
  private running = false;

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SchedulerRegistry) private readonly scheduler: SchedulerRegistry,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(AdvisorProviders) private readonly providers: AdvisorProviders,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.weeklyBriefingEnabled || this.config.nodeEnv === 'test') return;
    const tick = () => {
      this.runDueBriefings().catch((error: unknown) => this.logger.error({ msg: 'briefing run failed', error: String(error) }));
    };
    this.scheduler.addInterval('weekly-briefings', setInterval(tick, BRIEFING_CHECK_INTERVAL_MS));
    setTimeout(tick, 45_000).unref();
    this.logger.log({ msg: 'weekly briefings scheduled', every_ms: BRIEFING_CHECK_INTERVAL_MS });
  }

  private get repo() {
    return this.dataSource.getRepository(AdvisorBriefingEntity);
  }

  async latest(userId: string): Promise<BriefingView | null> {
    const row = await this.repo.findOne({ where: { userId }, order: { weekStart: 'DESC', updatedAt: 'DESC' } });
    return row ? present(row) : null;
  }

  /** Builds (or rebuilds) this week's briefing for the user, with an AI narrative when a provider is on. */
  async generate(userId: string, now = new Date()): Promise<BriefingView> {
    const user = await this.providers.user(userId);
    const asOf = localParts(user.timezone, now).date;
    const settings = await this.reminders.getSettings(userId, now);
    const data = await assembleBriefing(this.core, userId, {
      currency: user.currency,
      asOf,
      // Independent of the reminder cadence: flag an empty ledger or no import for a month.
      upload: { overdue: settings.overdue || settings.daysSinceLastImport === null || settings.daysSinceLastImport > STALE_IMPORT_DAYS, daysSinceLastImport: settings.daysSinceLastImport },
    });

    let narrative: string | null = null;
    let provider: string | null = null;
    let model: string | null = null;
    const choice = this.providers.choiceFor(user);
    if (choice) {
      try {
        const ai = this.providers.providerFor(user);
        narrative = await briefingNarrative(ai, data, AbortSignal.timeout(NARRATIVE_TIMEOUT_MS));
        if (narrative) [provider, model] = [ai.name, ai.model];
      } catch (error) {
        this.logger.warn({ msg: 'briefing narrative failed', user_id: userId, code: (error as { code?: string }).code ?? 'AI_FAILED' });
      }
    }

    const weekStart = weekStartOf(asOf);
    const existing = await this.repo.findOneBy({ userId, weekStart });
    const row = this.repo.merge(existing ?? this.repo.create({ userId, weekStart }), { asOf, data: data as unknown as Record<string, unknown>, narrative, provider, model });
    return present(await this.repo.save(row));
  }

  /** Emails due briefings (Monday from 08:00 in each user's timezone), at most once per week. */
  async runDueBriefings(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const users = await this.dataSource.getRepository(UserEntity).find({ where: { weeklyBriefing: true, emailVerifiedAt: Not(IsNull()) } });
      let sent = 0;
      for (const user of users) {
        try {
          if (await this.sendIfDue(user, now)) sent++;
        } catch (error) {
          this.logger.error({ msg: 'briefing failed', user_id: user.id, error: String(error) });
        }
      }
      if (sent) this.logger.log({ msg: 'weekly briefings sent', count: sent });
      return sent;
    } finally {
      this.running = false;
    }
  }

  private async sendIfDue(user: UserEntity, now: Date): Promise<boolean> {
    if (!briefingDue(user.timezone, now)) return false;
    const weekStart = weekStartOf(localParts(user.timezone, now).date);
    const existing = await this.repo.findOneBy({ userId: user.id, weekStart });
    if (existing?.emailedAt) return false;

    const briefing = await this.generate(user.id, now);
    const claimed = await this.repo
      .createQueryBuilder()
      .update()
      .set({ emailedAt: now })
      .where('id = :id AND emailed_at IS NULL', { id: briefing.id })
      .execute();
    if (!claimed.affected) return false;

    const web = this.config.publicWebUrl;
    const b = briefing.data;
    const money = (value: string) => formatAmount(value, b.currency);
    await this.mailer.send(
      templates.weeklyBriefing(user.email, {
        name: user.name,
        weekStart: b.weekStart,
        narrative: briefing.narrative,
        narrativeBy: briefing.provider ? PROVIDER_LABELS[briefing.provider] ?? briefing.provider : null,
        decision: b.decision.text,
        budgets: b.budgets.attention.slice(0, 5).map((a) => `${a.categoryName}: ${money(a.spent)} of ${money(a.limit)}, projected ${money(a.projected)}`),
        goals: b.goals.slice(0, 5).map((g) => `${g.name}: ${g.percent}% (${g.status.replace('_', ' ')}), ${money(g.requiredMonthly)} a month needed`),
        savings: b.savings.top.map((s) => `${s.title}: about ${money(s.monthlySaving)} a month`),
        upcoming: b.upcoming.slice(0, 6).map((u) => `${u.date} · ${u.label} · ${money(u.amount)}`),
        advisorUrl: `${web}/advisor`,
        settingsUrl: `${web}/settings?tab=preferences`,
        unsubscribeUrl: `${this.config.publicApiUrl}/advisor/briefings/unsubscribe?token=${encodeURIComponent(this.unsubscribeToken(user.id))}`,
      }),
    );
    return true;
  }

  async unsubscribe(token: string): Promise<void> {
    const [userId, signature] = token.split('.');
    if (!userId || !signature || !/^[0-9a-f-]{36}$/.test(userId) || !safeEqualHex(signature, this.sign(userId))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TOKEN', 'This unsubscribe link is invalid');
    }
    await this.dataSource.getRepository(UserEntity).update({ id: userId }, { weeklyBriefing: false });
  }

  unsubscribeToken(userId: string): string {
    return `${userId}.${this.sign(userId)}`;
  }

  private sign(userId: string): string {
    return hmacHex(this.config.jwtSecret, `briefing-unsubscribe:${userId}`);
  }
}
