import {
  DomainError,
  classifySegment,
  normaliseExchange,
  parseTradingSymbol,
  type ChargeBreakdown,
  type OptionRight,
  type ParsedTradeRow,
  type TradeExchange,
  type TradeImportSource,
  type TradeSegment,
  type TradeStatementParser,
  type TradeSide,
} from '@arvo/finance-core';
import { parseAmount } from './amounts';
import { decodeText, detectDelimiter, parseCsv } from './csv';
import { DATE_FORMATS, parseDate } from './dates';
import { extractPdfLines } from './pdf';
import { extractXlsx } from './xlsx';

/*
 * Tradebook, P&L and contract-note parsing.
 *
 * Six Indian brokers publish six different tradebooks, and each of them has changed layout at
 * least once. Rather than six parsers there is one column map with an alias list per logical
 * column, and a set of named profiles used only to label the import and to pick the broker
 * name. Adding a seventh broker is usually a few aliases.
 *
 * Nothing here reaches the network. A scanned contract note is refused with an explanation
 * rather than guessed at, and a password-protected PDF says so.
 *
 * What the file does not say, the symbol does: NIFTY24SEP24500CE carries the underlying, the
 * expiry, the strike and the right, and finance-core knows how to read it.
 */

// ---- detection ----

export async function detectTradeSource(filename: string, bytes: Uint8Array): Promise<TradeImportSource | null> {
  const head = Buffer.from(bytes.subarray(0, 5)).toString('latin1');
  if (head === '%PDF-') return 'CONTRACT_NOTE_PDF';

  const name = filename.toLowerCase();
  const headers = await headerRow(bytes, filename);
  if (headers.length === 0) return null;
  if (tradeColumns(headers) !== null) return 'TRADEBOOK_CSV';
  if (headers.some((h) => /realized p ?& ?l|realised p ?& ?l|realized profit|net p ?& ?l/i.test(h.trim()))) return 'PNL_CSV';
  if (name.includes('tradebook')) return 'TRADEBOOK_CSV';
  return null;
}

async function tableOf(bytes: Uint8Array, filename: string): Promise<string[][]> {
  if (/\.xlsx?$/i.test(filename) || Buffer.from(bytes.subarray(0, 2)).toString('latin1') === 'PK') {
    const { tables } = await extractXlsx(bytes);
    return tables[0]?.rows ?? [];
  }
  const text = decodeText(bytes);
  return parseCsv(text, detectDelimiter(text)).filter((row) => row.some((cellValue) => cellValue.trim() !== ''));
}

async function headerRow(bytes: Uint8Array, filename: string): Promise<string[]> {
  const table = await tableOf(bytes, filename);
  // Broker exports often start with a title and an account block; the header is the first row
  // with several filled cells.
  for (const row of table.slice(0, 25)) {
    if (row.filter((cellValue) => cellValue.trim() !== '').length >= 4) return row;
  }
  return table[0] ?? [];
}

// ---- column map ----

