import { parseAmount, parseDirection } from './amounts';
import { detectDateFormats, parseDate } from './dates';

describe('parseAmount', () => {
  it.each([
    ['1,23,456.50', '123456.50', null],
    ['(1,200.00)', '-1200.00', null],
    ['-450', '-450.00', null],
    ['450-', '-450.00', null],
    ['649.00 Dr', '649.00', 'DEBIT'],
    ['1,200.00Dr', '1200.00', 'DEBIT'],
    ['₹ 2,000 CR', '2000.00', 'CREDIT'],
    ['Rs. 99.9', '99.90', null],
    ['INR 10', '10.00', null],
    ['0.123456', '0.1235', null],
  ])('%s → %s (%s)', (input, value, marker) => {
    expect(parseAmount(input)).toEqual({ value, marker });
  });

  it.each(['', '-', 'N/A', '12abc', '1.2.3', 'Credit'])('rejects %j', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('reads direction columns', () => {
    expect(parseDirection('Dr.')).toBe('DEBIT');
    expect(parseDirection('credit')).toBe('CREDIT');
    expect(parseDirection('x')).toBeNull();
  });
});

describe('dates', () => {
  it.each([
    ['14/08/2026', 'DD/MM/YYYY', '2026-08-14'],
    ['08/14/2026', 'MM/DD/YYYY', '2026-08-14'],
    ['14-Aug-2026', 'DD-MMM-YYYY', '2026-08-14'],
    ['14 Sept 26', 'DD MMM YY', '2026-09-14'],
    ['Aug 14, 2026', 'MMM DD, YYYY', '2026-08-14'],
    ['2026-08-14 10:22:01', 'YYYY-MM-DD', '2026-08-14'],
    ['14.08.2026', 'DD.MM.YYYY', '2026-08-14'],
  ] as const)('parses %s as %s', (input, format, expected) => {
    expect(parseDate(input, format)).toBe(expected);
  });

  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2026', 'DD/MM/YYYY')).toBeNull();
  });

  it('narrows candidates using every sample and prefers day-first when ambiguous', () => {
    expect(detectDateFormats(['01/02/2026', '03/04/2026'])).toEqual(['DD/MM/YYYY', 'MM/DD/YYYY']);
    expect(detectDateFormats(['01/02/2026', '25/04/2026'])).toEqual(['DD/MM/YYYY']);
    expect(detectDateFormats(['04/25/2026'])).toEqual(['MM/DD/YYYY']);
  });
});
