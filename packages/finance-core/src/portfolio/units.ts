/**
 * Exact quantity arithmetic for portfolio holdings.
 *
 * Units cross boundaries (API, database) as decimal strings such as "1234.56700".
 * Inside the core they are bigint counts of 1/100000 of a unit (UNITS_SCALE = 5), so
 * mutual-fund allotments (3–4 decimals), gold in grams (3–4 decimals) and share counts
 * are all exact. The scale matches the database column numeric(24,5).
 *
 * Why 5 and not 4: AMCs allot units to 3 or 4 decimals, but switch/STP legs and bonus
 * issues can produce a 5th. One spare digit keeps a round-trip lossless without inviting
 * the float error a larger scale would tempt.
 */
export const UNITS_SCALE = 5;
const PER_UNIT = 10n ** BigInt(UNITS_SCALE);
const UNITS_PATTERN = /^([+-])?(\d{1,18})(?:\.(\d{1,5}))?$/;

export type Units = bigint;

export function isUnitsString(value: string): boolean {
  return UNITS_PATTERN.test(value.trim());
}

export function parseUnits(value: string): Units {
  const match = UNITS_PATTERN.exec(value.trim());
  if (!match) throw new RangeError(`Invalid units quantity: "${value}"`);
  const [, sign, whole, fraction = ''] = match;
  const units = BigInt(whole) * PER_UNIT + BigInt(fraction.padEnd(UNITS_SCALE, '0'));
  return sign === '-' ? -units : units;
}

/** Formats units with all UNITS_SCALE fraction digits, e.g. "12.34500". */
export function formatUnits(units: Units): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  return `${negative ? '-' : ''}${abs / PER_UNIT}.${(abs % PER_UNIT).toString().padStart(UNITS_SCALE, '0')}`;
}

export function absUnits(units: Units): Units {
  return units < 0n ? -units : units;
}

/**
 * units × price → money units (1/10000), rounded half away from zero to 0.0001.
 * `price` is money units per one whole unit.
 */
export function valueOf(units: Units, price: bigint): bigint {
  const negative = (units < 0n) !== (price < 0n);
  const abs = (units < 0n ? -units : units) * (price < 0n ? -price : price);
  const value = (abs * 2n + PER_UNIT) / (2n * PER_UNIT);
  return negative ? -value : value;
}

/**
 * money units ÷ units → a price in money units per whole unit, rounded half away from zero.
 * Returns 0n when the quantity is zero.
 */
export function priceOf(money: bigint, units: Units): bigint {
  if (units === 0n) return 0n;
  const negative = (money < 0n) !== (units < 0n);
  const abs = (money < 0n ? -money : money) * PER_UNIT;
  const den = units < 0n ? -units : units;
  const price = (abs * 2n + den) / (2n * den);
  return negative ? -price : price;
}

/** a × numerator ÷ denominator on unit quantities, rounded half away from zero. */
export function scaleUnits(units: Units, numerator: bigint, denominator: bigint): Units {
  if (denominator === 0n) throw new RangeError('scaleUnits: denominator must not be zero');
  const negative = (units < 0n) !== (numerator < 0n) !== (denominator < 0n);
  const abs = (units < 0n ? -units : units) * (numerator < 0n ? -numerator : numerator);
  const den = denominator < 0n ? -denominator : denominator;
  const scaled = (abs * 2n + den) / (2n * den);
  return negative ? -scaled : scaled;
}
