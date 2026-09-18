import { DomainError } from '@arvo/finance-core';
import {
  detectPortfolioSource,
  parseAmfiNav,
  parseBenchmarkCsv,
  parseBrokerCsv,
  parseCasLines,
  parseFundDisclosureCsv,
} from './portfolio';

const bytes = (text: string) => new TextEncoder().encode(text);
const TODAY = '2026-09-19';

const ZERODHA_TRADEBOOK = `symbol,isin,trade_date,exchange,segment,series,trade_type,quantity,price,trade_id,order_id
INFY,INE009A01021,2026-04-15,NSE,EQ,EQ,buy,50,1450.25,101,201
INFY,INE009A01021,2026-06-20,NSE,EQ,EQ,sell,20,1600.00,102,202
HDFCBANK,INE040A01034,2026-05-02,NSE,EQ,EQ,buy,10,1680.5,103,203
`;

const ZERODHA_HOLDINGS = `Symbol,ISIN,Sector,Quantity Available,Average Price,Previous Closing Price
TCS,INE467B01029,IT,15,3550.40,3800
ITC,INE154A01025,FMCG,200,410.25,455
`;

const AMFI_NAV = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes ( Equity Scheme - Flexi Cap Fund )
Parag Parikh Mutual Fund
122639;INF879O01027;INF879O01035;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;89.4512;18-Sep-2026
119551;INF209K01UN8;INF209K01UO6;Aditya Birla Sun Life Frontline Equity Fund - Growth;512.3400;18-Sep-2026
garbage line with no semicolons
`;

const NIFTY_CSV = `Index Name,Date,Close
NIFTY 50 TRI,2024-09-19,25000.50
NIFTY 50 TRI,2025-09-19,27500.00
NIFTY 50 TRI,2026-09-19,30000.00
`;

const DISCLOSURE_CSV = `Portfolio as on 31-Aug-2026
Name of the Instrument,ISIN,Rating / Industry,Quantity,Market Value,% to Net Assets
HDFC Bank Ltd.,INE040A01034,Banks,120000,2050000,8.52
Infosys Ltd.,INE009A01021,IT,90000,1310000,5.04
Total,,,,,100.00
`;

/** A slice of a CAMS detailed statement, as the PDF text extractor produces it. */
const CAS_LINES = [
  'Consolidated Account Statement',
  'Folio No: 91022114083 / 0   PAN: ABCDE1234F   KYC: OK',
  'PPFC-Parag Parikh Flexi Cap Fund - Direct Plan - Growth (Advisor: DIRECT)   Registrar : CAMS',
  'ISIN: INF879O01027',
  'Opening Unit Balance: 0.000',
  '04-Apr-2024 Purchase 50,000.00 1,043.514 47.9127 1,043.514',
  '05-Apr-2024 *** Stamp Duty *** 2.50 0.000 0.0000 1,043.514',
  '04-May-2024 SIP Purchase 10,000.00 200.1234 49.9692 1,243.637',
  '10-Jun-2026 Redemption 30,000.00 (350.0000) 85.7142 893.637',
  'Closing Unit Balance: 893.637',
];

describe('portfolio file detection', () => {
  it('recognises each supported file from its content', async () => {
    expect(await detectPortfolioSource('statement.pdf', bytes('%PDF-1.7 ...'))).toBe('CAS_PDF');
    expect(await detectPortfolioSource('NAVAll.txt', bytes(AMFI_NAV))).toBe('AMFI_NAV');
    expect(await detectPortfolioSource('nifty.csv', bytes(NIFTY_CSV))).toBe('BENCHMARK_CSV');
    expect(await detectPortfolioSource('ppfcf-aug.csv', bytes(DISCLOSURE_CSV))).toBe('FUND_DISCLOSURE_CSV');
    expect(await detectPortfolioSource('tradebook.csv', bytes(ZERODHA_TRADEBOOK))).toBe('BROKER_CSV');
    expect(await detectPortfolioSource('holdings.csv', bytes(ZERODHA_HOLDINGS))).toBe('BROKER_CSV');
    expect(await detectPortfolioSource('notes.csv', bytes('hello,world\n1,2\n'))).toBeNull();
  });
});

describe('broker CSV', () => {
  it('reads a tradebook as dated buys and sells', () => {
    const { rows, profile, warnings } = parseBrokerCsv(bytes(ZERODHA_TRADEBOOK), 'tradebook.csv', TODAY);
    expect(profile).toBe('zerodha-tradebook');
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      instrumentName: 'INFY',
      kind: 'EQUITY',
      isin: 'INE009A01021',
      symbol: 'INFY',
      date: '2026-04-15',
      type: 'BUY',
      units: '50.00000',
      price: '1450.25',
      amount: '72512.5000',
      charges: '0',
    });
    expect(rows[1]).toMatchObject({ type: 'SELL', units: '20.00000', amount: '32000.0000' });
    // The reference is stable, so the same file uploaded twice is recognised as duplicate.
    expect(parseBrokerCsv(bytes(ZERODHA_TRADEBOOK), 'tradebook.csv', TODAY).rows[0].externalRef).toBe(rows[0].externalRef);
    expect(rows[0].externalRef).not.toBe(rows[1].externalRef);
  });

  it('reads a holdings snapshot as purchases on the import date and says so', () => {
    const { rows, profile, warnings } = parseBrokerCsv(bytes(ZERODHA_HOLDINGS), 'holdings.csv', TODAY);
    expect(profile).toBe('zerodha-holdings');
    expect(warnings[0]).toContain('holdings snapshot');
    expect(rows).toEqual([
      expect.objectContaining({ instrumentName: 'TCS', date: TODAY, type: 'BUY', units: '15.00000', amount: '53256.0000' }),
      expect.objectContaining({ instrumentName: 'ITC', date: TODAY, type: 'BUY', units: '200.00000', amount: '82050.0000' }),
    ]);
  });

  it('refuses a file with no recognisable columns', () => {
    expect(() => parseBrokerCsv(bytes('a,b\n1,2\n'), 'x.csv', TODAY)).toThrow(DomainError);
  });

  it('treats a scheme with a folio as a mutual fund', () => {
    const csv = 'Scheme Name,Folio Number,Units,Average NAV\nHDFC Liquid Fund - Direct Growth,12345/0,1043.5140,47.9127\n';
    const { rows, profile } = parseBrokerCsv(bytes(csv), 'groww-mf.csv', TODAY);
    expect(profile).toBe('groww-mutual-funds');
    expect(rows[0]).toMatchObject({ kind: 'MUTUAL_FUND', folio: '12345/0', units: '1043.51400', symbol: null });
  });
});

describe('CAS statement', () => {
  it('reads folio, scheme, ISIN and every transaction, skipping stamp duty lines', () => {
    const { rows } = parseCasLines(CAS_LINES);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      instrumentName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      kind: 'MUTUAL_FUND',
      isin: 'INF879O01027',
      schemeCode: 'PPFC',
      folio: '91022114083 / 0',
      date: '2024-04-04',
      type: 'BUY',
      units: '1043.51400',
      price: '47.9127',
      amount: '50000.00',
    });
    expect(rows[1]).toMatchObject({ date: '2024-05-04', type: 'SIP', units: '200.12340' });
    // A redemption shows units in brackets; it becomes a positive quantity of a SELL.
    expect(rows[2]).toMatchObject({ date: '2026-06-10', type: 'SELL', units: '350.00000', amount: '30000.00' });
  });

  it('warns when nothing is recognised', () => {
    const { rows, warnings } = parseCasLines(['Consolidated Account Statement', 'Nothing useful here']);
    expect(rows).toEqual([]);
    expect(warnings[0]).toContain('No mutual fund transactions');
  });
});

describe('AMFI NAV file', () => {
  it('reads scheme code, ISIN, NAV and date, skipping headings', () => {
    const { rows } = parseAmfiNav(bytes(AMFI_NAV));
    expect(rows).toEqual([
      { schemeCode: '122639', name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', isin: 'INF879O01027', price: '89.4512', date: '2026-09-18' },
      { schemeCode: '119551', name: 'Aditya Birla Sun Life Frontline Equity Fund - Growth', isin: 'INF209K01UN8', price: '512.34', date: '2026-09-18' },
    ]);
  });
});

describe('index series', () => {
  it('reads dated levels and takes the series name from the file', () => {
    const { series, points, warnings } = parseBenchmarkCsv(bytes(NIFTY_CSV), 'nifty-50-tri.csv');
    expect(series).toBe('NIFTY 50 TRI');
    expect(warnings).toEqual([]);
    expect(points).toEqual([
      { date: '2024-09-19', value: '25000.50' },
      { date: '2025-09-19', value: '27500.00' },
      { date: '2026-09-19', value: '30000.00' },
    ]);
  });

  it('falls back to the filename when the file has no name column', () => {
    const { series } = parseBenchmarkCsv(bytes('Date,Close\n2026-01-01,100\n2026-02-01,110\n'), 'nifty_500_tri.csv');
    expect(series).toBe('nifty 500 tri');
  });
});

describe('fund disclosure', () => {
  it('reads instrument weights and drops the total row', () => {
    const { rows, asOf } = parseFundDisclosureCsv(bytes(DISCLOSURE_CSV));
    expect(asOf).toBe('2026-08-31');
    expect(rows).toEqual([
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: '8.52' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: '5.04' },
    ]);
  });
});
