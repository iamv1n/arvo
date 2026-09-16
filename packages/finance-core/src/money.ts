/**
 * Exact money arithmetic.
 *
 * Amounts cross boundaries (API, database) as decimal strings such as "-1234.50".
 * Inside the core they are bigint counts of 1/10000 of a currency unit, so sums are
 * exact and deterministic. The scale matches the database column numeric(19,4).
 */
export const MONEY_SCALE = 4;
const UNITS_PER_WHOLE = 10n ** BigInt(MONEY_SCALE);
const DECIMAL_PATTERN = /^([+-])?(\d{1,15})(?:\.(\d{1,4}))?$/;

export type MoneyUnits = bigint;

export function isMoneyString(value: string): boolean {
  return DECIMAL_PATTERN.test(value.trim());
}

export function parseMoney(value: string): MoneyUnits {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new RangeError(`Invalid money amount: "${value}"`);
  }
  const [, sign, whole, fraction = ''] = match;
  const units = BigInt(whole) * UNITS_PER_WHOLE + BigInt(fraction.padEnd(MONEY_SCALE, '0'));
  return sign === '-' ? -units : units;
}

/** Formats units as a decimal string with at least two fraction digits, e.g. "-12.50". */
export function formatMoney(units: MoneyUnits): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / UNITS_PER_WHOLE;
  let fraction = (abs % UNITS_PER_WHOLE).toString().padStart(MONEY_SCALE, '0');
  while (fraction.length > 2 && fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1);
  }
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function sumMoney(values: Iterable<string>): MoneyUnits {
  let total = 0n;
  for (const value of values) {
    total += parseMoney(value);
  }
  return total;
}

export function absMoney(units: MoneyUnits): MoneyUnits {
  return units < 0n ? -units : units;
}

/** Rounds units to whole minor currency units (0.01), half away from zero. */
export function roundToCents(units: MoneyUnits): MoneyUnits {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const rounded = ((abs + 50n) / 100n) * 100n;
  return negative ? -rounded : rounded;
}

/** units × numerator ÷ denominator, rounded to 0.01 half away from zero. */
export function scaleToCents(units: MoneyUnits, numerator: bigint, denominator: bigint): MoneyUnits {
  const negative = (units < 0n) !== (denominator < 0n);
  const abs = (units < 0n ? -units : units) * numerator;
  const den = (denominator < 0n ? -denominator : denominator) * 100n;
  const cents = (abs * 2n + den) / (2n * den);
  return (negative ? -cents : cents) * 100n;
}
