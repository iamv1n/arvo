import 'reflect-metadata';
import { loadRootEnv } from '@arvo/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { JsonLogger } from './common/json-logger';
import { loadAppConfig } from './config/app-config';

async function main() {
  loadRootEnv();
  const config = loadAppConfig();
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  configureApp(app, config);
  await app.listen(config.port, '0.0.0.0');
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ level: 'fatal', msg: 'startup failed', error: String(error) })}\n`);
  process.exit(1);
});