/** Header aliases per logical column. First match wins, so the specific names come first. */
const ALIASES = {
  date: /^(trade_?date|trade date|date|order date|transaction date|execution date|exec date|date of trade)$/i,
  time: /^(order_execution_time|order execution time|trade_?time|trade time|time|execution time|exec time)$/i,
  symbol: /^(tradingsymbol|trading symbol|symbol|scrip ?name|scrip|contract|contract description|instrument|instrument name|stock ?name|company ?name|security ?name|particulars|name)$/i,
  isin: /^isin( code)?$/i,
  exchange: /^(exchange|exch|exchange name)$/i,
  segment: /^(segment|exchange segment|market segment|instrument type)$/i,
  product: /^(product|product type|product code|position type|order type)$/i,
  side: /^(trade_?type|trade type|buy ?\/ ?sell|b ?\/ ?s|transaction type|txn type|side|type)$/i,
  quantity: /^(quantity|qty|traded quantity|filled qty|trade qty|no\.? of shares|lots)$/i,
  price: /^(trade ?price|price|rate|trade rate|avg\.? price|average price|executed price)$/i,
  amount: /^(trade ?value|amount|value|net amount|turnover|gross amount)$/i,
  orderId: /^(order_?id|order id|order ?no\.?|order number)$/i,
  tradeId: /^(trade_?id|trade id|trade ?no\.?|trade number)$/i,
  expiry: /^(expiry|expiry date|expiry_?dt)$/i,
  strike: /^(strike|strike price)$/i,
  right: /^(option type|opt ?type|right|call ?\/ ?put|ce ?\/ ?pe)$/i,
  lotSize: /^(lot ?size|lot|market lot)$/i,
  brokerage: /^(brokerage|brokerage amount)$/i,
  stt: /^(stt|stt ?\/ ?ctt|securities transaction tax|stt ctt)$/i,
  exchangeCharges: /^(exchange (transaction )?charges|transaction charges|exchange txn charges|exch\.? charges)$/i,
  sebiCharges: /^(sebi (turnover )?(fees?|charges)|sebi)$/i,
  stampDuty: /^(stamp ?duty|stamp charges)$/i,
  gst: /^(gst|goods and services tax|igst|service tax)$/i,
  dpCharges: /^(dp ?charges|depository charges)$/i,
  totalCharges: /^(total charges|charges|taxes and charges|net charges|total taxes)$/i,
} satisfies Record<string, RegExp>;

type ColumnKey = keyof typeof ALIASES;
type ColumnIndex = Partial<Record<ColumnKey, number>>;

/** Named profiles, used to label the import and to name the broker. */
const PROFILES: { id: string; broker: string; needs: RegExp[] }[] = [
  { id: 'zerodha-tradebook', broker: 'Zerodha', needs: [/^trade_date$/i, /^trade_type$/i, /^order_execution_time$/i] },
  { id: 'zerodha-pnl', broker: 'Zerodha', needs: [/^isin$/i, /realized p ?& ?l/i] },
  { id: 'upstox-tradebook', broker: 'Upstox', needs: [/^(scrip ?name|company ?name)$/i, /^(trade ?type|buy ?\/ ?sell)$/i, /^(trade ?number|trade ?no\.?)$/i] },
  { id: 'groww-tradebook', broker: 'Groww', needs: [/^stock ?name$/i, /^(trade ?date|date)$/i, /^(trade ?type|buy ?\/ ?sell)$/i] },
  { id: 'angel-one-tradebook', broker: 'Angel One', needs: [/^(symbol|tradingsymbol)$/i, /^buy ?\/ ?sell$/i, /^(trade ?date|date)$/i] },
  { id: 'dhan-tradebook', broker: 'Dhan', needs: [/^(name|instrument)$/i, /^segment$/i, /^(trade ?type|buy ?\/ ?sell)$/i] },
  { id: 'fyers-tradebook', broker: 'Fyers', needs: [/^(trade ?value|trade ?price)$/i, /^(trade ?number|trade ?no\.?)$/i, /^(symbol|scrip ?name)$/i] },
];

function tradeColumns(headers: string[]): { index: ColumnIndex; profile: string; broker: string } | null {
  const index: ColumnIndex = {};
  for (const [key, pattern] of Object.entries(ALIASES) as [ColumnKey, RegExp][]) {
    const at = headers.findIndex((cellValue) => pattern.test(cellValue.trim()));
    if (at >= 0) index[key] = at;
  }
  // A tradebook needs at minimum an instrument, a direction, a quantity and a price.
  if (index.symbol === undefined || index.side === undefined || index.quantity === undefined) return null;
  if (index.price === undefined && index.amount === undefined) return null;
  if (index.date === undefined) return null;
  const profile = PROFILES.find((p) => p.needs.every((need) => headers.some((cellValue) => need.test(cellValue.trim()))));
  return { index, profile: profile?.id ?? 'generic', broker: profile?.broker ?? 'Unknown' };
}

// ---- tradebook parsing ----

