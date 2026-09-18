import { detectTradeSource, parseTradeCsv } from './trading';

const bytes = (text: string) => new TextEncoder().encode(text);

/** A Zerodha Console tradebook, with the columns Console actually exports. */
const ZERODHA = [
  'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time',
  'INFY,INE009A01021,2025-06-02,NSE,EQ,EQ,buy,false,100,1580.55,111,222,2025-06-02T09:20:31',
  'INFY,INE009A01021,2025-06-03,NSE,EQ,EQ,sell,false,100,1602.10,112,223,2025-06-03T14:05:02',
  'NIFTY25JUN24500CE,,2025-06-10,NFO,FO,,buy,false,75,120.25,113,224,2025-06-10T10:15:00',
  'NIFTY25JUN24500CE,,2025-06-11,NFO,FO,,sell,false,75,145.80,114,225,2025-06-11T11:30:44',
].join('\n');

/** An Angel One style export: different names, day-first dates, an explicit segment. */
const ANGEL = [
  'Trade Date,Exchange,Segment,Symbol,Buy/Sell,Quantity,Price,Order No,Trade No,Trade Time,Brokerage,STT,Total Charges',
  '02/06/2025,NSE,EQ,TCS,B,50,3450.00,A1,T1,09:45:10,20.00,0.00,25.40',
  '02/06/2025,NSE,EQ,TCS,S,50,3490.00,A2,T2,15:10:00,20.00,43.63,70.10',
].join('\n');

const MCX = [
  'Date,Exchange,Segment,Instrument,Trade Type,Quantity,Price,Order ID,Trade Time,Product',
  '05-06-2025,MCX,CO,CRUDEOIL25JUNFUT,BUY,100,5480.00,D1,10:05:00,NRML',
  '05-06-2025,MCX,CO,CRUDEOIL25JUNFUT,SELL,100,5520.00,D2,14:05:00,NRML',
].join('\n');

describe('trade file detection', () => {
  it('recognises a tradebook CSV and refuses an unrelated one', async () => {
    expect(await detectTradeSource('tradebook-AB1234-EQ.csv', bytes(ZERODHA))).toBe('TRADEBOOK_CSV');
    expect(await detectTradeSource('bank.csv', bytes('Date,Narration,Withdrawal,Deposit\n01/01/2025,ATM,500,'))).toBeNull();
  });

  it('recognises a PDF as a contract note', async () => {
    expect(await detectTradeSource('note.pdf', bytes('%PDF-1.4\n'))).toBe('CONTRACT_NOTE_PDF');
  });
});

describe('zerodha tradebook', () => {
  it('names the profile and the broker from the layout', async () => {
    const result = await parseTradeCsv(bytes(ZERODHA), 'tradebook.csv');
    expect(result.profile).toBe('zerodha-tradebook');
    expect(result.broker).toBe('Zerodha');
    expect(result.rows).toHaveLength(4);
  });

  it('reads an equity fill with its ISIN, time and value', async () => {
    const [buy] = (await parseTradeCsv(bytes(ZERODHA), 'tradebook.csv')).rows;
    expect(buy).toMatchObject({
      date: '2025-06-02',
      time: '09:20:31',
      exchange: 'NSE',
      segment: 'EQUITY_DELIVERY',
      symbol: 'INFY',
      underlying: 'INFY',
      isin: 'INE009A01021',
      side: 'BUY',
      quantity: '100',
      price: '1580.55',
      amount: '158055.0000',
      orderId: '222',
      tradeRef: '111',
    });
  });

  it('reads an option fill into its contract parts', async () => {
    const option = (await parseTradeCsv(bytes(ZERODHA), 'tradebook.csv')).rows[2];
    expect(option).toMatchObject({
      segment: 'INDEX_OPTIONS',
      exchange: 'NFO',
      underlying: 'NIFTY',
      expiry: '2025-06-26',
      strike: '24500.00',
      right: 'CE',
      quantity: '75',
    });
  });

  it('warns that equity fills without a product column are taken as delivery', async () => {
    const { warnings } = await parseTradeCsv(bytes(ZERODHA), 'tradebook.csv');
    expect(warnings.some((w) => w.includes('delivery'))).toBe(true);
  });

  it('gives every fill a stable duplicate key', async () => {
    const first = await parseTradeCsv(bytes(ZERODHA), 'tradebook.csv');
    const again = await parseTradeCsv(bytes(ZERODHA), 'tradebook.csv');
    expect(first.rows.map((r) => r.externalRef)).toEqual(again.rows.map((r) => r.externalRef));
    expect(new Set(first.rows.map((r) => r.externalRef)).size).toBe(4);
  });
});

