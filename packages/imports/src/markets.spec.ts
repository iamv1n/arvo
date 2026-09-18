import { parseCorporateActionsFile, parseHolidaysFile, parseIposFile } from './markets';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('corporate action imports', () => {
  it('reads an NSE-shaped purpose column', async () => {
    const csv = [
      'Symbol,Company Name,Purpose,Ex Date,Record Date',
      'TCS,Tata Consultancy Services,INTERIM DIVIDEND RS 10 PER SHARE,18-Sep-2026,19-Sep-2026',
      'IRCTC,IRCTC Ltd,BONUS 1:1,22-Sep-2026,23-Sep-2026',
    ].join('\n');
    const { rows, warnings } = await parseCorporateActionsFile(bytes(csv), 'actions.csv');
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      expect.objectContaining({ symbol: 'TCS', kind: 'DIVIDEND', exDate: '2026-09-18', recordDate: '2026-09-19', amount: '10.00' }),
      expect.objectContaining({ symbol: 'IRCTC', kind: 'BONUS', exDate: '2026-09-22', ratio: '1:1', amount: null }),
    ]);
  });

  it('drops a row it cannot classify and says why', async () => {
    const csv = 'Symbol,Purpose,Ex Date\nINFY,ANNUAL GENERAL MEETING,18-Sep-2026';
    const { rows, warnings } = await parseCorporateActionsFile(bytes(csv), 'actions.csv');
    expect(rows).toEqual([]);
    expect(warnings[0]).toContain('not a corporate action');
  });

  it('refuses a file with no ex-date rather than guessing one', async () => {
    const { rows, warnings } = await parseCorporateActionsFile(bytes('Symbol,Purpose\nTCS,DIVIDEND'), 'actions.csv');
    expect(rows).toEqual([]);
    expect(warnings).toEqual(['No ex-date column was found']);
  });
});

describe('trading holiday imports', () => {
  it('reads a dated two-column file and de-duplicates', async () => {
    const csv = 'Date,Description\n26-Jan-2026,Republic Day\n15-Aug-2026,Independence Day\n15-Aug-2026,Independence Day';
    const { rows } = await parseHolidaysFile(bytes(csv), 'holidays.csv');
    expect(rows).toEqual([
      { date: '2026-01-26', name: 'Republic Day' },
      { date: '2026-08-15', name: 'Independence Day' },
    ]);
  });

  it('accepts a headerless list of dates', async () => {
    const { rows } = await parseHolidaysFile(bytes('2026-01-26\n2026-08-15'), 'holidays.csv');
    expect(rows).toEqual([
      { date: '2026-01-26', name: 'Trading holiday' },
      { date: '2026-08-15', name: 'Trading holiday' },
    ]);
  });
});

describe('IPO imports', () => {
  it('splits a price band written in one cell', async () => {
    const csv = 'Name,Symbol,Open,Close,Price Band,Lot,Status\nAcme Ltd,ACME,16-Sep-2026,19-Sep-2026,100 - 110,130,Open';
    const { rows } = await parseIposFile(bytes(csv), 'ipos.csv');
    expect(rows[0]).toEqual({
      name: 'Acme Ltd',
      symbol: 'ACME',
      openDate: '2026-09-16',
      closeDate: '2026-09-19',
      priceBandLow: '100.00',
      priceBandHigh: '110.00',
      lotSize: 130,
      listingDate: null,
      status: 'OPEN',
      notes: null,
    });
  });

  it('keeps an announced issue with almost nothing known about it', async () => {
    const { rows } = await parseIposFile(bytes('Name\nSomething Ltd'), 'ipos.csv');
    expect(rows[0]).toMatchObject({ name: 'Something Ltd', status: 'UPCOMING', openDate: null, priceBandLow: null });
  });
});
