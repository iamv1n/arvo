import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Points the app at TEST_DATABASE_URL so e2e runs never touch the development database. */
export function testDatabaseUrl(): string {
  const envFile = resolve(__dirname, '../../../.env');
  if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set for e2e tests');
  // e2e setup drops this database, so never let it point at a real one.
  if (!new URL(url).pathname.includes('test')) {
    throw new Error('TEST_DATABASE_URL database name must contain "test"');
  }
  return url;
}
