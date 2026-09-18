import {
  DomainError,
  type HoldingTransactionType,
  type InstrumentKind,
  type ParsedNavRow,
  type ParsedPortfolioRow,
  type PortfolioImportSource,
  type PortfolioStatementParser,
} from '@arvo/finance-core';
import { parseAmount } from './amounts';
import { decodeText, detectDelimiter, parseCsv } from './csv';
import { DATE_FORMATS, parseDate } from './dates';
import { extractPdfLines } from './pdf';

/*
 * Portfolio statement parsing: CAMS/KFintech consolidated account statements, broker holdings
 * and tradebook CSVs, AMFI NAV files, index series and fund portfolio disclosures.
 *
 * Everything is derived from the file's own content. Nothing here reaches the network, and a
 * password-protected PDF is refused with a message that says what to do about it rather than
 * guessing at a password.
 *
 * Broker CSVs use the same idea as the bank-statement importer: a small set of named profiles
 * recognised from the header row, all resolving to one column map, so a new broker is a new
 * alias list rather than a new parser.
 */

const ISIN = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;

// ---- file type detection ----

export async function detectPortfolioSource(filename: string, bytes: Uint8Array): Promise<PortfolioImportSource | null> {
  const head = Buffer.from(bytes.subarray(0, 5)).toString('latin1');
  if (head === '%PDF-') return 'CAS_PDF';
  const text = decodeText(bytes.subarray(0, 64_000));
  const name = filename.toLowerCase();

  if (/^\s*Scheme Code;/im.test(text) || name.includes('navall')) return 'AMFI_NAV';
  const headers = headerCells(text);
  if (headers.some((h) => /% *(?:to|of) *net assets|% *to *nav/i.test(h))) return 'FUND_DISCLOSURE_CSV';
  if (headers.some((h) => /^date$/i.test(h)) && headers.some((h) => /^(close|index value|total returns index|tri|closing value)$/i.test(h))) {
    return 'BENCHMARK_CSV';
  }
  if (brokerColumns(headers) !== null) return 'BROKER_CSV';
  return null;
}

function headerCells(text: string): string[] {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter).filter((row) => row.some((cell) => cell.trim() !== ''));
  // The header is the first row with at least two non-empty cells; files often start with a title.
  for (const row of rows.slice(0, 15)) {
    if (row.filter((cell) => cell.trim() !== '').length >= 2) return row;
  }
  return [];
}

// ---- broker CSV profiles ----

/** Header aliases per logical column. First match wins, so put the specific names first. */
const ALIASES: Record<string, RegExp> = {
  symbol: /^(symbol|tradingsymbol|trading symbol|scrip|scrip code|stock symbol|instrument)$/i,
  name: /^(stock name|company name|security name|scheme name|instrument name|fund name|name|particulars)$/i,
  isin: /^isin( code)?$/i,
  schemeCode: /^(scheme code|amfi code|amfi scheme code)$/i,
  folio: /^(folio|folio no\.?|folio number)$/i,
  amc: /^(amc|fund house|amc name)$/i,
  date: /^(trade_date|trade date|date|transaction date|order date|txn date)$/i,
  type: /^(trade_type|trade type|transaction type|type|buy\/sell|order type)$/i,
  quantity: /^(quantity|qty|units|quantity available|qty\.|no\. of shares|closing units|balance units)$/i,
  price: /^(price|average price|avg price|average buy price|avg\. price|nav|average nav|purchase nav|buy price|rate)$/i,
  amount: /^(amount|trade value|buy value|net amount|invested value|investment value|total)$/i,
  charges: /^(charges|brokerage|total charges|taxes and charges)$/i,
};

/** Named profiles, used only to label the import; the column map does the real work. */
const PROFILES: { id: string; needs: RegExp[] }[] = [
  { id: 'zerodha-tradebook', needs: [/^trade_date$/i, /^trade_type$/i, /^isin$/i] },
  { id: 'zerodha-holdings', needs: [/^quantity available$/i, /^average price$/i] },
  { id: 'groww-holdings', needs: [/^stock name$/i, /^average buy price$/i] },
  { id: 'groww-mutual-funds', needs: [/^scheme name$/i, /^folio( number)?$/i] },
  { id: 'upstox-holdings', needs: [/^company name$/i, /^(average price|avg price)$/i] },
  { id: 'angel-one-holdings', needs: [/^(symbol|tradingsymbol)$/i, /^(average price|avg price)$/i] },
];

