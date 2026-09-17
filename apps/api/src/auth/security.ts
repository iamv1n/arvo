import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/* ------------------------------------------------------------------ tokens */

/** A 32-byte random, URL-safe token for email links. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Keyed hash for low-entropy secrets (6-digit codes) so a leaked row can't be brute forced offline. */
export function hmacHex(key: Buffer | string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isTokenUsable(token: { expiresAt: Date; consumedAt: Date | null }, now = new Date()): boolean {
  return token.consumedAt === null && token.expiresAt.getTime() > now.getTime();
}

export function numericCode(digits = 6): string {
  return randomInt(0, 10 ** digits).toString().padStart(digits, '0');
}

/* ------------------------------------------------------ encryption at rest */

/** AES-256-GCM; output is "v1.<iv>.<tag>.<ciphertext>" in base64url. */
export function encryptSecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptSecret(key: Buffer, payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/* -------------------------------------------------------------- TOTP (RFC 6238) */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 20 random bytes (160 bits), the RFC 4226 recommendation. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(time = Date.now()): number {
  return Math.floor(time / 1000 / TOTP_PERIOD_SECONDS);
}

/** HOTP (RFC 4226) with HMAC-SHA1. */
export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return binary.toString().padStart(TOTP_DIGITS, '0');
}

export function totp(secret: string, time = Date.now()): string {
  return hotp(secret, totpStep(time));
}

/**
 * Checks a code against the current step and `window` steps either side (clock drift).
 * Returns the matched step, or null. Steps at or before `lastStep` are rejected (no replay).
 */
export function verifyTotp(secret: string, code: string, options: { time?: number; window?: number; lastStep?: number | null } = {}): number | null {
  const { time = Date.now(), window = 1, lastStep = null } = options;
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(time);
  for (let step = current - window; step <= current + window; step++) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = hotp(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = 'Arvo'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ---------------------------------------------------------- recovery codes */

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Ten codes like "k7m2p-x9qd4"; ~50 bits each. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashRecoveryCode(code: string): string {
  return hashToken(`recovery:${normalizeRecoveryCode(code)}`);
}
