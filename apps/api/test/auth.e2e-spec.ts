import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser } from './app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('registers, reads the profile and never returns the password hash', async () => {
    const user = await registerUser(app);
    const me = await user.get('/me').expect(200);
    expect(me.body).toMatchObject({ email: user.email, currency: 'INR', timezone: 'Asia/Kolkata' });
    expect(JSON.stringify(me.body)).not.toMatch(/password/i);
  });

  it('rejects duplicate email and invalid input with the standard error shape', async () => {
    const user = await registerUser(app);
    const dup = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: user.email.toUpperCase(), password: 'another long password', name: 'X' })
      .expect(409);
    expect(dup.body).toEqual({ error: { code: 'EMAIL_ALREADY_REGISTERED', message: expect.any(String) } });

    const bad = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'nope', password: 'short', name: '', isAdmin: true })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(
      ['email', 'isAdmin', 'name', 'password'],
    );
  });

  it('logs in and rejects wrong credentials identically for unknown emails', async () => {
    const user = await registerUser(app);
    const server = app.getHttpServer();
    await request(server).post('/auth/login').send({ email: user.email, password: user.password }).expect(200);
    const wrong = await request(server).post('/auth/login').send({ email: user.email, password: 'wrong password!' }).expect(401);
    const unknown = await request(server)
      .post('/auth/login')
      .send({ email: 'ghost@example.com', password: 'wrong password!' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('rotates refresh tokens and revokes all sessions when a used token is replayed', async () => {
    const user = await registerUser(app);
    const server = app.getHttpServer();
    const first = user.tokens.refreshToken;

    const rotated = await request(server).post('/auth/refresh').send({ refreshToken: first }).expect(200);
    expect(rotated.body.refreshToken).not.toBe(first);
    expect(rotated.headers['set-cookie']?.[0]).toMatch(/arvo_refresh=.*HttpOnly/);

    await request(server).post('/auth/refresh').send({ refreshToken: first }).expect(401);
    // The replay revoked the rotated token too.
    await request(server).post('/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
  });

  it('accepts the refresh token from the httpOnly cookie and revokes it on logout', async () => {
    const server = app.getHttpServer();
    const user = await registerUser(app);
    const login = await request(server).post('/auth/login').send({ email: user.email, password: user.password });
    const cookie = login.headers['set-cookie'] as unknown as string[];

    await request(server).post('/auth/refresh').set('Cookie', cookie).expect(200).then(async (res) => {
      const next = res.headers['set-cookie'] as unknown as string[];
      await request(server).post('/auth/logout').set('Cookie', next).expect(204);
      await request(server).post('/auth/refresh').set('Cookie', next).expect(401);
    });
  });

  it('requires a valid access token on protected routes', async () => {
    const server = app.getHttpServer();
    await request(server).get('/accounts').expect(401);
    await request(server).get('/accounts').set('Authorization', 'Bearer not.a.jwt').expect(401);
    const user = await registerUser(app);
    // A refresh token is not an access token.
    await request(server).get('/accounts').set('Authorization', `Bearer ${user.tokens.refreshToken}`).expect(401);
  });
});