export async function parseTradeCsv(
  bytes: Uint8Array,
  filename: string,
): Promise<{ rows: ParsedTradeRow[]; warnings: string[]; profile: string; broker: string }> {
  const table = await tableOf(bytes, filename);
  const headerAt = table.findIndex((row) => tradeColumns(row) !== null);
  if (headerAt < 0) {
    throw DomainError.validation(
      'UNKNOWN_TRADEBOOK_LAYOUT',
      'No tradebook columns were recognised. The file needs a header row with a date, a symbol, a buy/sell column, a quantity and a price.',
    );
  }
  const { index, profile, broker } = tradeColumns(table[headerAt])!;
  const body = table.slice(headerAt + 1);
  const warnings: string[] = [];
  const dateFormat = detectFormat(body.map((row) => cell(row, index.date)));
  const hasProduct = index.product !== undefined;

  const rows: ParsedTradeRow[] = [];
  let assumedDelivery = 0;

  for (const row of body) {
    const rawSymbol = cell(row, index.symbol);
    if (!rawSymbol) continue;
    const side = parseSide(cell(row, index.side));
    if (!side) {
      if (cell(row, index.quantity)) warnings.push(`Skipped a row with an unreadable buy/sell value: "${cell(row, index.side)}"`);
      continue;
    }
    const date = parseDate(cell(row, index.date), dateFormat);
    if (!date) {
      warnings.push(`Skipped a row with an unreadable date: "${cell(row, index.date)}"`);
      continue;
    }
    const quantity = wholeQuantity(cell(row, index.quantity));
    if (quantity === null || quantity <= 0n) continue;
    const priceAmount = parseAmount(cell(row, index.price));
    const valueAmount = parseAmount(cell(row, index.amount));
    if (!priceAmount && !valueAmount) continue;
    const price = priceAmount ? absolute(priceAmount.value) : divide(absolute(valueAmount!.value), quantity);
    const amount = multiply(quantity, price);

    const symbol = rawSymbol.trim().toUpperCase().replace(/\s+/g, '');
    const parsed = parseTradingSymbol(symbol);
    const expiry = parseFlexibleDate(cell(row, index.expiry)) ?? parsed.expiry;
    const right = parseRight(cell(row, index.right)) ?? parsed.right;
    const strike = parseAmount(cell(row, index.strike))?.value ?? parsed.strike;
    const exchange = exchangeOf(cell(row, index.exchange), cell(row, index.segment), Boolean(expiry || right));
    const intraday = hasProduct ? isIntradayProduct(cell(row, index.product)) : false;
    const segment = segmentOf(cell(row, index.segment), { exchange, underlying: parsed.underlying, right, expiry, intraday });
    if (segment === 'EQUITY_DELIVERY' && !hasProduct) assumedDelivery += 1;

    const time = parseTime(cell(row, index.time));
    const tradeRef = cell(row, index.tradeId) || null;
    const reported = reportedCharges(row, index);

    rows.push({
      date,
      time,
      broker,
      exchange,
      segment,
      symbol,
      underlying: parsed.underlying || symbol,
      isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(cell(row, index.isin).toUpperCase()) ? cell(row, index.isin).toUpperCase() : null,
      expiry,
      strike: strike === null ? null : absolute(strike),
      right,
      lotSize: Number(cell(row, index.lotSize)) > 0 ? Math.trunc(Number(cell(row, index.lotSize))) : 1,
      side,
      quantity: quantity.toString(),
      price,
      amount,
      reportedCharges: reported,
      orderId: cell(row, index.orderId) || null,
      tradeRef,
      externalRef: reference([broker, symbol, date, time, side, quantity.toString(), price, tradeRef]),
    });
  }

  if (rows.length === 0) throw DomainError.validation('NO_ROWS', 'No trades were found in the file');
  if (assumedDelivery > 0) {
    warnings.push(
      `${assumedDelivery} equity ${assumedDelivery === 1 ? 'fill has' : 'fills have'} no product column (MIS or CNC), so they are recorded as delivery. Change the segment on any that were intraday — STT and stamp duty differ.`,
    );
  }
  return { rows, warnings: warnings.slice(0, 50), profile, broker };
}

// ---- contract note PDF ----

