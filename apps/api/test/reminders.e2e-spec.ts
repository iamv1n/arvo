import { ImportBatchEntity } from '@arvo/database';
import { ImportStatus } from '@arvo/types';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RemindersService } from '../src/reminders/reminders.service';
import { createTestApp, linkToken, mailbox, registerUser } from './app';

const DAY = 86_400_000;
const REMINDER = /upload your latest statements/;

describe('Statement upload reminders (e2e)', () => {
  let app: INestApplication;
  let reminders: RemindersService;
  beforeAll(async () => {
    app = await createTestApp();
    reminders = app.get(RemindersService);
  });
  afterAll(() => app.close());

  async function verifiedUser() {
    const user = await registerUser(app);
    const token = linkToken(mailbox(app).last(user.email, /Confirm your email/)!.text, '/verify-email');
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token }).expect(200);
    return user;
  }

  /** Records a committed import as if the statement had been processed at `at`. */
  async function commitImport(userId: string, accountId: string, at: Date) {
    const repo = app.get(DataSource).getRepository(ImportBatchEntity);
    await repo.save(
      repo.create({
        userId,
        accountId,
        filename: 'statement.csv',
        fileType: 'CSV',
        fileHash: randomBytes(32).toString('hex'),
        fileSize: 100,
        storageKey: `test/${randomBytes(8).toString('hex')}`,
        status: ImportStatus.COMPLETED,
        completedAt: at,
      }),
    );
  }

  const userId = async (user: Awaited<ReturnType<typeof registerUser>>) => (await user.get('/me')).body.id as string;

  it('reads and validates reminder preferences', async () => {
    const user = await verifiedUser();
    expect((await user.get('/me/reminders').expect(200)).body).toEqual({
      frequency: 'off',
      day: null,
      lastImportAt: null,
      daysSinceLastImport: null,
      nextReminderAt: null,
      overdue: false,
      weeklyBriefing: false,
    });
    const updated = await user.patch('/me/reminders', { frequency: 'monthly', day: 5 }).expect(200);
    expect(updated.body).toMatchObject({ frequency: 'monthly', day: 5, overdue: false, nextReminderAt: expect.any(String) });
    await user.patch('/me/reminders', { frequency: 'weekly' }).expect(400);
    await user.patch('/me/reminders', { day: 31 }).expect(400);
    expect((await user.patch('/me/reminders', { day: null }).expect(200)).body.day).toBeNull();
  });

  it('sends one reminder per cycle once the period passes without an import', async () => {
    const user = await verifiedUser();
    await user.patch('/me/reminders', { frequency: 'every_15_days' }).expect(200);
    const start = Date.now();

    await reminders.runDueReminders(new Date(start + 10 * DAY));
    expect(mailbox(app).count(user.email, REMINDER)).toBe(0);

    await reminders.runDueReminders(new Date(start + 16 * DAY));
    expect(mailbox(app).count(user.email, REMINDER)).toBe(1);

    // Same cycle: hourly re-runs don't send again.
    await reminders.runDueReminders(new Date(start + 16 * DAY + 3_600_000));
    await reminders.runDueReminders(new Date(start + 20 * DAY));
    expect(mailbox(app).count(user.email, REMINDER)).toBe(1);

    const mail = mailbox(app).last(user.email, REMINDER)!;
    expect(mail.html).toContain('http://localhost:3300/imports');
    expect(mail.headers?.['List-Unsubscribe']).toMatch(/\/reminders\/unsubscribe\?token=/);

    // Still nothing uploaded a full period later: the next cycle reminds again.
    await reminders.runDueReminders(new Date(start + 32 * DAY));
    expect(mailbox(app).count(user.email, REMINDER)).toBe(2);
  });

  it('never reminds someone who imported within the period', async () => {
    const user = await verifiedUser();
    const id = await userId(user);
    const account = (await user.post('/accounts', { name: 'HDFC Savings', type: 'BANK' }).expect(201)).body;
    await user.patch('/me/reminders', { frequency: 'monthly' }).expect(200);
    const start = Date.now();

    // Imports every ~3 weeks keep resetting the cycle.
    await commitImport(id, account.id, new Date(start + 20 * DAY));
    await reminders.runDueReminders(new Date(start + 35 * DAY));
    await commitImport(id, account.id, new Date(start + 40 * DAY));
    await reminders.runDueReminders(new Date(start + 60 * DAY));
    expect(mailbox(app).count(user.email, REMINDER)).toBe(0);

    const settings = (await user.get('/me/reminders').expect(200)).body;
    expect(settings.lastImportAt).toBe(new Date(start + 40 * DAY).toISOString());
    expect(settings.overdue).toBe(false);

    // A month after the last import with nothing new: remind, naming the stale account.
    await reminders.runDueReminders(new Date(start + 72 * DAY));
    expect(mailbox(app).count(user.email, REMINDER)).toBe(1);
    const mail = mailbox(app).last(user.email, REMINDER)!;
    expect(mail.text).toContain("it's been 32 days since your last statement import");
    expect(mail.text).toContain('HDFC Savings');
  });

  it('skips unverified addresses', async () => {
    const user = await registerUser(app);
    await user.patch('/me/reminders', { frequency: 'every_15_days' }).expect(200);
    await reminders.runDueReminders(new Date(Date.now() + 40 * DAY));
    expect(mailbox(app).count(user.email, REMINDER)).toBe(0);
  });

  it('reports overdue for the in-app banner', async () => {
    const user = await verifiedUser();
    const account = (await user.post('/accounts', { name: 'Card', type: 'CREDIT_CARD' }).expect(201)).body;
    await commitImport(await userId(user), account.id, new Date(Date.now() - 20 * DAY));
    const off = (await user.get('/me/reminders')).body;
    expect(off).toMatchObject({ daysSinceLastImport: 20, overdue: false });
    const on = (await user.patch('/me/reminders', { frequency: 'every_15_days' }).expect(200)).body;
    expect(on.overdue).toBe(true);
  });

  it('unsubscribes with the signed link and rejects tampered tokens', async () => {
    const user = await verifiedUser();
    await user.patch('/me/reminders', { frequency: 'every_15_days' }).expect(200);
    await reminders.runDueReminders(new Date(Date.now() + 16 * DAY));
    const mail = mailbox(app).last(user.email, REMINDER)!;
    const token = linkToken(mail.text, '/reminders/unsubscribe');

    const server = app.getHttpServer();
    await request(server).get('/reminders/unsubscribe').query({ token: `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}` }).expect(400);
    await request(server).post('/reminders/unsubscribe').query({ token: 'nope' }).expect(400);
    const page = await request(server).get('/reminders/unsubscribe').query({ token }).expect(200);
    expect(page.headers['content-type']).toMatch(/html/);
    expect(page.text).toContain('You are unsubscribed');
    expect((await user.get('/me/reminders')).body.frequency).toBe('off');

    await user.patch('/me/reminders', { frequency: 'monthly' }).expect(200);
    await request(server).post('/reminders/unsubscribe').query({ token }).expect(200, { ok: true });
    expect((await user.get('/me/reminders')).body.frequency).toBe('off');
  });
});
