import { Injectable } from '@nestjs/common';
import type { AlertDelivery, Notifier } from '@arvo/finance-core';

/*
 * A one-hop indirection between FinanceCore and the thing that sends email and Telegram.
 *
 * DatabaseModule builds FinanceCore, and FinanceCore wants a Notifier. The real notifier needs
 * DataSource and the mailer, both of which come from DatabaseModule — so injecting it directly
 * would close a circle. The relay is a Notifier with no dependencies at all: FinanceCore gets it
 * at construction, and MarketsNotifier attaches itself to it once the app has wired everything.
 *
 * Until something attaches, delivery outside the app is a no-op. That is the correct behaviour
 * rather than a failure: the in-app notification is already written by the time this is called.
 */

export const MARKETS_NOTIFIER = Symbol('MARKETS_NOTIFIER');

@Injectable()
export class NotifierRelay implements Notifier {
  private target: Notifier | null = null;

  attach(target: Notifier): void {
    this.target = target;
  }

  async deliver(delivery: AlertDelivery): Promise<void> {
    await this.target?.deliver(delivery);
  }
}