const NOTE_DATE = /(?:trade\s*date|dated|date)\s*[:-]?\s*(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})/i;
/** A fill row: exchange or segment, symbol, buy/sell, quantity, price. Layouts vary wildly. */
const NOTE_ROW =
  /^(?:(NSE|BSE|NFO|BFO|CDS|MCX)\s+)?([A-Z][A-Z0-9&_.-]{1,30})\s+(?:(\d{1,2}[-/:]\d{2}(?::\d{2})?)\s+)?(B|S|BUY|SELL|BUY\(.*?\)|SELL\(.*?\))\s+([\d,]+)\s+([\d,]+\.\d{1,4})\b/i;
const CHARGE_LINE = /^(brokerage|securities transaction tax|stt|exchange transaction charges?|sebi turnover fees?|stamp duty|gst|igst|goods and service tax|total charges?|net (?:amount|total))\b[^\d]*(-?[\d,]+\.\d{2})/i;

export async function parseContractNote(bytes: Uint8Array): Promise<{ rows: ParsedTradeRow[]; warnings: string[]; broker: string }> {
  const { lines, warnings } = await extractPdfLines(bytes);
  if (lines.length === 0) {
    throw DomainError.validation(
      'UNREADABLE_PDF',
      'No text could be read from this contract note. Scanned or image-only notes are not supported — use the broker’s tradebook CSV instead.',
    );
  }
  const text = lines.map((line) => line.text).join('\n');
  const broker = detectBroker(text);
  const noteDate = NOTE_DATE.exec(text)?.[1];
  const date = noteDate ? parseFlexibleDate(noteDate) : null;
  if (!date) {
    throw DomainError.validation('NO_TRADE_DATE', 'No trade date was found on this contract note');
  }

  const rows: ParsedTradeRow[] = [];
  for (const line of lines) {
    const match = NOTE_ROW.exec(line.text.trim());
    if (!match) continue;
    const [, exchangeText, rawSymbol, time, sideText, quantityText, priceText] = match;
    const side = parseSide(sideText);
    const quantity = wholeQuantity(quantityText);
    if (!side || quantity === null || quantity <= 0n) continue;
    const price = absolute(parseAmount(priceText)!.value);
    const symbol = rawSymbol.toUpperCase();
    const parsed = parseTradingSymbol(symbol);
    const exchange = exchangeOf(exchangeText ?? '', '', Boolean(parsed.expiry || parsed.right));
    rows.push({
      date,
      time: time ? parseTime(time) : null,
      broker,
      exchange,
      segment: classifySegment({ exchange, underlying: parsed.underlying, right: parsed.right, expiry: parsed.expiry }),
      symbol,
      underlying: parsed.underlying || symbol,
      isin: null,
      expiry: parsed.expiry,
      strike: parsed.strike,
      right: parsed.right,
      lotSize: 1,
      side,
      quantity: quantity.toString(),
      price,
      amount: multiply(quantity, price),
      reportedCharges: null,
      orderId: null,
      tradeRef: null,
      externalRef: reference([broker, symbol, date, null, side, quantity.toString(), price, 'note']),
    });
  }

  if (rows.length === 0) {
    throw DomainError.validation(
      'NO_TRADES_IN_NOTE',
      'No trade rows were recognised on this contract note. The layout varies by broker; the tradebook CSV is the reliable route.',
    );
  }

  // A note states its charges once for the whole day. Spreading the stated total across the
  // fills by turnover keeps the day's total exact even though the per-fill split is ours.
  const stated = statedTotal(lines.map((line) => line.text));
  if (stated !== null) {
    spreadTotal(rows, stated);
    warnings.push('The note states one charges total for the day; it has been split across the fills in proportion to their value.');
  } else {
    warnings.push('No charges total was found on the note, so charges are estimated from the statutory rates.');
  }
  return { rows, warnings: warnings.slice(0, 50), broker };
}

