import type { INestApplication } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { createTestApp, registerUser } from './app';

const MCP = 'http://localhost:3302/mcp';
const REDIRECT = 'https://client.example.com/oauth/callback';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

describe('OAuth authorization server for MCP (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.MCP_RESOURCE_URL = MCP;
    process.env.PUBLIC_API_URL = 'http://localhost:3301';
    process.env.PUBLIC_WEB_URL = 'http://localhost:3300';
    app = await createTestApp();
  });
  afterAll(() => app.close());

  const server = () => app.getHttpServer();

  async function registerClient(redirectUris = [REDIRECT]) {
    const res = await request(server()).post('/oauth/register').send({ client_name: 'Test Assistant', redirect_uris: redirectUris }).expect(201);
    return res.body.client_id as string;
  }

  async function authorizeAndApprove(user: Awaited<ReturnType<typeof registerUser>>, clientId: string, challenge: string, extra: Record<string, string> = {}) {
    const authorize = await request(server())
      .get('/oauth/authorize')
      .query({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'finance:read', resource: MCP, ...extra })
      .expect(302);
    const consent = new URL(authorize.headers.location);
    expect(`${consent.origin}${consent.pathname}`).toBe('http://localhost:3300/oauth/consent');
    const requestId = consent.searchParams.get('request')!;

    const details = await user.get(`/oauth/requests/${requestId}`).expect(200);
    expect(details.body).toMatchObject({ client: { name: 'Test Assistant' }, redirectHost: 'client.example.com', scopes: ['finance:read'] });

    const decision = await user.post(`/oauth/requests/${requestId}/decision`, { approve: true }).expect(200);
    const callback = new URL(decision.body.redirectTo);
    expect(`${callback.origin}${callback.pathname}`).toBe(REDIRECT);
    expect(callback.searchParams.get('state')).toBe('xyz');
    expect(callback.searchParams.get('iss')).toBe('http://localhost:3301');
    return callback.searchParams.get('code')!;
  }

  it('publishes authorization server metadata', async () => {
    const res = await request(server()).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body).toMatchObject({
      issuer: 'http://localhost:3301',
      token_endpoint: 'http://localhost:3301/oauth/token',
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
    });
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('runs the authorization code flow with PKCE, rotates refresh tokens and detects replay', async () => {
    const user = await registerUser(app);
    const clientId = await registerClient();
    const { verifier, challenge } = pkce();
    const code = await authorizeAndApprove(user, clientId, challenge);

    const wrongVerifier = await request(server())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: pkce().verifier, resource: MCP })
      .expect(400);
    expect(wrongVerifier.body).toEqual({ error: 'invalid_grant', error_description: 'PKCE verification failed' });

    const tokens = await request(server())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier, resource: MCP })
      .expect(200);
    expect(tokens.headers['cache-control']).toBe('no-store');
    expect(tokens.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'finance:read' });
    expect(tokens.body.access_token).toMatch(/^arvo_oat_/);
    expect(tokens.body.refresh_token).toMatch(/^arvo_ort_/);

    const rotated = await request(server())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: tokens.body.refresh_token, client_id: clientId })
      .expect(200);
    expect(rotated.body.refresh_token).not.toBe(tokens.body.refresh_token);

    const connections = await user.get('/me/connections').expect(200);
    expect(connections.body.items).toEqual([expect.objectContaining({ clientId, name: 'Test Assistant', scope: 'finance:read' })]);

    // Replaying the rotated-out refresh token revokes the client's access entirely.
    await request(server()).post('/oauth/token').type('form').send({ grant_type: 'refresh_token', refresh_token: tokens.body.refresh_token, client_id: clientId }).expect(400);
    await request(server()).post('/oauth/token').type('form').send({ grant_type: 'refresh_token', refresh_token: rotated.body.refresh_token, client_id: clientId }).expect(400);
    expect((await user.get('/me/connections')).body.items).toEqual([]);
  });

  it('treats a replayed authorization code as theft and revokes the tokens it produced', async () => {
    const user = await registerUser(app);
    const clientId = await registerClient();
    const { verifier, challenge } = pkce();
    const code = await authorizeAndApprove(user, clientId, challenge);
    const exchange = () =>
      request(server())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier });
    const tokens = await exchange().expect(200);
    expect((await user.get('/me/connections')).body.items).toHaveLength(1);
    await exchange().expect(400);
    expect((await user.get('/me/connections')).body.items).toEqual([]);
    await request(server()).post('/oauth/token').type('form').send({ grant_type: 'refresh_token', refresh_token: tokens.body.refresh_token, client_id: clientId }).expect(400);
  });

  it('rejects unregistered redirects without redirecting, and returns other errors to the client', async () => {
    const clientId = await registerClient();
    const { challenge } = pkce();
    const evil = await request(server())
      .get('/oauth/authorize')
      .query({ response_type: 'code', client_id: clientId, redirect_uri: 'https://evil.example.com/cb', code_challenge: challenge, code_challenge_method: 'S256' })
      .expect(400);
    expect(evil.headers.location).toBeUndefined();
    expect(evil.text).toContain('redirect_uri is not registered');

    const noPkce = await request(server()).get('/oauth/authorize').query({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, state: 's1' }).expect(302);
    const back = new URL(noPkce.headers.location);
    expect(back.searchParams.get('error')).toBe('invalid_request');
    expect(back.searchParams.get('state')).toBe('s1');

    const wrongAudience = await request(server())
      .get('/oauth/authorize')
      .query({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', resource: 'https://other.example.com/mcp' })
      .expect(302);
    expect(new URL(wrongAudience.headers.location).searchParams.get('error')).toBe('invalid_target');

    await request(server()).post('/oauth/register').send({ redirect_uris: ['http://evil.example.com/cb'] }).expect(400);
    await request(server()).post('/oauth/register').send({ redirect_uris: ['javascript:alert(1)'] }).expect(400);
  });

  it('allows loopback redirects on any port, denial, disconnect and revocation', async () => {
    const user = await registerUser(app);
    const clientId = await registerClient(['http://127.0.0.1/callback']);
    const { challenge } = pkce();
    const authorize = await request(server())
      .get('/oauth/authorize')
      .query({ response_type: 'code', client_id: clientId, redirect_uri: 'http://127.0.0.1:53682/callback', code_challenge: challenge, code_challenge_method: 'S256', resource: MCP })
      .expect(302);
    const requestId = new URL(authorize.headers.location).searchParams.get('request')!;
    const denied = await user.post(`/oauth/requests/${requestId}/decision`, { approve: false }).expect(200);
    expect(new URL(denied.body.redirectTo).searchParams.get('error')).toBe('access_denied');
    await user.post(`/oauth/requests/${requestId}/decision`, { approve: true }).expect(404);

    const other = await registerUser(app);
    const client2 = await registerClient();
    const { verifier, challenge: challenge2 } = pkce();
    const code = await authorizeAndApprove(other, client2, challenge2);
    const tokens = await request(server())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code, client_id: client2, redirect_uri: REDIRECT, code_verifier: verifier })
      .expect(200);
    await user.delete(`/me/connections?client_id=${encodeURIComponent(client2)}`).expect(404);
    await request(server()).post('/oauth/revoke').type('form').send({ token: tokens.body.access_token }).expect(200);
    expect((await other.get('/me/connections')).body.items).toEqual([]);
  });
});
