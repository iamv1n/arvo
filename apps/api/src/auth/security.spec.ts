import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateToken,
  hashRecoveryCode,
  hashToken,
  hotp,
  isTokenUsable,
  totp,
  verifyTotp,
} from './security';

// RFC 6238 appendix B uses the ASCII key "12345678901234567890" (SHA-1, 8 digits); these are the 6-digit truncations.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('tokens', () => {
  it('generates 32-byte url-safe tokens and stable SHA-256 hashes', () => {
    const token = generateToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).not.toBe(generateToken());
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it('is usable only before expiry and before consumption', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isTokenUsable({ expiresAt: new Date('2026-01-01T00:00:01Z'), consumedAt: null }, now)).toBe(true);
    expect(isTokenUsable({ expiresAt: now, consumedAt: null }, now)).toBe(false);
    expect(isTokenUsable({ expiresAt: new Date('2026-01-02T00:00:00Z'), consumedAt: now }, now)).toBe(false);
  });
});

describe('TOTP', () => {
  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 255, 7]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('matches the RFC 4226 / 6238 test vectors', () => {
    expect(hotp(RFC_SECRET, 0)).toBe('755224');
    expect(hotp(RFC_SECRET, 1)).toBe('287082');
    expect(totp(RFC_SECRET, 59_000)).toBe('287082');
    expect(totp(RFC_SECRET, 1111111109_000)).toBe('081804');
    expect(totp(RFC_SECRET, 1234567890_000)).toBe('005924');
    expect(totp(RFC_SECRET, 2000000000_000)).toBe('279037');
  });

  it('accepts codes one step either side and rejects further drift', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now), { time: now })).toBe(step);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 30_000), { time: now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now + 30_000), { time: now })).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 60_000), { time: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now + 60_000), { time: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', { time: now })).toBeNull();
  });

  it('rejects replays of an already used step', () => {
    const now = 1_700_000_000_000;
    const code = totp(RFC_SECRET, now);
    const step = verifyTotp(RFC_SECRET, code, { time: now })!;
    expect(verifyTotp(RFC_SECRET, code, { time: now, lastStep: step })).toBeNull();
  });
});

describe('secret encryption', () => {
  const key = Buffer.alloc(32, 7);

  it('round-trips and uses a fresh IV each time', () => {
    const a = encryptSecret(key, 'JBSWY3DPEHPK3PXP');
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(encryptSecret(key, 'JBSWY3DPEHPK3PXP')).not.toBe(a);
    expect(decryptSecret(key, a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('fails with the wrong key or tampered data', () => {
    const payload = encryptSecret(key, 'secret');
    expect(() => decryptSecret(Buffer.alloc(32, 8), payload)).toThrow();
    const parts = payload.split('.');
    parts[3] = Buffer.from('x').toString('base64url');
    expect(() => decryptSecret(key, parts.join('.'))).toThrow();
  });
});

describe('recovery codes', () => {
  it('generates ten distinct codes and hashes them insensitive to case and dashes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
    expect(hashRecoveryCode(codes[0]!)).toBe(hashRecoveryCode(codes[0]!.toUpperCase().replace('-', ' ')));
  });
});