function detectBroker(text: string): string {
  const brokers: [RegExp, string][] = [
    [/zerodha/i, 'Zerodha'],
    [/upstox|rksv/i, 'Upstox'],
    [/groww|nextbillion/i, 'Groww'],
    [/angel\s*(one|broking)/i, 'Angel One'],
    [/dhan|raise financial/i, 'Dhan'],
    [/fyers/i, 'Fyers'],
    [/icici\s*direct/i, 'ICICI Direct'],
    [/hdfc\s*securities/i, 'HDFC Securities'],
    [/kotak\s*securities/i, 'Kotak Securities'],
  ];
  return brokers.find(([pattern]) => pattern.test(text))?.[1] ?? 'Unknown';
}

/** The note's "total charges" line, or the sum of the individual charge lines. */
function statedTotal(lines: string[]): string | null {
  let total: string | null = null;
  const parts: string[] = [];
  for (const line of lines) {
    const match = CHARGE_LINE.exec(line.trim());
    if (!match) continue;
    const [, label, value] = match;
    if (/^total charges?$/i.test(label)) total = absolute(parseAmount(value)!.value);
    else if (!/^net /i.test(label)) parts.push(absolute(parseAmount(value)!.value));
  }
  if (total) return total;
  if (parts.length === 0) return null;
  return parts.reduce((sum, part) => addMoney(sum, part), '0');
}

function spreadTotal(rows: ParsedTradeRow[], total: string): void {
  const turnovers = rows.map((row) => toUnits(row.amount, 4));
  const sum = turnovers.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return;
  const totalUnits = toUnits(total, 4);
  let assigned = 0n;
  rows.forEach((row, i) => {
    const share = i === rows.length - 1 ? totalUnits - assigned : (turnovers[i] * totalUnits) / sum;
    assigned += share;
    row.reportedCharges = { total: fromUnits(share, 4) } as Partial<ChargeBreakdown>;
  });
}

// ---- the port implementation ----

export class TradeFileParser implements TradeStatementParser {
  async detectSource(filename: string, bytes: Uint8Array) {
    return detectTradeSource(filename, bytes);
  }

  async parseTradeCsv(bytes: Uint8Array, filename: string) {
    return parseTradeCsv(bytes, filename);
  }

  async parseContractNote(bytes: Uint8Array) {
    return parseContractNote(bytes);
  }
}

// ---- helpers ----

const cell = (row: string[] | undefined, at: number | undefined) => (row && at !== undefined ? (row[at] ?? '').trim() : '');

function parseSide(text: string): TradeSide | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  if (/^(b|buy|bought|purchase|p)\b/.test(value) || value.startsWith('buy')) return 'BUY';
  if (/^(s|sell|sold|sale)\b/.test(value) || value.startsWith('sell')) return 'SELL';
  return null;
}

function parseRight(text: string): OptionRight | null {
  const value = text.trim().toUpperCase();
  if (/^(CE|CALL|C)$/.test(value)) return 'CE';
  if (/^(PE|PUT|P)$/.test(value)) return 'PE';
  return null;
}

/** MIS, BO and CO are intraday products; CNC and NRML are not. */
function isIntradayProduct(text: string): boolean {
  return /^(mis|bo|co|intraday|intra|margin)$/i.test(text.trim());
}

function exchangeOf(exchangeText: string, segmentText: string, derivative: boolean): TradeExchange {
  const segment = segmentText.trim().toUpperCase();
  const exchange = exchangeText.trim().toUpperCase();
  if (/^(CD|CDS|CURRENCY)/.test(segment)) return exchange.startsWith('BSE') ? 'BCD' : 'CDS';
  if (/^(CO|COM|MCX|COMMODITY)/.test(segment) || exchange === 'MCX') return 'MCX';
  if (/^(FO|F&O|FNO|DERIVATIVE|FUT|OPT)/.test(segment)) return exchange.startsWith('BSE') ? 'BFO' : 'NFO';
  if (exchange) return normaliseExchange(exchange, derivative ? 'NFO' : 'NSE');
  return derivative ? 'NFO' : 'NSE';
}