interface BrokerColumns {
  index: Partial<Record<keyof typeof ALIASES, number>>;
  headerRow: number;
  profile: string;
}

function brokerColumns(headers: string[]): Omit<BrokerColumns, 'headerRow'> | null {
  const index: Partial<Record<string, number>> = {};
  for (const [key, pattern] of Object.entries(ALIASES)) {
    const at = headers.findIndex((cell) => pattern.test(cell.trim()));
    if (at >= 0) index[key] = at;
  }
  const hasIdentity = index.symbol !== undefined || index.isin !== undefined || index.name !== undefined;
  const hasQuantity = index.quantity !== undefined;
  const hasValue = index.price !== undefined || index.amount !== undefined;
  if (!hasIdentity || !hasQuantity || !hasValue) return null;
  const profile = PROFILES.find((p) => p.needs.every((need) => headers.some((cell) => need.test(cell.trim()))))?.id ?? 'generic';
  return { index, profile };
}

export function parseBrokerCsv(
  bytes: Uint8Array,
  filename: string,
  today: string,
): { rows: ParsedPortfolioRow[]; warnings: string[]; profile: string } {
  const text = decodeText(bytes);
  const table = parseCsv(text, detectDelimiter(text)).filter((row) => row.some((cell) => cell.trim() !== ''));
  const headerRow = table.findIndex((row) => brokerColumns(row) !== null);
  if (headerRow < 0) {
    throw DomainError.validation(
      'UNKNOWN_BROKER_LAYOUT',
      'No holdings or tradebook columns were recognised. The file needs a header row with an instrument name or ISIN, a quantity and a price or amount.',
    );
  }
  const { index, profile } = brokerColumns(table[headerRow])!;
  const warnings: string[] = [];
  const body = table.slice(headerRow + 1);

  // A tradebook has a date and a buy/sell column; a holdings file is a snapshot on one date.
  const isTradebook = index.date !== undefined && index.type !== undefined;
  if (!isTradebook) {
    warnings.push(`This looks like a holdings snapshot, so every row is recorded as a purchase dated ${today} at the average price shown.`);
  }
  const dateFormat = isTradebook ? detectFormat(body.map((row) => cell(row, index.date))) : null;

  const rows: ParsedPortfolioRow[] = [];
  for (const row of body) {
    const name = cell(row, index.name) || cell(row, index.symbol);
    if (!name) continue;
    const quantity = parseAmount(cell(row, index.quantity));
    if (!quantity || Number(quantity.value) <= 0) continue;
    const price = parseAmount(cell(row, index.price));
    const amount = parseAmount(cell(row, index.amount));
    if (!price && !amount) continue;

    const date = isTradebook ? parseDate(cell(row, index.date), dateFormat!) : today;
    if (!date) {
      warnings.push(`Skipped a row with an unreadable date: "${cell(row, index.date)}"`);
      continue;
    }
    const typeText = isTradebook ? cell(row, index.type) : 'buy';
    const type = brokerTradeType(typeText);
    if (!type) {
      warnings.push(`Skipped a row with an unknown trade type: "${typeText}"`);
      continue;
    }

    const isin = ISIN.exec(cell(row, index.isin).toUpperCase())?.[1] ?? null;
    const symbol = cell(row, index.symbol).toUpperCase() || null;
    const schemeCode = cell(row, index.schemeCode) || null;
    const folio = cell(row, index.folio) || null;
    const units = trimUnits(quantity.value);
    const gross = amount ? absolute(amount.value) : multiply(units, price!.value);
    const kind: InstrumentKind = schemeCode || folio || /fund|scheme|plan/i.test(name) ? 'MUTUAL_FUND' : 'EQUITY';

    rows.push({
      instrumentName: name,
      kind,
      isin,
      schemeCode,
      symbol: kind === 'EQUITY' ? symbol : null,
      folio,
      amc: cell(row, index.amc) || null,
      date,
      type,
      units,
      price: price ? absolute(price.value) : null,
      amount: gross,
      charges: parseAmount(cell(row, index.charges))?.value ? absolute(parseAmount(cell(row, index.charges))!.value) : '0',
      note: null,
      externalRef: reference(['broker', isin ?? symbol ?? name, folio, date, type, gross, units]),
    });
  }
  return { rows, warnings, profile };
}

