import { parseOhlcvFile } from './market-data';

const file = (text: string) => new TextEncoder().encode(text);

describe('OHLCV import', () => {
  it('reads a plain daily file', async () => {
    const result = await parseOhlcvFile(
      file(['Date,Open,High,Low,Close,Volume', '2024-01-01,100,105,99,104,1000', '2024-01-02,104,108,103,107,1200'].join('\n')),
      'nifty.csv',
    );
    expect(result.timeframe).toBe('DAY');
    expect(result.bars).toHaveLength(2);
    expect(result.bars[0]).toEqual({ date: '2024-01-01', time: null, open: 100, high: 105, low: 99, close: 104, volume: 1000 });
    expect(result.warnings).toEqual([]);
  });

  it('recognises minute data from an ISO timestamp and calls it intraday', async () => {
    const result = await parseOhlcvFile(
      file(['timestamp,open,high,low,close,volume', '2024-01-01 09:15:00,100,101,99,100,50', '2024-01-01T09:16:00,100,102,100,101,60'].join('\n')),
      'bars.csv',
    );
    expect(result.timeframe).toBe('MINUTE');
    expect(result.bars[0].time).toBe('09:15');
    expect(result.bars[1].time).toBe('09:16');
  });

  it('joins a separate date and time column', async () => {
    const result = await parseOhlcvFile(
      file(['Date,Time,Open,High,Low,Close,Volume', '01-01-2024,09:15,100,101,99,100,50'].join('\n')),
      'bars.csv',
    );
    expect(result.bars[0]).toMatchObject({ date: '2024-01-01', time: '09:15' });
  });

  it('sorts newest-first files back into chronological order', async () => {
    const result = await parseOhlcvFile(
      file(['Date,Open,High,Low,Close,Volume', '2024-01-03,3,4,2,3,1', '2024-01-02,2,3,1,2,1', '2024-01-01,1,2,1,1,1'].join('\n')),
      'reverse.csv',
    );
    expect(result.bars.map((bar) => bar.date)).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
  });

  it('drops a bar whose high and low do not contain the open and close, rather than repairing it', async () => {
    const result = await parseOhlcvFile(
      file(['Date,Open,High,Low,Close,Volume', '2024-01-01,100,105,99,104,1000', '2024-01-02,104,100,103,107,1200'].join('\n')),
      'broken.csv',
    );
    expect(result.bars).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('do not contain the open and close');
  });

  it('drops duplicates and unparseable rows with a reason', async () => {
    const result = await parseOhlcvFile(
      file(
        ['Date,Open,High,Low,Close,Volume', '2024-01-01,100,105,99,104,1', '2024-01-01,100,105,99,104,1', 'rubbish,1,2,0.5,1,1'].join('\n'),
      ),
      'dupes.csv',
    );
    expect(result.bars).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('already in the file');
  });

  it('picks up the symbol when the file carries one', async () => {
    const result = await parseOhlcvFile(
      file(['symbol,date,open,high,low,close,volume', 'infy,2024-01-01,100,105,99,104,1'].join('\n')),
      'x.csv',
    );
    expect(result.symbol).toBe('INFY');
  });

  it('says so when there is no volume column', async () => {
    const result = await parseOhlcvFile(file(['Date,Open,High,Low,Close', '2024-01-01,100,105,99,104'].join('\n')), 'novol.csv');
    expect(result.bars[0].volume).toBe(0);
    expect(result.warnings.join(' ')).toContain('volume of zero');
  });

  it('skips a title block above the header', async () => {
    const result = await parseOhlcvFile(
      file(['NIFTY 50 historical data', 'Generated 2024-01-05', '', 'Date,Open,High,Low,Close,Volume', '2024-01-01,100,105,99,104,1'].join('\n')),
      'titled.csv',
    );
    expect(result.bars).toHaveLength(1);
  });

  it('refuses a file that is not price data', async () => {
    await expect(parseOhlcvFile(file('name,email\nalice,a@example.com'), 'contacts.csv')).rejects.toThrow(/does not look like price data/);
  });

  it('refuses a price file with no usable rows', async () => {
    await expect(parseOhlcvFile(file('Date,Open,High,Low,Close\nnope,a,b,c,d'), 'empty.csv')).rejects.toThrow(/No usable bars/);
  });
});
