import { createHash, randomBytes } from 'node:crypto';
import { IsNull, type DataSource } from 'typeorm';
import { ApiTokenEntity, type ApiTokenScope } from './entities/api-token.entity';
import { OAuthTokenEntity } from './entities/oauth.entities';

export const API_TOKEN_PREFIX = 'arvo_pat_';

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, API_TOKEN_PREFIX.length + 6), hash: hashApiToken(token) };
}

/**
 * Resolves a bearer token to its owner. Returns null for unknown, revoked or expired tokens.
 * Updates last_used_at at most once a minute to avoid a write per request.
 */
export async function resolveApiToken(
  dataSource: DataSource,
  token: string,
): Promise<{ userId: string; tokenId: string; scopes: ApiTokenScope[] } | null> {
  if (!token.startsWith(API_TOKEN_PREFIX) || token.length > 200) return null;
  const repo = dataSource.getRepository(ApiTokenEntity);
  const row = await repo.findOneBy({ tokenHash: hashApiToken(token), revokedAt: IsNull() });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await repo.update({ id: row.id }, { lastUsedAt: new Date() });
  }
  return { userId: row.userId, tokenId: row.id, scopes: row.scopes };
}

export const OAUTH_ACCESS_PREFIX = 'arvo_oat_';
export const OAUTH_REFRESH_PREFIX = 'arvo_ort_';
export const OAUTH_SCOPE_READ = 'finance:read';

export function generateOAuthTokens(): { accessToken: string; refreshToken: string; accessHash: string; refreshHash: string } {
  const accessToken = `${OAUTH_ACCESS_PREFIX}${randomBytes(32).toString('base64url')}`;
  const refreshToken = `${OAUTH_REFRESH_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { accessToken, refreshToken, accessHash: hashApiToken(accessToken), refreshHash: hashApiToken(refreshToken) };
}

/**
 * Resolves an OAuth access token issued for `resource`. Tokens issued for any other audience,
 * expired or revoked tokens return null (the MCP server then answers 401).
 */
export async function resolveOAuthAccessToken(
  dataSource: DataSource,
  token: string,
  resource: string,
): Promise<{ userId: string; clientId: string; scopes: string[] } | null> {
  if (!token.startsWith(OAUTH_ACCESS_PREFIX) || token.length > 200) return null;
  const repo = dataSource.getRepository(OAuthTokenEntity);
  const row = await repo.findOneBy({ accessTokenHash: hashApiToken(token), revokedAt: IsNull() });
  if (!row || row.accessExpiresAt.getTime() <= Date.now()) return null;
  if (normalizeResource(row.resource) !== normalizeResource(resource)) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await repo.update({ id: row.id }, { lastUsedAt: new Date() });
  }
  return { userId: row.userId, clientId: row.clientId, scopes: row.scope.split(' ').filter(Boolean) };
}

/** Canonical comparison form for resource URIs: lowercase scheme and host, no trailing slash. */
export function normalizeResource(uri: string): string {
  try {
    const url = new URL(uri);
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return uri;
  }
}
