import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { JsonLogger } from '../src/common/json-logger';
import { loadAppConfig } from '../src/config/app-config';
import { MemoryMailer } from '../src/mail/drivers';
import { MAILER } from '../src/mail/mailer';
import { testDatabaseUrl } from './env';

export async function createTestApp(env: Record<string, string> = {}): Promise<INestApplication> {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.JWT_SECRET = 'e2e-test-secret-that-is-long-enough-000000';
  process.env.STORAGE_PATH = join(tmpdir(), 'arvo-e2e-storage');
  process.env.MAIL_DRIVER = 'memory';
  process.env.PUBLIC_WEB_URL ??= 'http://localhost:3300';
  // The advisor is off unless a suite opts in; e2e runs never call a real AI provider.
  process.env.AI_PROVIDER = 'none';
  Object.assign(process.env, env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: new JsonLogger(false) });
  configureApp(app, loadAppConfig());
  await app.init();
  return app;
}

/** The in-memory mailer used by e2e apps. */
export function mailbox(app: INestApplication): MemoryMailer {
  const mailer = app.get<MemoryMailer>(MAILER);
  if (!(mailer instanceof MemoryMailer)) throw new Error('e2e app is not using the memory mailer');
  return mailer;
}

/** Pulls the token query parameter out of the first matching link in an email. */
export function linkToken(text: string, path: string): string {
  const match = new RegExp(`${path}\\?token=([^\\s"&<]+)`).exec(text);
  if (!match) throw new Error(`No ${path} link in email`);
  return decodeURIComponent(match[1]!);
}

let counter = 0;

/** Registers a fresh user and returns an authenticated supertest helper. */
export async function registerUser(app: INestApplication) {
  const email = `user${Date.now()}-${counter++}@example.com`;
  const password = 'correct horse battery';
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, name: 'Test User' })
    .expect(201);
  const auth = { Authorization: `Bearer ${res.body.accessToken as string}` };
  const server = app.getHttpServer();
  return {
    email,
    password,
    tokens: res.body as { accessToken: string; refreshToken: string },
    get: (url: string) => request(server).get(url).set(auth),
    post: (url: string, body?: object) => request(server).post(url).set(auth).send(body),
    patch: (url: string, body: object) => request(server).patch(url).set(auth).send(body),
    delete: (url: string) => request(server).delete(url).set(auth),
    upload: (url: string, fields: Record<string, string>, file: { name: string; content: string | Buffer }) => {
      const req = request(server).post(url).set(auth);
      for (const [k, v] of Object.entries(fields)) req.field(k, v);
      return req.attach('file', Buffer.from(file.content), file.name);
    },
  };
}
