import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { totp } from '../src/auth/security';
import { createTestApp, linkToken, mailbox, registerUser } from './app';

type User = Awaited<ReturnType<typeof registerUser>>;

describe('Email verification, password reset and 2FA (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  const server = () => app.getHttpServer();
  const login = (email: string, password: string) => request(server()).post('/auth/login').send({ email, password });

  describe('email verification', () => {
    it('sends a verification link on register that verifies once', async () => {
      const user = await registerUser(app);
      const me = await user.get('/me').expect(200);
      expect(me.body).toMatchObject({ emailVerifiedAt: null, twoFactorEnabled: false });

      const mail = mailbox(app).last(user.email, /Confirm your email/)!;
      expect(mail.html).toContain('http://localhost:3300/verify-email?token=');
      expect(mail.text).toContain('/verify-email?token=');
      const token = linkToken(mail.text, '/verify-email');

      await request(server()).post('/auth/verify-email').send({ token }).expect(200, { ok: true });
      expect((await user.get('/me')).body.emailVerifiedAt).toEqual(expect.any(String));
      const reuse = await request(server()).post('/auth/verify-email').send({ token }).expect(400);
      expect(reuse.body.error.code).toBe('INVALID_TOKEN');
    });

    it('resends a fresh link, invalidating the old one, and stops once verified', async () => {
      const user = await registerUser(app);
      const first = linkToken(mailbox(app).last(user.email)!.text, '/verify-email');
      await user.post('/auth/resend-verification').expect(200, { sent: true });
      const second = linkToken(mailbox(app).last(user.email)!.text, '/verify-email');
      expect(second).not.toBe(first);

      await request(server()).post('/auth/verify-email').send({ token: first }).expect(400);
      await request(server()).post('/auth/verify-email').send({ token: second }).expect(200);
      await user.post('/auth/resend-verification').expect(200, { sent: false });
      await request(server()).post('/auth/resend-verification').expect(401);
    });

    it('rejects unknown tokens', async () => {
      await request(server()).post('/auth/verify-email').send({ token: 'x'.repeat(43) }).expect(400);
    });
  });

  describe('password reset', () => {
    it('resets with an emailed link, revokes sessions and rejects token reuse', async () => {
      const user = await registerUser(app);
      await request(server()).post('/auth/forgot-password').send({ email: user.email.toUpperCase() }).expect(200, { ok: true });
      const token = linkToken(mailbox(app).last(user.email, /Reset your Arvo password/)!.text, '/reset-password');

      const newPassword = 'a brand new passphrase';
      await request(server()).post('/auth/reset-password').send({ token, password: newPassword }).expect(200);
      expect(mailbox(app).last(user.email)!.subject).toMatch(/password was changed/);

      await login(user.email, user.password).expect(401);
      await login(user.email, newPassword).expect(200);
      // Existing refresh tokens were revoked.
      await request(server()).post('/auth/refresh').send({ refreshToken: user.tokens.refreshToken }).expect(401);

      const reuse = await request(server()).post('/auth/reset-password').send({ token, password: 'yet another password' }).expect(400);
      expect(reuse.body.error.code).toBe('INVALID_TOKEN');
    });

    it('invalidates earlier reset links when a new one is requested', async () => {
      const user = await registerUser(app);
      await request(server()).post('/auth/forgot-password').send({ email: user.email }).expect(200);
      const first = linkToken(mailbox(app).last(user.email)!.text, '/reset-password');
      await request(server()).post('/auth/forgot-password').send({ email: user.email }).expect(200);
      const second = linkToken(mailbox(app).last(user.email)!.text, '/reset-password');

      await request(server()).post('/auth/reset-password').send({ token: first, password: 'first new password' }).expect(400);
      await request(server()).post('/auth/reset-password').send({ token: second, password: 'second new password' }).expect(200);
    });

    it('does not reveal whether an account exists', async () => {
      const before = mailbox(app).sent.length;
      const res = await request(server()).post('/auth/forgot-password').send({ email: 'nobody-here@example.com' }).expect(200);
      expect(res.body).toEqual({ ok: true });
      expect(mailbox(app).sent.length).toBe(before);
    });

    it('changes the password when the current one is correct', async () => {
      const user = await registerUser(app);
      const wrong = await user.post('/auth/change-password', { currentPassword: 'not my password', newPassword: 'changed password 1' }).expect(400);
      expect(wrong.body.error.code).toBe('INVALID_PASSWORD');

      const res = await user.post('/auth/change-password', { currentPassword: user.password, newPassword: 'changed password 1' }).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      await request(server()).post('/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(200);
      await login(user.email, 'changed password 1').expect(200);
      // Sessions from before the change were revoked.
      await request(server()).post('/auth/refresh').send({ refreshToken: user.tokens.refreshToken }).expect(401);
    });
  });

  describe('two-factor authentication', () => {
    /** Enables TOTP; returns the secret and recovery codes. The enabling code used the current step. */
    async function enableTotp(user: User) {
      const setup = await user.post('/auth/2fa/totp/setup').expect(200);
      expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/Arvo:.+\?secret=/);
      expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      const secret = setup.body.secret as string;

      const wrong = await user.post('/auth/2fa/totp/enable', { code: '000000' === totp(secret) ? '111111' : '000000' }).expect(400);
      expect(wrong.body.error.code).toBe('INVALID_TWO_FACTOR_CODE');

      const enabled = await user.post('/auth/2fa/totp/enable', { code: totp(secret) }).expect(200);
      const recoveryCodes = enabled.body.recoveryCodes as string[];
      expect(recoveryCodes).toHaveLength(10);
      expect(mailbox(app).last(user.email)!.subject).toMatch(/Two-factor authentication is on/);
      return { secret, recoveryCodes };
    }

    async function challenge(user: User) {
      const res = await login(user.email, user.password).expect(200);
      expect(res.body).toEqual({ twoFactorRequired: true, challengeToken: expect.any(String), methods: ['totp', 'email', 'recovery'], expiresIn: 300 });
      expect(res.headers['set-cookie']).toBeUndefined();
      return res.body.challengeToken as string;
    }

    const verify = (challengeToken: string, method: string, code: string) =>
      request(server()).post('/auth/2fa/verify').send({ challengeToken, method, code });

    it('keeps the plain login response for users without 2FA', async () => {
      const user = await registerUser(app);
      const res = await login(user.email, user.password).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresIn', 'refreshToken', 'refreshTokenExpiresAt']);
      expect((await user.get('/auth/2fa')).body).toEqual({ enabled: false, enabledAt: null, recoveryCodesRemaining: 0 });
    });

    it('requires a second step after enabling TOTP and accepts an authenticator code', async () => {
      const user = await registerUser(app);
      const { secret } = await enableTotp(user);
      expect((await user.get('/me')).body.twoFactorEnabled).toBe(true);

      const token = await challenge(user);
      // The challenge token is not an access token.
      await request(server()).get('/me').set('Authorization', `Bearer ${token}`).expect(401);

      const next = totp(secret, Date.now() + 30_000);
      const res = await verify(token, 'totp', next).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.headers['set-cookie']?.[0]).toMatch(/arvo_refresh=/);
      await request(server()).get('/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);

      // The same code can't be replayed.
      await verify(await challenge(user), 'totp', next).expect(400);
      await verify('not-a-challenge', 'totp', next).expect(401);
    });

    it('accepts each recovery code once', async () => {
      const user = await registerUser(app);
      const { recoveryCodes } = await enableTotp(user);
      const code = recoveryCodes[0]!;

      await verify(await challenge(user), 'recovery', code.toUpperCase()).expect(200);
      await verify(await challenge(user), 'recovery', code).expect(400);
      expect((await user.get('/auth/2fa')).body).toMatchObject({ enabled: true, recoveryCodesRemaining: 9 });
    });

    it('signs in with an emailed code', async () => {
      const user = await registerUser(app);
      await enableTotp(user);
      const token = await challenge(user);

      await request(server()).post('/auth/2fa/email/send').send({ challengeToken: token }).expect(200);
      const mail = mailbox(app).last(user.email, /sign-in code/)!;
      const code = /(\d{6}) is your Arvo sign-in code/.exec(mail.subject)![1]!;
      expect(mail.text).toContain(code);

      await verify(token, 'email', code === '000000' ? '111111' : '000000').expect(400);
      await verify(token, 'email', code).expect(200);
      await verify(token, 'email', code).expect(400);
    });

    it('regenerates recovery codes and disables with password and code', async () => {
      const user = await registerUser(app);
      const { secret, recoveryCodes } = await enableTotp(user);

      const regenerated = await user.post('/auth/2fa/recovery-codes/regenerate', { code: totp(secret, Date.now() + 30_000) }).expect(200);
      expect(regenerated.body.recoveryCodes).toHaveLength(10);
      await verify(await challenge(user), 'recovery', recoveryCodes[1]!).expect(400);

      await user.post('/auth/2fa/disable', { password: 'wrong password!', code: regenerated.body.recoveryCodes[0] }).expect(400);
      await user.post('/auth/2fa/disable', { password: user.password, code: regenerated.body.recoveryCodes[0] }).expect(200);
      expect(mailbox(app).last(user.email)!.subject).toMatch(/turned off/);

      const res = await login(user.email, user.password).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect((await user.get('/me')).body.twoFactorEnabled).toBe(false);
    });

    it('locks the second factor after repeated wrong codes', async () => {
      const user = await registerUser(app);
      const { recoveryCodes } = await enableTotp(user);
      const token = await challenge(user);
      for (let i = 0; i < 5; i++) {
        const res = await verify(token, 'recovery', 'wrong-code-00');
        expect(res.status).toBe(400);
      }
      const locked = await verify(token, 'recovery', recoveryCodes[0]!).expect(429);
      expect(locked.body.error.code).toBe('TWO_FACTOR_LOCKED');
      await request(server()).post('/auth/2fa/email/send').send({ challengeToken: token }).expect(429);
    });
  });
});
