import type { ColumnMapping } from '@arvo/finance-core';
import { detectDelimiter, parseCsv } from './csv';
import { makePdf, makeXlsx, text } from './__tests__/fixtures';
import { ArvoStatementParser, detectFileType } from './parser';

const parser = new ArvoStatementParser();

const HDFC_CSV = `HDFC BANK Ltd.
Statement of account
Account No : 50100123456789

Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/08/26,SALARY ACME TECHNOLOGIES,0000123,01/08/26,,"1,45,000.00","1,95,000.00"
03/08/26,"NEFT RENT, MR SHARMA",0000124,03/08/26,"32,000.00",,"1,63,000.00"
14/08/26,UPI-SWIGGY-8812,0000125,14/08/26,649.50,,"1,62,350.50"
32/08/26,BROKEN DATE ROW,0000126,,10.00,,
16/08/26,BOTH SIDES,0000127,16/08/26,10.00,5.00,
Total,,,,"32,659.50","1,45,000.00",
`;

describe('file type detection', () => {
  it('uses content, not just the extension', async () => {
    expect(detectFileType('a.csv', text('Date,Amount\n1,2'))).toBe('CSV');
    expect(detectFileType('fake.csv', makePdf([[{ x: 50, y: 700, text: 'hi' }]]))).toBe('PDF');
    expect(detectFileType('book.xlsx', await makeXlsx([{ name: 'S', rows: [['a']] }]))).toBe('XLSX');
    expect(detectFileType('evil.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBeNull();
    expect(detectFileType('legacy.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBeNull();
  });
});

describe('CSV', () => {
  it('parses quotes, embedded delimiters and newlines', () => {
    expect(parseCsv('a,"b,c","d ""q"""\n"multi\nline",2,3\r\n')).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['multi\nline', '2', '3'],
    ]);
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';');
  });

  it('detects a bank statement header below preamble lines and suggests a debit/credit mapping', async () => {
    const extraction = await parser.extract('CSV', text(HDFC_CSV));
    const detection = parser.detect(extraction);
    expect(detection.mappingSource).toBe('AUTO');
    expect(detection.suggestedMapping).toMatchObject({
      headerRowIndex: 4,
      date: 0,
      description: [1],
      reference: 2,
      debit: 4,
      credit: 5,
      balance: 6,
      dateFormat: 'DD/MM/YY',
    });
    expect(detection.tables[0].headers[1]).toBe('Narration');
  });

  it('normalizes rows with signed amounts, reports issues and skips non-transaction lines', async () => {
    const extraction = await parser.extract('CSV', text(HDFC_CSV));
    const mapping = parser.detect(extraction).suggestedMapping!;
    const { rows, skipped } = parser.normalize(extraction, mapping);

    expect(rows.slice(0, 3).map((r) => [r.date, r.description, r.amount, r.reference])).toEqual([
      ['2026-08-01', 'SALARY ACME TECHNOLOGIES', '145000.00', '0000123'],
      ['2026-08-03', 'NEFT RENT, MR SHARMA', '-32000.00', '0000124'],
      ['2026-08-14', 'UPI-SWIGGY-8812', '-649.50', '0000125'],
    ]);
    expect(rows[3].issues.map((i) => i.code)).toEqual(['INVALID_DATE']);
    expect(rows[4].issues.map((i) => i.code)).toEqual(['INVALID_AMOUNT']);
    // "Total" has amounts but no date: kept as an invalid row, never silently dropped.
    expect(rows[5].issues.map((i) => i.code)).toContain('INVALID_DATE');
    // Preamble above the header is not data and is not reported.
    expect(skipped).toEqual([]);
  });

  it('produces a stable header signature for remembering mappings', async () => {
    const a = await parser.extract('CSV', text(HDFC_CSV));
    const b = await parser.extract('CSV', text(HDFC_CSV.replace('SALARY', 'BONUS')));
    const mapping = parser.detect(a).suggestedMapping!;
    expect(parser.headerSignature(a, mapping)).toBe(parser.headerSignature(b, mapping));
    expect(parser.headerSignature(a, mapping)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('applies a remembered mapping and supports inverted single-amount card statements', async () => {
    const csv = 'Txn Date;Details;Amount (INR)\n2026-08-05;AMAZON;1299.00\n2026-08-09;PAYMENT RECEIVED;-5000.00\n';
    const extraction = await parser.extract('CSV', text(csv));
    const auto = parser.detect(extraction).suggestedMapping!;
    expect(auto).toMatchObject({ date: 0, description: [1], amount: 2, dateFormat: 'YYYY-MM-DD' });

    const remembered: ColumnMapping = { ...auto, invertAmounts: true };
    const detection = parser.detect(extraction, remembered);
    expect(detection.mappingSource).toBe('REMEMBERED');
    const { rows } = parser.normalize(extraction, detection.suggestedMapping!);
    expect(rows.map((r) => r.amount)).toEqual(['-1299.00', '5000.00']);
  });

  it('asks for confirmation when day/month order is ambiguous', async () => {
    const extraction = await parser.extract('CSV', text('Date,Description,Amount\n01/02/2026,A,-1\n03/04/2026,B,-2\n'));
    const detection = parser.detect(extraction);
    expect(detection.dateFormatCandidates).toEqual(['DD/MM/YYYY', 'MM/DD/YYYY']);
    expect(detection.warnings.join(' ')).toMatch(/confirm the format/);
  });

  it('reports lines between transactions that have no date or amount', async () => {
    const extraction = await parser.extract('CSV', text('Date,Description,Amount\n01/08/2026,A,-1\nCarried forward,,\n02/08/2026,B,-2\n'));
    const { rows, skipped } = parser.normalize(extraction, parser.detect(extraction).suggestedMapping!);
    expect(rows).toHaveLength(2);
    expect(skipped).toEqual([{ rowNumber: 3, reason: 'Carried forward' }]);
  });

  it('falls back to content sniffing when there is no header', async () => {
    const extraction = await parser.extract('CSV', text('14/08/2026,COFFEE,-120.00,5000.00\n15/08/2026,BOOKS,-560.00,4440.00\n'));
    const detection = parser.detect(extraction);
    expect(detection.suggestedMapping).toMatchObject({ headerRowIndex: -1, date: 0, description: [1], amount: 2 });
  });
});

describe('XLSX', () => {
  it('reads sheets, real Excel dates and numbers, and picks the sheet with transactions', async () => {
    const bytes = await makeXlsx([
      { name: 'Summary', rows: [['Account', 'Savings'], ['Owner', 'Asha']] },
      {
        name: 'Transactions',
        rows: [
          ['Transaction Date', 'Description', 'Debit', 'Credit', 'Balance'],
          [new Date(Date.UTC(2026, 7, 1)), 'Salary', null, 120000, 120000],
          [null, null, null, null, null],
          [new Date(Date.UTC(2026, 7, 2)), 'Groceries', 2350.4, null, 117649.6],
        ],
      },
    ]);
    const extraction = await parser.extract('XLSX', bytes);
    expect(extraction.tables.map((t) => t.name)).toEqual(['Summary', 'Transactions']);
    const detection = parser.detect(extraction);
    expect(detection.suggestedMapping).toMatchObject({ tableIndex: 1, debit: 2, credit: 3, dateFormat: 'YYYY-MM-DD' });
    const { rows } = parser.normalize(extraction, detection.suggestedMapping!);
    expect(rows.map((r) => [r.date, r.description, r.amount])).toEqual([
      ['2026-08-01', 'Salary', '120000.00'],
      ['2026-08-02', 'Groceries', '-2350.40'],
    ]);
  });
});

describe('PDF', () => {
  const line = (y: number, parts: [number, string][]) => parts.map(([x, t]) => ({ x, y, text: t }));

  it('reconstructs bank statement lines and signs amounts from running balances', async () => {
    const pdf = makePdf([
      [
        ...line(760, [[50, 'ICICI Bank Savings Account Statement']]),
        ...line(740, [[50, 'Date'], [130, 'Particulars'], [400, 'Amount'], [500, 'Balance']]),
        ...line(720, [[50, '01-08-2026'], [130, 'OPENING BALANCE'], [500, '50,000.00']]),
        ...line(700, [[50, '02-08-2026'], [130, 'UPI/SWIGGY/8812'], [400, '649.50'], [500, '49,350.50']]),
        ...line(688, [[130, 'Bangalore order']]),
        ...line(670, [[50, '05-08-2026'], [130, 'NEFT SALARY ACME'], [400, '1,45,000.00'], [500, '1,94,350.50']]),
      ],
      [
        ...line(760, [[50, '06-08-2026'], [130, 'ATM WDL MG ROAD'], [400, '2,000.00'], [500, '1,92,350.50']]),
        ...line(740, [[50, 'Page 2 of 2']]),
      ],
    ]);
    expect(detectFileType('statement.pdf', pdf)).toBe('PDF');
    const extraction = await parser.extract('PDF', pdf);
    const detection = parser.detect(extraction);
    expect(detection.mappingSource).toBe('PRESET');
    const { rows } = parser.normalize(extraction, detection.suggestedMapping!);
    expect(rows.map((r) => [r.date, r.description, r.amount, r.signUnknown])).toEqual([
      ['2026-08-02', 'UPI/SWIGGY/8812 Bangalore order', '-649.50', false],
      ['2026-08-05', 'NEFT SALARY ACME', '145000.00', false],
      ['2026-08-06', 'ATM WDL MG ROAD', '-2000.00', false],
    ]);
  });

  it('uses Dr/Cr markers and flags lines whose direction cannot be known', async () => {
    const marked = makePdf([
      [
        ...line(700, [[50, '14 Aug 2026'], [130, 'AMAZON PAY'], [450, '1,299.00']]),
        ...line(680, [[50, '16 Aug 2026'], [130, 'PAYMENT RECEIVED'], [450, '5,000.00 Cr']]),
      ],
    ]);
    const extraction = await parser.extract('PDF', marked);
    const { rows } = parser.normalize(extraction, parser.detect(extraction).suggestedMapping!);
    expect(rows.map((r) => [r.amount, r.signUnknown])).toEqual([
      ['-1299.00', false],
      ['5000.00', false],
    ]);

    const unmarked = makePdf([[...line(700, [[50, '14/08/2026'], [130, 'SOMETHING'], [450, '99.00']])]]);
    const e2 = await parser.extract('PDF', unmarked);
    const r2 = parser.normalize(e2, parser.detect(e2).suggestedMapping!).rows;
    expect(r2.map((r) => [r.amount, r.signUnknown])).toEqual([['99.00', true]]);
  });

  it('reports PDFs with no text', async () => {
    const extraction = await parser.extract('PDF', makePdf([[]]));
    expect(extraction.warnings.join(' ')).toMatch(/No text found/);
  });
});
