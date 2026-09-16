export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  corsOrigins: string[];
  storagePath: string;
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
  };
  if (problems.length) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return config;
}