describe('other broker layouts', () => {
  it('reads an Angel One export, day-first dates and all', async () => {
    const result = await parseTradeCsv(bytes(ANGEL), 'angel.csv');
    expect(result.profile).toBe('angel-one-tradebook');
    expect(result.broker).toBe('Angel One');
    expect(result.rows[0]).toMatchObject({ date: '2025-06-02', symbol: 'TCS', side: 'BUY', time: '09:45:10' });
    expect(result.rows[1].side).toBe('SELL');
  });

  it('keeps the charges the file stated', async () => {
    const { rows } = await parseTradeCsv(bytes(ANGEL), 'angel.csv');
    expect(rows[1].reportedCharges).toMatchObject({ brokerage: '20.00', stt: '43.63', total: '70.10' });
    expect(rows[0].reportedCharges).toMatchObject({ total: '25.40' });
  });

  it('reads an MCX commodity future', async () => {
    const { rows } = await parseTradeCsv(bytes(MCX), 'dhan.csv');
    expect(rows[0]).toMatchObject({
      exchange: 'MCX',
      segment: 'COMMODITY_FUTURES',
      underlying: 'CRUDEOIL',
      expiry: '2025-06-26',
      date: '2025-06-05',
    });
  });

  it('reads a generic layout with no recognised profile', async () => {
    const generic = ['Date,Symbol,Type,Qty,Price', '2025-06-02,SBIN,buy,10,800.25', '2025-06-02,SBIN,sell,10,812.00'].join('\n');
    const result = await parseTradeCsv(bytes(generic), 'mytrades.csv');
    expect(result.profile).toBe('generic');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].price).toBe('800.25');
  });

  it('marks intraday fills from the product column', async () => {
    const intraday = ['Date,Symbol,Trade Type,Quantity,Price,Product', '2025-06-02,SBIN,buy,10,800,MIS'].join('\n');
    const { rows } = await parseTradeCsv(bytes(intraday), 'x.csv');
    expect(rows[0].segment).toBe('EQUITY_INTRADAY');
  });

  it('works out the price when only a trade value is given', async () => {
    const valued = ['Date,Symbol,Trade Type,Quantity,Trade Value', '2025-06-02,SBIN,buy,10,8002.50'].join('\n');
    const { rows } = await parseTradeCsv(bytes(valued), 'x.csv');
    expect(rows[0].price).toBe('800.2500');
    expect(rows[0].amount).toBe('8002.5000');
  });

  it('skips unreadable rows instead of failing the file', async () => {
    const messy = [
      'Date,Symbol,Trade Type,Quantity,Price',
      '2025-06-02,SBIN,buy,10,800',
      'not-a-date,SBIN,buy,10,800',
      '2025-06-03,SBIN,hold,10,800',
    ].join('\n');
    const { rows, warnings } = await parseTradeCsv(bytes(messy), 'x.csv');
    expect(rows).toHaveLength(1);
    expect(warnings.filter((w) => w.startsWith('Skipped'))).toHaveLength(2);
  });

  it('refuses a file with no tradebook columns at all', async () => {
    await expect(parseTradeCsv(bytes('a,b,c\n1,2,3'), 'x.csv')).rejects.toMatchObject({ code: 'UNKNOWN_TRADEBOOK_LAYOUT' });
  });
});
