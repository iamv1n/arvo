import { FinanceCore } from '@arvo/finance-core';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

/*
 * The alert scheduler.
 *
 * It is the same shape as the upload reminders: an interval registered at bootstrap, skipped
 * entirely in the test environment, with the clock passed in so `runDueAlerts(now)` is a pure
 * call a test can make directly. Everything that decides whether an alert fires — cooldown,
 * staleness, one-shot — lives in finance-core, so this class only answers "when", never "what".
 *
 * A run in flight blocks the next tick rather than queueing behind it. An evaluation pass that
 * takes longer than an hour means something is wrong upstream, and stacking passes would turn
 * that into a stampede.
 */

@Injectable()
export class AlertsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger('alerts');
  private running = false;

  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SchedulerRegistry) private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    const { alertsEnabled, alertIntervalMs } = this.config.markets;
    if (!alertsEnabled || this.config.nodeEnv === 'test') return;
    const tick = () => {
      this.run().catch((error: unknown) => this.logger.error({ msg: 'alert run failed', error: String(error) }));
    };
    this.scheduler.addInterval('markets-alerts', setInterval(tick, alertIntervalMs));
    setTimeout(tick, 45_000).unref();
    this.logger.log({ msg: 'alert evaluation scheduled', every_ms: alertIntervalMs });
  }

  /** Evaluates every enabled alert of every user. Safe to call twice: cooldowns make it idempotent. */
  async run(now = new Date()): Promise<{ users: number; evaluated: number; fired: number }> {
    if (this.running) return { users: 0, evaluated: 0, fired: 0 };
    this.running = true;
    try {
      const result = await this.core.markets.runDueAlerts(now);
      if (result.fired) this.logger.log({ msg: 'alerts fired', ...result });
      return result;
    } finally {
      this.running = false;
    }
  }
}
