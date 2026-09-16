import { resolveApiToken, UserEntity } from '@arvo/database';
import type { FinanceCore } from '@arvo/finance-core';
import type { ToolContext } from '@arvo/finance-tools';
import type { DataSource } from 'typeorm';

export interface AuthenticatedCaller {
  userId: string;
  tokenId: string;
}

/** Resolves a bearer token to its user. The token, never tool input, decides whose data is used. */
export async function authenticate(dataSource: DataSource, authorization: string | undefined): Promise<AuthenticatedCaller | null> {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  const resolved = await resolveApiToken(dataSource, token);
  if (!resolved || !resolved.scopes.includes('read')) return null;
  return { userId: resolved.userId, tokenId: resolved.tokenId };
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
