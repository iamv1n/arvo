/*
 * Historical price bars.
 *
 * The lab never reaches the network. Everything it replays is a file the user exported from
 * their own broker or data vendor and uploaded here, which is also why the import keeps the
 * source filename against the series: six months later, "where did these bars come from?" is
 * the first question anyone asks of a backtest.
 *
 * Bars are stored as exact decimal strings like the rest of the ledger and converted to
 * doubles once, at the edge of the engine. Indicators are floating-point by nature — an EMA
 * has no exact decimal representation — so pretending otherwise inside the loop would cost
 * speed and buy nothing.
 */

export type BarTimeframe = 'DAY' | 'MINUTE';

export const BAR_TIMEFRAMES: BarTimeframe[] = ['DAY', 'MINUTE'];

/** A bar as the engine reads it: doubles, session date separated from time of day. */
export interface Bar {
  /** Session date, YYYY-MM-DD. */
  date: string;
  /** Time of day HH:MM for intraday bars; null on daily bars. */
  time: string | null;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A bar as it is stored. */
export interface BarRecord {
  id: string;
  userId: string;
  symbol: string;
  timeframe: BarTimeframe;
  date: string;
  time: string | null;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  createdAt: Date;
}

export type NewBar = Omit<BarRecord, 'id' | 'createdAt'>;

/** What the picker shows: one line per series the user has imported. */
export interface BarSeriesSummary {
  symbol: string;
  timeframe: BarTimeframe;
  bars: number;
  from: string;
  to: string;
}

export interface BarFilter {
  from?: string;
  to?: string;
  /** Hard cap on rows returned; the engine always passes one. */
  limit?: number;
}

export interface MarketBarRepository {
  /** One row per (symbol, timeframe) the user has data for. */
  listSeries(userId: string): Promise<BarSeriesSummary[]>;
  /** Bars in chronological order: date, then time, then id. */
  find(userId: string, symbol: string, timeframe: BarTimeframe, filter?: BarFilter): Promise<BarRecord[]>;
  count(userId: string, symbol: string, timeframe: BarTimeframe): Promise<number>;
  /** Inserts, ignoring any bar whose (symbol, timeframe, date, time) is already stored. */
  insertMany(rows: NewBar[]): Promise<number>;
  deleteSeries(userId: string, symbol: string, timeframe: BarTimeframe): Promise<void>;
}

/** Converts a stored bar to the engine's view of it. */
export const toBar = (row: BarRecord): Bar => ({
  date: row.date,
  time: row.time,
  open: Number(row.open),
  high: Number(row.high),
  low: Number(row.low),
  close: Number(row.close),
  volume: Number(row.volume),
});

/** Sort key that puts a day's bars in order and daily bars (no time) first within their day. */
export const barOrder = (a: Bar, b: Bar): number =>
  a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date);

// ---- imports ----

export type BarImportStatus = 'READY' | 'COMMITTED' | 'FAILED';

/**
 * An uploaded OHLCV file waiting to be reviewed.
 *
 * Unlike the tradebook import, the parsed rows live on the batch as one JSON blob rather than
 * in a row table. A price file is thousands of near-identical rows that nobody reviews one by
 * one — what a user actually checks is the symbol, the date range, the bar count and a sample —
 * so a row table would be a large amount of storage and query surface for a screen nobody
 * opens. The upload is still parsed, validated and held for an explicit commit.
 */
export interface BarImportBatchRecord {
  id: string;
  userId: string;
  filename: string;
  symbol: string;
  timeframe: BarTimeframe;
  status: BarImportStatus;
  /** Rows that parsed cleanly. */
  rowCount: number;
  /** Rows that were dropped, with the reason. */
  warnings: string[];
  error: string | null;
  from: string | null;
  to: string | null;
  /** The parsed bars, held until commit. Empty once committed. */
  parsed: Bar[];
  createdAt: Date;
  updatedAt: Date;
}

export type NewBarImportBatch = Omit<BarImportBatchRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type BarImportBatchPatch = Partial<Pick<BarImportBatchRecord, 'status' | 'warnings' | 'error' | 'parsed' | 'rowCount' | 'from' | 'to'>>;

export interface BarImportRepository {
  list(userId: string): Promise<BarImportBatchRecord[]>;
  find(userId: string, id: string): Promise<BarImportBatchRecord | null>;
  create(input: NewBarImportBatch): Promise<BarImportBatchRecord>;
  update(userId: string, id: string, patch: BarImportBatchPatch): Promise<BarImportBatchRecord>;
  delete(userId: string, id: string): Promise<void>;
}

/** The most bars one upload may carry. Roughly a year of one-minute bars. */
export const MAX_IMPORT_BARS = 120_000;
/** The most bytes an OHLCV upload may be. */
export const MAX_BAR_IMPORT_BYTES = 25 * 1024 * 1024;
