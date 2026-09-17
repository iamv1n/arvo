import {
  generateOAuthTokens,
  hashApiToken,
  normalizeResource,
  OAUTH_SCOPE_READ,
  OAuthAuthorizationEntity,
  OAuthClientEntity,
  OAuthTokenEntity,
} from '@arvo/database';
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { DataSource, IsNull, LessThan, type EntityManager } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_DAYS = 30;
const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60_000;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60_000;
const CIMD_REFRESH_MS = 24 * 3600_000;
const SUPPORTED_SCOPES = [OAUTH_SCOPE_READ];
/** Requested by some clients to get refresh tokens; accepted and not stored as a resource scope. */
const IGNORED_SCOPES = ['offline_access'];

/** RFC 6749 error. `redirect` errors are sent back to the client's redirect_uri. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
}

type Params = Record<string, unknown>;
const str = (params: Params, key: string): string | undefined => {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

function isLoopback(url: URL): boolean {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** Exact match, except loopback redirects may use any port (RFC 8252 §7.3). */
function redirectMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  try {
    const a = new URL(registered);
    const b = new URL(requested);
    return (
      isLoopback(a) &&
      isLoopback(b) &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === b.search
    );
  } catch {
    return false;
  }
}

function validRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    if (isLoopback(url)) return true;
    // Private-use URI schemes for native apps (e.g. com.example.app:/callback), never javascript: or data:.
    return /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/i.test(url.protocol);
  } catch {
    return false;
  }
}

/**
 * OAuth 2.1 authorization server for the MCP server, per the MCP authorization spec: authorization
 * server metadata, Client ID Metadata Documents and Dynamic Client Registration, authorization code
 * with PKCE (S256), RFC 8707 resource binding, RFC 9207 iss, refresh token rotation and revocation.
 */