function brokerTradeType(text: string): HoldingTransactionType | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  if (/^(buy|b|purchase|bought)$/.test(value)) return 'BUY';
  if (/^(sell|s|sale|sold|redeem|redemption)$/.test(value)) return 'SELL';
  if (/sip|systematic/.test(value)) return 'SIP';
  if (/switch.?out/.test(value)) return 'SWITCH_OUT';
  if (/switch.?in/.test(value)) return 'SWITCH_IN';
  if (/dividend|idcw/.test(value)) return 'DIVIDEND';
  return null;
}

// ---- CAMS / KFintech consolidated account statement ----

const CAS_FOLIO = /folio\s*no\.?\s*:?\s*([\w/ -]+?)(?:\s{2,}|\s*PAN|\s*KYC|$)/i;
const CAS_TRANSACTION =
  /^(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2,4}|\([\d,]+\.\d{2,4}\))\s+([\d,]+\.\d{1,5}|\([\d,]+\.\d{1,5}\))\s+([\d,]+\.\d{1,4})(?:\s+([\d,()]+\.\d{1,5}))?\s*$/;

export async function parseCasPdf(bytes: Uint8Array): Promise<{ rows: ParsedPortfolioRow[]; warnings: string[] }> {
  let lines: { text: string }[];
  let warnings: string[];
  try {
    ({ lines, warnings } = await extractPdfLines(bytes));
  } catch (error) {
    if (isPasswordError(error)) {
      throw DomainError.validation(
        'PDF_PASSWORD_PROTECTED',
        'This CAS is password-protected. Open it with your password, save an unlocked copy, and upload that.',
      );
    }
    throw DomainError.validation('PDF_UNREADABLE', 'This PDF could not be read. Text-based CAS files only; scanned images are not supported yet.');
  }
  if (lines.length === 0) {
    throw DomainError.validation('PDF_NO_TEXT', 'No text was found in this PDF. Scanned statements are not supported yet.');
  }
  const parsed = parseCasLines(lines.map((line) => line.text));
  return { rows: parsed.rows, warnings: [...warnings, ...parsed.warnings] };
}

/** The layout rules, separated from PDF extraction so they can be tested on plain text. */
export function parseCasLines(textLines: string[]): { rows: ParsedPortfolioRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows: ParsedPortfolioRow[] = [];
  let folio: string | null = null;
  let schemeName: string | null = null;
  let isin: string | null = null;
  let schemeCode: string | null = null;
  let amc: string | null = null;

  for (const text of textLines) {
    const folioMatch = CAS_FOLIO.exec(text);
    if (folioMatch) {
      folio = folioMatch[1].trim();
      continue;
    }
    // A scheme header line carries the AMFI code, the scheme name and often the AMC.
    const schemeHeader = /^([A-Z0-9]{2,12})\s*-\s*(.+?)(?:\s{2,}(?:Registrar|ISIN)\b.*)?$/.exec(text);
    if (schemeHeader && /fund|scheme|plan/i.test(schemeHeader[2])) {
      schemeCode = schemeHeader[1];
      schemeName = schemeHeader[2].replace(/\(.*?advisor.*?\)/i, '').trim();
      amc = schemeName.split(/\s+/).slice(0, 2).join(' ');
      isin = null;
      continue;
    }
    const isinMatch = /ISIN\s*:?\s*([A-Z]{2}[A-Z0-9]{9}\d)/i.exec(text);
    if (isinMatch) {
      isin = isinMatch[1].toUpperCase();
      continue;
    }

    const match = CAS_TRANSACTION.exec(text);
    if (!match || !schemeName) continue;
    const [, dateText, description, amountText, unitsText, priceText] = match;
    const type = casTransactionType(description);
    if (!type) continue;
    const date = parseFlexibleDate(dateText);
    if (!date) continue;
    const amount = parseAmount(amountText);
    const units = parseAmount(unitsText);
    const price = parseAmount(priceText);
    if (!amount || !units || !price) continue;

    const gross = absolute(amount.value);
    const quantity = trimUnits(absolute(units.value));
    rows.push({
      instrumentName: schemeName,
      kind: 'MUTUAL_FUND',
      isin,
      schemeCode,
      symbol: null,
      folio,
      amc,
      date,
      type,
      units: quantity,
      price: absolute(price.value),
      amount: gross,
      charges: '0',
      note: description.trim().slice(0, 300),
      externalRef: reference(['cas', isin ?? schemeCode ?? schemeName, folio, date, type, gross, quantity]),
    });
  }

  if (rows.length === 0) {
    warnings.push('No mutual fund transactions were recognised. CAMS and KFintech detailed statements (not the summary CAS) work best.');
  }
  return { rows, warnings };
}

