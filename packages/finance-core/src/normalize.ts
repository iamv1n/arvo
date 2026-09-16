/**
 * Canonical form of free text used for matching (duplicates, merchants, rules):
 * upper-case, punctuation collapsed to spaces, whitespace squeezed.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const normalizeDescription = normalizeText;
export const normalizeMerchantName = normalizeText;
