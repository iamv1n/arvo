import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

/** Loads the repo-root .env for CLI usage when DATABASE_URL is not already set. */
export function loadRootEnv(): void {
  if (process.env.DATABASE_URL) return;
  for (const dir of [process.cwd(), resolve(__dirname, '../../..')]) {
    const file = resolve(dir, '.env');
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
  }
}

export function databaseOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    uuidExtension: 'pgcrypto',
    url,
    entities: ENTITIES,
    migrations: [resolve(__dirname, 'migrations/*.js')],
    // Schema changes go through migrations only, in every environment.
    synchronize: false,
    migrationsTransactionMode: 'each',
  };
}
