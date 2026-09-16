import { isIsoDate } from './dates';
import { transactionFingerprint } from './fingerprint';
import { normalizeText } from './normalize';

const base = { accountId: 'acc-1', date: '2026-08-14', amount: '-649', description: 'NETFLIX.COM  Subscription' };

describe('transactionFingerprint', () => {
  it('is a deterministic sha256 hex digest', () => {
    expect(transactionFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(transactionFingerprint(base)).toBe(transactionFingerprint({ ...base }));
  });

  it('ignores amount formatting and description noise', () => {
    expect(transactionFingerprint({ ...base, amount: '-649.0000', description: 'netflix com subscription' })).toBe(
      transactionFingerprint(base),
    );
  });

  it.each([
    ['accountId', 'acc-2'],
    ['date', '2026-08-15'],
    ['amount', '649'],
    ['description', 'Spotify'],
  ])('changes when %s changes', (field, value) => {
    expect(transactionFingerprint({ ...base, [field]: value })).not.toBe(transactionFingerprint(base));
  });
});

describe('normalizeText', () => {
  it('upper-cases and collapses punctuation and whitespace', () => {
    expect(normalizeText('  Swiggy*Order #123 ')).toBe('SWIGGY ORDER 123');
  });
});

describe('isIsoDate', () => {
  it.each([
    ['2026-02-28', true],
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-8-1', false],
  ])('%s → %s', (value, expected) => {
    expect(isIsoDate(value)).toBe(expected);
  });
});
