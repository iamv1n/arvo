import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailConfig } from '../config/app-config';
import type { Mailer, MailMessage } from './mailer';

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(private readonly config: MailConfig) {
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.from, ...message });
  }
}

/** Development driver: prints the email, including links and codes, to the API log. */
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger('mail');

  constructor(private readonly from: string) {}

  send(message: MailMessage): Promise<void> {
    const rule = '-'.repeat(72);
    process.stdout.write(
      `\n${rule}\n[mail:console] From: ${this.from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n${rule}\n`,
    );
    this.logger.log({ msg: 'email written to console', subject: message.subject });
    return Promise.resolve();
  }
}

/** Test driver: keeps messages in memory so e2e tests can read links and codes. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Most recent message to an address, optionally matching a subject. */
  last(to: string, subject?: RegExp): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to && (!subject || subject.test(m.subject)));
  }

  count(to: string, subject?: RegExp): number {
    return this.sent.filter((m) => m.to === to && (!subject || subject.test(m.subject))).length;
  }
}
