import { formatMoney, isMoneyString, parseMoney, roundToCents, scaleToCents, sumMoney } from './money';

describe('money', () => {
  it.each([
    ['0', 0n],
    ['100', 1_000_000n],
    ['100.5', 1_005_000n],
    ['-12.34', -123_400n],
    ['+0.0001', 1n],
    ['1234.5678', 12_345_678n],
  ])('parses %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.23456', '1,000', '1e3', '--1', '.5'])('rejects %j', (input) => {
    expect(isMoneyString(input)).toBe(false);
    expect(() => parseMoney(input)).toThrow(RangeError);
  });

  it.each([
    [0n, '0.00'],
    [1_005_000n, '100.50'],
    [-123_400n, '-12.34'],
    [12_345_678n, '1234.5678'],
    [-1n, '-0.0001'],
  ])('formats %s as %s', (units, expected) => {
    expect(formatMoney(units)).toBe(expected);
  });

  it('sums exactly where floating point would drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(formatMoney(sumMoney(['0.1', '0.2']))).toBe('0.30');
    expect(formatMoney(sumMoney(Array(1000).fill('0.01')))).toBe('10.00');
  });

  it('round-trips database numeric(19,4) strings', () => {
    expect(formatMoney(parseMoney('-649.0000'))).toBe('-649.00');
  });
});

describe('cent rounding', () => {
  it.each([
    ['124.9167', '124.92'],
    ['124.9150', '124.92'],
    ['124.9149', '124.91'],
    ['-0.0050', '-0.01'],
  ])('rounds %s to %s', (input, expected) => {
    expect(formatMoney(roundToCents(parseMoney(input)))).toBe(expected);
  });

  it('scales and divides exactly before rounding', () => {
    expect(formatMoney(scaleToCents(parseMoney('1499'), 1n, 12n))).toBe('124.92');
    expect(formatMoney(scaleToCents(parseMoney('300'), 52n, 12n))).toBe('1300.00');
    expect(formatMoney(scaleToCents(parseMoney('24947'), 1n, 3n))).toBe('8315.67');
    expect(formatMoney(scaleToCents(parseMoney('-100'), 1n, 3n))).toBe('-33.33');
  });
});