@Injectable()
export class OAuthService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get issuer(): string {
    return this.config.publicApiUrl;
  }

  metadata() {
    const base = this.issuer;
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      revocation_endpoint: `${base}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...SUPPORTED_SCOPES, ...IGNORED_SCOPES],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      service_documentation: `${this.config.publicWebUrl}/settings?tab=ai`,
    };
  }

  /** RFC 7591 dynamic registration for public clients (no client secrets are issued). */
  async register(body: Params) {
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (
      redirectUris.length === 0 ||
      redirectUris.length > 10 ||
      !redirectUris.every((u) => typeof u === 'string' && validRedirectUri(u))
    ) {
      throw new OAuthError(
        'invalid_redirect_uri',
        'redirect_uris must contain 1–10 https, loopback or private-use scheme URIs',
      );
    }
    const grantTypes = Array.isArray(body.grant_types)
      ? (body.grant_types as unknown[])
      : ['authorization_code'];
    if (!grantTypes.every((g) => g === 'authorization_code' || g === 'refresh_token')) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Only authorization_code and refresh_token grants are supported',
      );
    }
    const clientName = (str(body, 'client_name') ?? 'MCP client').slice(0, 200);
    const client = await this.dataSource.getRepository(OAuthClientEntity).save({
      clientId: `arvo_client_${randomUUID()}`,
      clientName,
      redirectUris: redirectUris as string[],
      clientUri: safeHttpsUrl(str(body, 'client_uri')),
      logoUri: safeHttpsUrl(str(body, 'logo_uri')),
      registrationType: 'DCR',
      fetchedAt: null,
    });
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  /** Looks up a registered client, or fetches and caches a Client ID Metadata Document. */
  async resolveClient(clientId: string): Promise<OAuthClientEntity | null> {
    const repo = this.dataSource.getRepository(OAuthClientEntity);
    const existing = await repo.findOneBy({ clientId });
    if (
      existing &&
      (existing.registrationType === 'DCR' ||
        (existing.fetchedAt && Date.now() - existing.fetchedAt.getTime() < CIMD_REFRESH_MS))
    ) {
      return existing;
    }
    if (!clientId.startsWith('https://')) return existing;
    const document = await fetchClientMetadataDocument(clientId);
    if (!document) return existing;
    return repo.save({
      clientId,
      clientName: document.clientName,
      redirectUris: document.redirectUris,
      clientUri: document.clientUri,
      logoUri: document.logoUri,
      registrationType: 'CIMD',
      fetchedAt: new Date(),
    });
  }

  /**
   * Validates an authorization request. Errors about the client or redirect URI are shown to the
   * user (never redirected); other errors go back to the client's redirect URI.
   */
  async authorize(params: Params): Promise<{ redirect: string }> {
    const clientId = str(params, 'client_id');
    const redirectUri = str(params, 'redirect_uri');
    if (!clientId) throw new OAuthError('invalid_request', 'client_id is required');
    const client = await this.resolveClient(clientId);
    if (!client) throw new OAuthError('invalid_client', 'Unknown client');
    const redirect =
      redirectUri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (
      !redirect ||
      !client.redirectUris.some((registered) => redirectMatches(registered, redirect))
    ) {
      throw new OAuthError('invalid_request', 'redirect_uri is not registered for this client');
    }

    const state = str(params, 'state') ?? null;
    const back = (error: string, description: string) => ({
      redirect: this.redirectWith(redirect, { error, error_description: description, state }),
    });

    if (str(params, 'response_type') !== 'code')
      return back('unsupported_response_type', 'response_type must be code');
    const codeChallenge = str(params, 'code_challenge');
    if (
      !codeChallenge ||
      str(params, 'code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
    ) {
      return back('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    const resource = str(params, 'resource') ?? this.config.mcpResourceUrl;
    if (normalizeResource(resource) !== normalizeResource(this.config.mcpResourceUrl)) {
      return back('invalid_target', 'resource must be this Arvo MCP server');
    }
    const requested = (str(params, 'scope') ?? OAUTH_SCOPE_READ).split(' ').filter(Boolean);
    if (requested.some((s) => !SUPPORTED_SCOPES.includes(s) && !IGNORED_SCOPES.includes(s))) {
      return back('invalid_scope', `Supported scopes: ${SUPPORTED_SCOPES.join(' ')}`);
    }
    const scope =
      requested.filter((s) => SUPPORTED_SCOPES.includes(s)).join(' ') || OAUTH_SCOPE_READ;

    const repo = this.dataSource.getRepository(OAuthAuthorizationEntity);
    await repo.delete({ expiresAt: LessThan(new Date()) });
    const request = await repo.save({
      clientId: client.clientId,
      userId: null,
      redirectUri: redirect,
      scope,
      state,
      codeChallenge,
      resource: this.config.mcpResourceUrl,
      status: 'PENDING',
      codeHash: null,
      expiresAt: new Date(Date.now() + AUTHORIZATION_REQUEST_TTL_MS),
    });
    return { redirect: `${this.config.publicWebUrl}/oauth/consent?request=${request.id}` };
  }

  /** What the consent page shows. Only pending, unexpired requests are visible. */
  async pendingRequest(id: string) {
    const request = await this.dataSource
      .getRepository(OAuthAuthorizationEntity)
      .findOne({ where: { id, status: 'PENDING' }, relations: { client: true } });
    if (!request || request.expiresAt.getTime() <= Date.now() || !request.client) {
      throw new OAuthError(
        'invalid_request',
        'This authorization request has expired or was already used',
        404,
      );
    }
    return {
      id: request.id,
      client: {
        name: request.client.clientName,
        clientUri: request.client.clientUri,
        logoUri: request.client.logoUri,
        verified: request.client.registrationType === 'CIMD',
        clientId: request.client.clientId,
      },
      redirectHost: new URL(request.redirectUri).host || new URL(request.redirectUri).protocol,
      scopes: request.scope.split(' '),
      resource: request.resource,
      expiresAt: request.expiresAt,
    };
  }

  /** Records the user's decision and returns where to send the browser next. */
  async decide(id: string, userId: string, approve: boolean): Promise<{ redirectTo: string }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OAuthAuthorizationEntity);
      const request = await repo.findOne({
        where: { id, status: 'PENDING' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.expiresAt.getTime() <= Date.now()) {
        throw new OAuthError(
          'invalid_request',
          'This authorization request has expired or was already used',
          404,
        );
      }
      if (!approve) {
        await repo.update({ id }, { status: 'DENIED', userId });
        return {
          redirectTo: this.redirectWith(request.redirectUri, {
            error: 'access_denied',
            error_description: 'The user denied access',
            state: request.state,
          }),
        };
      }
      const code = randomBytes(32).toString('base64url');
      await repo.update(
        { id },
        {
          status: 'APPROVED',
          userId,
          codeHash: hashApiToken(code),
          expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
        },
      );
      return { redirectTo: this.redirectWith(request.redirectUri, { code, state: request.state }) };
    });
  }

  async token(params: Params) {
    const grantType = str(params, 'grant_type');
    if (grantType === 'authorization_code') return this.exchangeCode(params);
    if (grantType === 'refresh_token') return this.refresh(params);
    throw new OAuthError(
      'unsupported_grant_type',
      'grant_type must be authorization_code or refresh_token',
    );
  }

  private async exchangeCode(params: Params) {
    const code = str(params, 'code');
    const clientId = str(params, 'client_id');
    const verifier = str(params, 'code_verifier');
    if (!code || !clientId || !verifier)
      throw new OAuthError('invalid_request', 'code, client_id and code_verifier are required');

    // Revocations triggered by replay must survive the failed transaction, so they run afterwards.
    let replayedBy: { userId: string; clientId: string } | null = null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(OAuthAuthorizationEntity);
        const grant = await repo.findOne({
          where: { codeHash: hashApiToken(code) },
          lock: { mode: 'pessimistic_write' },
        });
        const invalid = new OAuthError(
          'invalid_grant',
          'The authorization code is invalid, expired or already used',
        );
        if (
          !grant ||
          grant.status !== 'APPROVED' ||
          !grant.userId ||
          grant.expiresAt.getTime() <= Date.now()
        ) {
          // A replayed code revokes what it produced (OAuth 2.1 §4.1.3).
          if (grant?.status === 'USED' && grant.userId)
            replayedBy = { userId: grant.userId, clientId: grant.clientId };
          throw invalid;
        }
        if (grant.clientId !== clientId) throw invalid;
        const redirectUri = str(params, 'redirect_uri');
        if (redirectUri && redirectUri !== grant.redirectUri) throw invalid;
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (challenge !== grant.codeChallenge)
          throw new OAuthError('invalid_grant', 'PKCE verification failed');
        const resource = str(params, 'resource');
        if (resource && normalizeResource(resource) !== normalizeResource(grant.resource)) {
          throw new OAuthError(
            'invalid_target',
            'resource does not match the authorization request',
          );
        }
        await repo.update({ id: grant.id }, { status: 'USED' });
        return this.issue(manager, grant.userId, grant.clientId, grant.scope, grant.resource);
      });
    } finally {
      const replay = replayedBy as { userId: string; clientId: string } | null;
      if (replay) await this.revokeGrants(this.dataSource.manager, replay.userId, replay.clientId);
    }
  }

  private async refresh(params: Params) {
    const refreshToken = str(params, 'refresh_token');
    const clientId = str(params, 'client_id');
    if (!refreshToken || !clientId)
      throw new OAuthError('invalid_request', 'refresh_token and client_id are required');
    let reusedBy: { userId: string; clientId: string } | null = null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(OAuthTokenEntity);
        const row = await repo.findOne({
          where: { refreshTokenHash: hashApiToken(refreshToken) },
          lock: { mode: 'pessimistic_write' },
        });
        const invalid = new OAuthError('invalid_grant', 'The refresh token is invalid or expired');
        if (!row || row.clientId !== clientId) throw invalid;
        if (row.revokedAt) {
          // Reuse of a rotated refresh token: assume theft and end this client's access.
          reusedBy = { userId: row.userId, clientId: row.clientId };
          throw invalid;
        }
        if (row.refreshExpiresAt.getTime() <= Date.now()) throw invalid;
        const resource = str(params, 'resource');
        if (resource && normalizeResource(resource) !== normalizeResource(row.resource)) {
          throw new OAuthError('invalid_target', 'resource does not match the original grant');
        }
        await repo.update({ id: row.id }, { revokedAt: new Date() });
        return this.issue(manager, row.userId, row.clientId, row.scope, row.resource);
      });
    } finally {
      const reuse = reusedBy as { userId: string; clientId: string } | null;
      if (reuse) await this.revokeGrants(this.dataSource.manager, reuse.userId, reuse.clientId);
    }
  }

  /** RFC 7009: revokes the grant owning an access or refresh token. Unknown tokens are not an error. */
  async revoke(params: Params): Promise<void> {
    const token = str(params, 'token');
    if (!token) return;
    const hash = hashApiToken(token);
    const repo = this.dataSource.getRepository(OAuthTokenEntity);
    await repo.update({ accessTokenHash: hash, revokedAt: IsNull() }, { revokedAt: new Date() });
    await repo.update({ refreshTokenHash: hash, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Apps the user has authorized, with their most recent activity. */
  async connections(userId: string) {
    const rows = await this.dataSource
      .getRepository(OAuthTokenEntity)
      .find({
        where: { userId, revokedAt: IsNull() },
        relations: { client: true },
        order: { createdAt: 'DESC' },
      });
    const byClient = new Map<
      string,
      {
        clientId: string;
        name: string;
        clientUri: string | null;
        scope: string;
        connectedAt: Date;
        lastUsedAt: Date | null;
      }
    >();
    for (const row of rows) {
      if (row.refreshExpiresAt.getTime() <= Date.now()) continue;
      const current = byClient.get(row.clientId);
      const lastUsed = row.lastUsedAt;
      if (!current) {
        byClient.set(row.clientId, {
          clientId: row.clientId,
          name: row.client?.clientName ?? row.clientId,
          clientUri: row.client?.clientUri ?? null,
          scope: row.scope,
          connectedAt: row.createdAt,
          lastUsedAt: lastUsed,
        });
      } else if (lastUsed && (!current.lastUsedAt || lastUsed > current.lastUsedAt)) {
        current.lastUsedAt = lastUsed;
      }
    }
    return [...byClient.values()];
  }

  async disconnect(userId: string, clientId: string): Promise<number> {
    return this.revokeGrants(this.dataSource.manager, userId, clientId);
  }

  private async revokeGrants(
    manager: EntityManager,
    userId: string,
    clientId: string,
  ): Promise<number> {
    const result = await manager
      .getRepository(OAuthTokenEntity)
      .update({ userId, clientId, revokedAt: IsNull() }, { revokedAt: new Date() });
    return result.affected ?? 0;
  }

  private async issue(
    manager: EntityManager,
    userId: string,
    clientId: string,
    scope: string,
    resource: string,
  ) {
    const tokens = generateOAuthTokens();
    await manager.getRepository(OAuthTokenEntity).save({
      userId,
      clientId,
      scope,
      resource,
      accessTokenHash: tokens.accessHash,
      accessExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshTokenHash: tokens.refreshHash,
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      lastUsedAt: null,
      revokedAt: null,
    });
    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: tokens.refreshToken,
      scope,
    };
  }

  private redirectWith(redirectUri: string, params: Record<string, string | null>): string {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
    url.searchParams.set('iss', this.issuer);
    return url.toString();
  }
}

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString().slice(0, 512) : null;
  } catch {
    return null;
  }
}

/**
 * Fetches a Client ID Metadata Document with SSRF guards: HTTPS only, no IP-literal or local
 * hostnames, no redirects, 5 second timeout and a 64 KB size limit. The document's client_id must
 * equal its own URL.
 */
async function fetchClientMetadataDocument(
  url: string,
): Promise<{
  clientName: string;
  redirectUris: string[];
  clientUri: string | null;
  logoUri: string | null;
} | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (
    parsed.protocol !== 'https:' ||
    isIP(host) ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    !host.includes('.')
  )
    return null;
  try {
    const res = await fetch(parsed, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 64_000) return null;
    const doc = JSON.parse(text) as Params;
    if (doc.client_id !== url) return null;
    const redirectUris = Array.isArray(doc.redirect_uris)
      ? doc.redirect_uris.filter((u): u is string => typeof u === 'string' && validRedirectUri(u))
      : [];
    if (redirectUris.length === 0) return null;
    return {
      clientName: (str(doc, 'client_name') ?? parsed.host).slice(0, 200),
      redirectUris: redirectUris.slice(0, 10),
      clientUri: safeHttpsUrl(str(doc, 'client_uri')),
      logoUri: safeHttpsUrl(str(doc, 'logo_uri')),
    };
  } catch {
    return null;
  }
}