function casTransactionType(description: string): HoldingTransactionType | null {
  const text = description.toLowerCase();
  // Charge and tax lines are part of the purchase above them, not events of their own.
  if (/stamp duty|\*\*\*|stt paid|tax deducted|rejected|reversal/.test(text)) return null;
  if (/switch.{0,4}out|switch out/.test(text)) return 'SWITCH_OUT';
  if (/switch.{0,4}in|switch in/.test(text)) return 'SWITCH_IN';
  if (/redemption|redeem/.test(text)) return 'SELL';
  if (/dividend|idcw|payout/.test(text)) return 'DIVIDEND';
  if (/sip|systematic investment/.test(text)) return 'SIP';
  if (/purchase|investment|allotment/.test(text)) return 'BUY';
  return null;
}

function isPasswordError(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? '';
  const message = String((error as { message?: string })?.message ?? error);
  return name === 'PasswordException' || /password/i.test(message);
}

// ---- AMFI NAV file ----

/**
 * AMFI publishes NAVAll.txt as semicolon-separated rows under AMC and scheme-type headings:
 *   Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
 * Heading lines have no semicolons and are skipped.
 */
export function parseAmfiNav(bytes: Uint8Array): { rows: ParsedNavRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows: ParsedNavRow[] = [];
  for (const line of decodeText(bytes).split(/\r?\n/)) {
    const cells = line.split(';');
    if (cells.length < 6) continue;
    const [code, isinGrowth, , name, nav, dateText] = cells.map((c) => c.trim());
    if (!/^\d+$/.test(code)) continue;
    const price = parseAmount(nav);
    const date = parseFlexibleDate(dateText);
    if (!price || Number(price.value) <= 0 || !date) continue;
    rows.push({
      schemeCode: code,
      name,
      isin: ISIN.exec(isinGrowth.toUpperCase())?.[1] ?? null,
      price: absolute(price.value),
      date,
    });
  }
  if (rows.length === 0) warnings.push('No NAV rows were recognised. Upload AMFI\'s NAVAll.txt as downloaded.');
  return { rows, warnings };
}

// ---- index series ----

export function parseBenchmarkCsv(
  bytes: Uint8Array,
  filename: string,
): { series: string; points: { date: string; value: string }[]; warnings: string[] } {
  const text = decodeText(bytes);
  const table = parseCsv(text, detectDelimiter(text)).filter((row) => row.some((cell) => cell.trim() !== ''));
  const headerRow = table.findIndex(
    (row) => row.some((cell) => /^date$/i.test(cell.trim())) && row.some((cell) => /^(close|index value|total returns index|tri|closing value)$/i.test(cell.trim())),
  );
  if (headerRow < 0) {
    throw DomainError.validation('UNKNOWN_INDEX_LAYOUT', 'The index file needs a "Date" column and a "Close" (or "Total Returns Index") column.');
  }
  const headers = table[headerRow];
  const dateAt = headers.findIndex((cell) => /^date$/i.test(cell.trim()));
  const valueAt = headers.findIndex((cell) => /^(close|index value|total returns index|tri|closing value)$/i.test(cell.trim()));
  const nameAt = headers.findIndex((cell) => /^(index name|name|series)$/i.test(cell.trim()));

  const body = table.slice(headerRow + 1);
  const format = detectFormat(body.map((row) => cell(row, dateAt)));
  const warnings: string[] = [];
  const points: { date: string; value: string }[] = [];
  let series = nameAt >= 0 ? cell(body[0] ?? [], nameAt) : '';

  for (const row of body) {
    const date = parseDate(cell(row, dateAt), format);
    const value = parseAmount(cell(row, valueAt));
    if (!date || !value || Number(value.value) <= 0) continue;
    if (!series && nameAt >= 0) series = cell(row, nameAt);
    points.push({ date, value: absolute(value.value) });
  }
  if (points.length < 2) warnings.push('At least two index levels are needed for a meaningful comparison.');
  const fallback = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return { series: (series || fallback || 'INDEX').slice(0, 80), points, warnings };
}

// ---- fund portfolio disclosure ----

