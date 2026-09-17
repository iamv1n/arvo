import { loadAIConfig, type AIConfig } from '@arvo/ai';
import { createHash } from 'node:crypto';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  corsOrigins: string[];
  storagePath: string;
  /** Public base URL of this API; also the OAuth issuer. */
  publicApiUrl: string;
  /** Public base URL of the web app (OAuth consent page). */
  publicWebUrl: string;
  /** Canonical URI of the MCP server; OAuth tokens are bound to it (RFC 8707). */
  mcpResourceUrl: string;
  mail: MailConfig;
  /** When true, unverified users cannot sign in. */
  requireEmailVerification: boolean;
  /** 32-byte key for encrypting TOTP secrets at rest. */
  twoFactorEncryptionKey: Buffer;
  /** True when TWO_FACTOR_ENCRYPTION_KEY was not set and a key was derived from JWT_SECRET. */
  twoFactorKeyDerived: boolean;
  /** Email a notice after every new sign-in. */
  loginAlerts: boolean;
  /** Run the hourly statement upload reminder job. */
  remindersEnabled: boolean;
  /** AI advisor provider settings (API keys never leave the server). */
  ai: AIConfig;
  /** Run the hourly job that emails weekly briefings on Monday mornings. */
  weeklyBriefingEnabled: boolean;
}

export type MailDriver = 'smtp' | 'console' | 'memory';

export interface MailConfig {
  driver: MailDriver;
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Reads and validates configuration once at startup; fails fast on bad values. */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is required`);
    return value ?? '';
  };
  const positiveInt = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) problems.push(`${name} must be a positive integer`);
    return value;
  };

  const nodeEnv = env.NODE_ENV ?? 'development';
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (nodeEnv === 'production' && jwtSecret.startsWith('change-me')) {
    problems.push('JWT_SECRET must be changed from the example value in production');
  }

  const bool = (name: string, fallback: boolean): boolean => {
    const raw = env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    if (['true', '1', 'yes'].includes(raw)) return true;
    if (['false', '0', 'no'].includes(raw)) return false;
    problems.push(`${name} must be true or false`);
    return fallback;
  };

  const driver = (env.MAIL_DRIVER?.trim() || (nodeEnv === 'test' ? 'memory' : 'console')) as MailDriver;
  if (!['smtp', 'console', 'memory'].includes(driver)) problems.push('MAIL_DRIVER must be smtp, console or memory');
  if (driver === 'smtp' && !env.MAIL_HOST?.trim()) problems.push('MAIL_HOST is required when MAIL_DRIVER=smtp');

  const rawKey = env.TWO_FACTOR_ENCRYPTION_KEY?.trim();
  let twoFactorEncryptionKey: Buffer;
  if (rawKey) {
    twoFactorEncryptionKey = parseKey(rawKey);
    if (twoFactorEncryptionKey.length !== 32) problems.push('TWO_FACTOR_ENCRYPTION_KEY must be 32 bytes (base64 or hex)');
  } else {
    twoFactorEncryptionKey = createHash('sha256').update(`arvo-2fa:${jwtSecret}`).digest();
  }

  const ai = loadAIConfig(env);
  problems.push(...ai.problems);

  const config: AppConfig = {
    nodeEnv,
    port: positiveInt('PORT', 3301),
    databaseUrl: required('DATABASE_URL'),
    jwtSecret,
    jwtAccessTtlSeconds: positiveInt('JWT_ACCESS_TTL_SECONDS', 900),
    refreshTokenTtlDays: positiveInt('REFRESH_TOKEN_TTL_DAYS', 30),
    corsOrigins: (env.CORS_ORIGIN ?? 'http://localhost:3300')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    storagePath: env.STORAGE_PATH?.trim() || './storage',
    publicApiUrl: (env.PUBLIC_API_URL?.trim() || env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3301').replace(/\/+$/, ''),
    publicWebUrl: (env.PUBLIC_WEB_URL?.trim() || 'http://localhost:3300').replace(/\/+$/, ''),
    mail: {
      driver,
      from: env.MAIL_FROM?.trim() || 'Arvo <no-reply@arvo.local>',
      host: env.MAIL_HOST?.trim() || 'localhost',
      port: positiveInt('MAIL_PORT', 1025),
      secure: bool('MAIL_SECURE', false),
      user: env.MAIL_USER?.trim() || null,
      pass: env.MAIL_PASS || null,
    },
    requireEmailVerification: bool('REQUIRE_EMAIL_VERIFICATION', false),
    twoFactorEncryptionKey,
    twoFactorKeyDerived: !rawKey,
    loginAlerts: bool('MAIL_LOGIN_ALERTS', false),
    remindersEnabled: bool('REMINDERS_ENABLED', nodeEnv !== 'test'),
    ai: ai.config,
    weeklyBriefingEnabled: bool('WEEKLY_BRIEFING_ENABLED', nodeEnv !== 'test'),
    mcpResourceUrl: (env.MCP_RESOURCE_URL?.trim() || env.NEXT_PUBLIC_MCP_URL?.trim() || 'http://localhost:3302/mcp').replace(/\/+$/, ''),
  };
  if (problems.length) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return config;
}

/** Accepts a 32-byte key as base64, base64url or 64 hex characters. */
function parseKey(raw: string): Buffer {
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
}
