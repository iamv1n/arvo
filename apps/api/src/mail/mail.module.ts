import { Global, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { ConsoleMailer, MemoryMailer, SmtpMailer } from './drivers';
import { MAILER, type Mailer } from './mailer';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Mailer => {
        const { mail } = config;
        new Logger('mail').log({ msg: 'mail driver', driver: mail.driver });
        if (mail.driver === 'smtp') return new SmtpMailer(mail);
        if (mail.driver === 'memory') return new MemoryMailer();
        return new ConsoleMailer(mail.from);
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
