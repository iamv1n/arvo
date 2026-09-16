import { createHash } from 'node:crypto';
import { formatMoney, parseMoney } from './money';
import { normalizeDescription } from './normalize';

export interface FingerprintInput {
  accountId: string;
  date: string;
  amount: string;
  description: string;
}

/**
 * Deterministic duplicate-detection fingerprint:
 * SHA256(account_id | date | amount | normalized_description).
 * Amount is canonicalised so "100", "100.00" and "100.0000" match.
 */
export function transactionFingerprint(input: FingerprintInput): string {
  const payload = [
    input.accountId,
    input.date,
    formatMoney(parseMoney(input.amount)),
    normalizeDescription(input.description),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
