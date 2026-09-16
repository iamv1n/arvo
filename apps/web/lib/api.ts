import type { ApiErrorBody } from '@arvo/types';
import type { TokenResponse } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3301';
export const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? 'http://localhost:3302/mcp';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/*
 * The access token lives only in memory. The refresh token is an httpOnly cookie set by the
 * API, so a page reload restores the session through /auth/refresh without exposing the token
 * to JavaScript.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
const listeners = new Set<(signedIn: boolean) => void>();

export function onSessionChange(listener: (signedIn: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSession(tokens: TokenResponse | null): void {
  accessToken = tokens?.accessToken ?? null;
  listeners.forEach((listener) => listener(accessToken !== null));
}

/**
 * Refresh tokens rotate and a replayed token revokes every session, so concurrent callers
 * (parallel queries, React StrictMode double effects) must share one refresh request.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then(async (res) => {
      if (!res.ok) {
        setSession(null);
        return false;
      }
      setSession((await res.json()) as TokenResponse);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Auth endpoints manage cookies and must not trigger a refresh retry. */
  auth?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = options;
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  const send = () =>
    fetch(url, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && auth && (await refreshSession())) {
    res = await send();
  }
  if (res.status === 204) return undefined as T;

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, error?.code ?? 'HTTP_ERROR', error?.message ?? res.statusText, error?.details);
  }
  return payload as T;
}

/** Multipart upload with the same auth and error handling as api(). */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const send = () =>
    fetch(new URL(path, API_URL), {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, error?.code ?? 'HTTP_ERROR', error?.message ?? res.statusText, error?.details);
  }
  return payload as T;
}

/** Authenticated file download: fetches the blob and saves it under the server-provided name. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const send = () =>
    fetch(new URL(path, API_URL), {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'The file could not be downloaded');
  const disposition = res.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: encoded ? decodeURIComponent(encoded) : fallbackName });
  link.click();
  URL.revokeObjectURL(url);
}

/** Human-readable message for an unknown error, including field-level validation details. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = Array.isArray(error.details)
      ? (error.details as { field: string; messages: string[] }[]).flatMap((d) => d.messages)
      : [];
    return fields.length ? fields.join('; ') : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}
