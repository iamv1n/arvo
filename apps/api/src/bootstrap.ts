import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { createValidationPipe } from './common/validation';
import type { AppConfig } from './config/app-config';

/** Shared app wiring for main.ts and e2e tests. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.use(cookieParser());
  // OAuth discovery, registration, token and revocation endpoints are called cross-origin by MCP
  // clients; they never use cookies, so any origin may call them. Everything else is limited to
  // the web app's origins with credentials.
  const publicCorsPaths = /^\/(\.well-known\/|oauth\/(register|token|revoke)$)/;
  app.enableCors((req: { url?: string }, callback: (err: Error | null, options: object) => void) => {
    const path = (req.url ?? '').split('?')[0];
    callback(null, publicCorsPaths.test(path) ? { origin: '*', credentials: false } : { origin: config.corsOrigins, credentials: true });
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Arvo API')
      .setDescription('Local-first personal finance. Amounts are signed decimal strings; dates are YYYY-MM-DD.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
