import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions, loadRootEnv } from './config';

// Used by the TypeORM CLI (migration:run / generate / revert).
loadRootEnv();
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export default new DataSource(databaseOptions(process.env.DATABASE_URL));
