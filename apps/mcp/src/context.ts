import { OAUTH_SCOPE_READ, resolveApiToken, resolveOAuthAccessToken, UserEntity } from '@arvo/database';
import type { FinanceCore } from '@arvo/finance-core';
import type { ToolContext } from '@arvo/finance-tools';
import type { DataSource } from 'typeorm';

export interface AuthenticatedCaller {
  userId: string;
  /** Personal access token id or OAuth client id. */
  via: { kind: 'pat'; tokenId: string } | { kind: 'oauth'; clientId: string };
}

/**
 * Resolves a bearer token to its user: a personal access token (arvo_pat_…) or an OAuth access
 * token (arvo_oat_…) issued for this MCP server's resource URI. The token, never tool input,
 * decides whose data is used; tokens for other audiences are rejected.
 */
export async function authenticate(
  dataSource: DataSource,
  authorization: string | undefined,
  resource: string,
): Promise<AuthenticatedCaller | null> {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  const pat = await resolveApiToken(dataSource, token);
  if (pat) return pat.scopes.includes('read') ? { userId: pat.userId, via: { kind: 'pat', tokenId: pat.tokenId } } : null;
  const oauth = await resolveOAuthAccessToken(dataSource, token, resource);
  if (oauth?.scopes.includes(OAUTH_SCOPE_READ)) return { userId: oauth.userId, via: { kind: 'oauth', clientId: oauth.clientId } };
  return null;
}

/** Today's date in the user's timezone, so "this month" matches what the user sees. */
export function todayIn(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export async function toolContext(dataSource: DataSource, core: FinanceCore, userId: string): Promise<ToolContext | null> {
  const user = await dataSource.getRepository(UserEntity).findOneBy({ id: userId });
  if (!user) return null;
  return { core, userId, currency: user.currency, today: todayIn(user.timezone) };
}