function segmentOf(
  segmentText: string,
  contract: { exchange: TradeExchange; underlying: string; right: OptionRight | null; expiry: string | null; intraday: boolean },
): TradeSegment {
  const value = segmentText.trim().toUpperCase();
  // Some files name the instrument type outright; trust it over the symbol when they disagree.
  if (/^(FUTIDX|FUTSTK|FUTCUR|FUTCOM)$/.test(value)) {
    return value === 'FUTIDX' ? 'INDEX_FUTURES' : value === 'FUTCUR' ? 'CURRENCY_FUTURES' : value === 'FUTCOM' ? 'COMMODITY_FUTURES' : 'EQUITY_FUTURES';
  }
  if (/^(OPTIDX|OPTSTK|OPTCUR|OPTFUT|OPTCOM)$/.test(value)) {
    return value === 'OPTIDX' ? 'INDEX_OPTIONS' : value === 'OPTCUR' ? 'CURRENCY_OPTIONS' : value === 'OPTCOM' ? 'COMMODITY_OPTIONS' : 'EQUITY_OPTIONS';
  }
  return classifySegment(contract);
}

function parseTime(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  // Brokers write "2024-09-24 09:20:31", "09:20:31" or "9:20 AM".
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}`;
}

function reportedCharges(row: string[], index: ColumnIndex): Partial<ChargeBreakdown> | null {
  const keys: [keyof ChargeBreakdown, ColumnKey][] = [
    ['brokerage', 'brokerage'],
    ['stt', 'stt'],
    ['exchangeCharges', 'exchangeCharges'],
    ['sebiCharges', 'sebiCharges'],
    ['stampDuty', 'stampDuty'],
    ['gst', 'gst'],
    ['dpCharges', 'dpCharges'],
    ['total', 'totalCharges'],
  ];
  const reported: Partial<ChargeBreakdown> = {};
  let found = false;
  for (const [target, source] of keys) {
    const value = parseAmount(cell(row, index[source]));
    if (!value) continue;
    (reported as Record<string, string>)[target] = absolute(value.value);
    found = true;
  }
  return found ? reported : null;
}

function wholeQuantity(text: string): bigint | null {
  const parsed = parseAmount(text);
  if (!parsed) return null;
  const whole = absolute(parsed.value).split('.')[0];
  if (!/^\d+$/.test(whole)) return null;
  return BigInt(whole);
}

function detectFormat(samples: string[]): (typeof DATE_FORMATS)[number] {
  const values = samples.map((s) => s.trim()).filter(Boolean).slice(0, 50);
  for (const format of DATE_FORMATS) {
    const parsed = values.filter((value) => parseDate(value, format) !== null).length;
    if (values.length > 0 && parsed / values.length > 0.8) return format;
  }
  return 'YYYY-MM-DD';
}

function parseFlexibleDate(value: string): string | null {
  if (!value.trim()) return null;
  for (const format of DATE_FORMATS) {
    const date = parseDate(value, format);
    if (date) return date;
  }
  return null;
}

const absolute = (value: string) => (value.startsWith('-') ? value.slice(1) : value);

const toUnits = (value: string, digits: number): bigint => {
  const [whole, fraction = ''] = absolute(value).split('.');
  return BigInt(whole || '0') * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0').slice(0, digits) || '0');
};

const fromUnits = (units: bigint, digits: number): string => {
  const scale = 10n ** BigInt(digits);
  return `${units / scale}.${(units % scale).toString().padStart(digits, '0')}`;
};

/** quantity (whole) × price (4 dp) as a 4-decimal money string. */
function multiply(quantity: bigint, price: string): string {
  return fromUnits(quantity * toUnits(price, 4), 4);
}

/** value ÷ quantity to 4 decimals, rounded half up: the price a file gave only a total for. */
function divide(value: string, quantity: bigint): string {
  if (quantity === 0n) return '0.0000';
  const units = toUnits(value, 4);
  return fromUnits((units * 2n + quantity) / (2n * quantity), 4);
}

const addMoney = (a: string, b: string): string => fromUnits(toUnits(a, 4) + toUnits(b, 4), 4);

/** Stable duplicate key: same fill, same key, whatever order the files arrive in. */
function reference(parts: (string | null)[]): string {
  return parts
    .map((part) => (part ?? '').toString().trim().toUpperCase().replace(/\s+/g, ' '))
    .join('|')
    .slice(0, 400);
}