export function parseFundDisclosureCsv(bytes: Uint8Array): {
  rows: { name: string; isin: string | null; weight: string }[];
  asOf: string | null;
  warnings: string[];
} {
  const text = decodeText(bytes);
  const table = parseCsv(text, detectDelimiter(text)).filter((row) => row.some((cell) => cell.trim() !== ''));
  const headerRow = table.findIndex((row) => row.some((cell) => /% *(?:to|of) *net assets|% *to *nav/i.test(cell)));
  if (headerRow < 0) {
    throw DomainError.validation('UNKNOWN_DISCLOSURE_LAYOUT', 'The disclosure needs a "% to Net Assets" column alongside the instrument names.');
  }
  const headers = table[headerRow];
  const weightAt = headers.findIndex((cell) => /% *(?:to|of) *net assets|% *to *nav/i.test(cell));
  const isinAt = headers.findIndex((cell) => /^isin/i.test(cell.trim()));
  const nameAt = headers.findIndex((cell) => /name of the instrument|instrument|company|security|particulars|name/i.test(cell.trim()));

  const warnings: string[] = [];
  const rows: { name: string; isin: string | null; weight: string }[] = [];
  let asOf: string | null = null;
  for (const row of table.slice(0, headerRow)) {
    for (const value of row) {
      asOf ??= parseFlexibleDate(value.replace(/^.*?as on\s*/i, '').trim());
    }
  }

  for (const row of table.slice(headerRow + 1)) {
    const name = nameAt >= 0 ? cell(row, nameAt) : '';
    const weight = parseAmount(cell(row, weightAt).replace('%', ''));
    if (!name || !weight || Number(weight.value) <= 0) continue;
    if (/^(total|grand total|sub total|net assets|net current assets)/i.test(name)) continue;
    rows.push({ name, isin: isinAt >= 0 ? (ISIN.exec(cell(row, isinAt).toUpperCase())?.[1] ?? null) : null, weight: absolute(weight.value) });
  }
  if (rows.length === 0) warnings.push('No portfolio lines were recognised in this disclosure.');
  return { rows, asOf, warnings };
}

// ---- the parser the core talks to ----

export class ArvoPortfolioParser implements PortfolioStatementParser {
  /** Date used for holdings snapshots, which state a position rather than an event. */
  constructor(private readonly today: () => string = () => new Date().toISOString().slice(0, 10)) {}

  detectSource = detectPortfolioSource;

  async parseCas(bytes: Uint8Array) {
    return parseCasPdf(bytes);
  }

  async parseBrokerCsv(bytes: Uint8Array, filename: string) {
    return parseBrokerCsv(bytes, filename, this.today());
  }

  async parseAmfiNav(bytes: Uint8Array) {
    return parseAmfiNav(bytes);
  }

  async parseBenchmarkCsv(bytes: Uint8Array, filename: string) {
    return parseBenchmarkCsv(bytes, filename);
  }

  async parseFundDisclosureCsv(bytes: Uint8Array) {
    return parseFundDisclosureCsv(bytes);
  }
}

// ---- shared helpers ----

const cell = (row: string[] | undefined, at: number | undefined) => (row && at !== undefined ? (row[at] ?? '').trim() : '');

function detectFormat(samples: string[]): (typeof DATE_FORMATS)[number] {
  const values = samples.map((s) => s.trim()).filter(Boolean).slice(0, 50);
  for (const format of DATE_FORMATS) {
    const parsed = values.filter((value) => parseDate(value, format) !== null).length;
    if (values.length > 0 && parsed / values.length > 0.8) return format;
  }
  return 'YYYY-MM-DD';
}

function parseFlexibleDate(value: string): string | null {
  for (const format of DATE_FORMATS) {
    const date = parseDate(value, format);
    if (date) return date;
  }
  return null;
}

const absolute = (value: string) => (value.startsWith('-') ? value.slice(1) : value);

/** Trims a decimal string to the 5 fraction digits the units scale stores. */
function trimUnits(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(5, '0').slice(0, 5)}`;
}

/** units × price as a 4-decimal money string, without going through floats. */
function multiply(units: string, price: string): string {
  const scale = (value: string, digits: number) => {
    const [whole, fraction = ''] = absolute(value).split('.');
    return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0').slice(0, digits));
  };
  const product = scale(units, 5) * scale(price, 4);
  const money = (product * 2n + 100000n) / 200000n;
  return `${money / 10000n}.${(money % 10000n).toString().padStart(4, '0')}`;
}

/** Stable duplicate key. Same statement, same row, same ref — whatever order it is uploaded in. */
function reference(parts: (string | null)[]): string {
  return parts.map((part) => (part ?? '').toString().trim().toUpperCase().replace(/\s+/g, ' ')).join('|').slice(0, 400);
}
