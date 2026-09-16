import 'reflect-metadata';
import { databaseOptions } from '@arvo/database';
import { DataSource } from 'typeorm';
import { testDatabaseUrl } from './env';

/** Recreates the test database from scratch and applies all migrations. */
export default async function globalSetup() {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(database) || !database.includes('test')) {
    throw new Error(`Refusing to recreate database "${database}": name must contain "test"`);
  }
  const adminUrl = Object.assign(new URL(url), { pathname: '/postgres' }).toString();
  const admin = await new DataSource({ type: 'postgres', url: adminUrl }).initialize();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.destroy();

  const dataSource = await new DataSource(databaseOptions(url.toString())).initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
