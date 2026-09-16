import { createHash, randomBytes } from 'node:crypto';
import { IsNull, type DataSource } from 'typeorm';
import { ApiTokenEntity, type ApiTokenScope } from './entities/api-token.entity';

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
