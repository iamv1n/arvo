export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Sends transactional email. Drivers: smtp, console (dev) and memory (tests). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');
