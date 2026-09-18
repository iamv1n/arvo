import { DomainError } from '../errors';
import type { FinanceStore } from '../ports';
import { requireDate, requireText } from '../services/validation';
import { normalizeTransaction } from './holding.service';
import { DEFAULT_ASSET_CLASS } from './types';
import type {
  HoldingRecord,
  NewPortfolioImportRow,
  ParsedPortfolioRow,
  PortfolioImportBatchRecord,
  PortfolioImportRowRecord,
  PortfolioImportSource,
} from './types';

/*
 * Portfolio statement imports.
 *
 * Same shape as the bank-statement pipeline: upload → parse → review → commit. Nothing
 * reaches the holdings ledger until the user commits, and every parsed row carries an
 * externalRef so the same statement can be uploaded twice without creating duplicates.
 *
 * Reference files (NAV lists, index series, fund disclosures) have nothing to review: they
 * replace reference data rather than adding to the ledger, so they are applied on upload and
 * the batch is marked committed straight away.
 */

export const MAX_PORTFOLIO_IMPORT_BYTES = 15 * 1024 * 1024;

export interface ParsedNavRow {
  schemeCode: string;
  name: string;
  isin: string | null;
  price: string;
  date: string;
}

export interface PortfolioStatementParser {
  /** Source from the file's content and name, or null when nothing matches. */
  detectSource(filename: string, bytes: Uint8Array): Promise<PortfolioImportSource | null>;
  /** CAMS/KFintech consolidated account statement (text PDF only). */
  parseCas(bytes: Uint8Array): Promise<{ rows: ParsedPortfolioRow[]; warnings: string[] }>;
  /** Broker holdings or tradebook CSV (Zerodha, Groww, Upstox, Angel One). */
  parseBrokerCsv(bytes: Uint8Array, filename: string): Promise<{ rows: ParsedPortfolioRow[]; warnings: string[]; profile: string }>;
  /** AMFI NAVAll.txt. */
  parseAmfiNav(bytes: Uint8Array): Promise<{ rows: ParsedNavRow[]; warnings: string[] }>;
  /** Index series CSV: date, close. */
  parseBenchmarkCsv(bytes: Uint8Array, filename: string): Promise<{ series: string; points: { date: string; value: string }[]; warnings: string[] }>;
  /** A fund's portfolio disclosure CSV: instrument, ISIN, % of net assets. */
  parseFundDisclosureCsv(bytes: Uint8Array): Promise<{ rows: { name: string; isin: string | null; weight: string }[]; asOf: string | null; warnings: string[] }>;
}

export interface PortfolioImportDependencies {
  parser: PortfolioStatementParser;
}

export interface PortfolioImportSummary {
  batch: PortfolioImportBatchRecord;
  counts: { total: number; new: number; duplicate: number; error: number; committed: number; skipped: number };
  rows: PortfolioImportRowRecord[];
  /** Filled for reference imports, which have no rows to review. */
  applied: number;
}

export interface UploadPortfolioImportInput {
  filename: string;
  bytes: Uint8Array;
  /** Overrides detection when the user picks the file type themselves. */
  source?: PortfolioImportSource;
  /** Required for a fund disclosure: which holding it describes. */
  holdingId?: string;
  /** Overrides the series name a benchmark file was detected with. */
  series?: string;
}

export class PortfolioImportService {
  constructor(
    private readonly store: FinanceStore,
    private readonly deps: PortfolioImportDependencies,
  ) {}

  async list(userId: string): Promise<PortfolioImportBatchRecord[]> {
    return this.store.portfolioImports.listBatches(userId);
  }

  async upload(userId: string, input: UploadPortfolioImportInput): Promise<PortfolioImportSummary> {
    const filename = requireText('filename', input.filename, 255);
    if (input.bytes.byteLength === 0) throw DomainError.validation('EMPTY_FILE', 'The file is empty');
    if (input.bytes.byteLength > MAX_PORTFOLIO_IMPORT_BYTES) {
      throw DomainError.validation('FILE_TOO_LARGE', 'The file is larger than 15 MB');
    }
    const source = input.source ?? (await this.deps.parser.detectSource(filename, input.bytes));
    if (!source) {
      throw DomainError.validation(
        'UNSUPPORTED_FILE',
        'This file was not recognised. Upload a CAMS/KFintech CAS PDF, a broker holdings or tradebook CSV, an AMFI NAV file or an index CSV.',
      );
    }

    const batch = await this.store.portfolioImports.createBatch({
      userId,
      filename,
      source,
      status: 'PENDING',
      warnings: [],
      error: null,
    });

    try {
      if (source === 'AMFI_NAV') return await this.applyNav(userId, batch, input.bytes);
      if (source === 'BENCHMARK_CSV') return await this.applyBenchmark(userId, batch, input.bytes, filename, input.series);
      if (source === 'FUND_DISCLOSURE_CSV') return await this.applyDisclosure(userId, batch, input.bytes, input.holdingId);
      return await this.parseTransactions(userId, batch, input.bytes, filename, source);
    } catch (error) {
      const message = error instanceof DomainError ? error.message : 'The file could not be read';
      await this.store.portfolioImports.updateBatch(userId, batch.id, { status: 'FAILED', error: message });
      throw error;
    }
  }

  async summary(userId: string, batchId: string): Promise<PortfolioImportSummary> {
    const batch = await this.requireBatch(userId, batchId);
    const rows = await this.store.portfolioImports.findRows(userId, batchId);
    return { batch, counts: countRows(rows), rows, applied: 0 };
  }

  /** Review: a row can be skipped, brought back, or pointed at a specific holding. */
  async setRowDecision(
    userId: string,
    batchId: string,
    rowId: string,
    decision: { status: 'NEW' | 'SKIPPED'; holdingId?: string | null },
  ): Promise<PortfolioImportRowRecord> {
    await this.requireBatch(userId, batchId);
    const rows = await this.store.portfolioImports.findRows(userId, batchId);
    const row = rows.find((r) => r.id === rowId);
    if (!row) throw DomainError.notFound('IMPORT_ROW_NOT_FOUND', 'Import row not found');
    if (row.status === 'COMMITTED') throw DomainError.conflict('ROW_ALREADY_COMMITTED', 'This row is already in your holdings');
    if (decision.holdingId) {
      const holding = await this.store.holdings.findById(userId, decision.holdingId);
      if (!holding) throw DomainError.notFound('HOLDING_NOT_FOUND', 'Holding not found');
    }
    return this.store.portfolioImports.updateRow(userId, rowId, {
      status: decision.status,
      holdingId: decision.holdingId === undefined ? row.holdingId : decision.holdingId,
      message: null,
    });
  }

  /**
   * Writes every NEW row into the holdings ledger, creating the holdings a statement mentions
   * for the first time. Duplicates, errors and skipped rows are left alone.
   */
  async commit(userId: string, batchId: string): Promise<PortfolioImportSummary> {
    const batch = await this.requireBatch(userId, batchId);
    if (batch.status === 'COMMITTED') throw DomainError.conflict('BATCH_ALREADY_COMMITTED', 'This import is already committed');
    const rows = await this.store.portfolioImports.findRows(userId, batchId);
    const pending = rows.filter((r) => r.status === 'NEW');
    if (pending.length === 0) throw DomainError.validation('NOTHING_TO_COMMIT', 'No rows are waiting to be imported');

    await this.store.transaction(async (repos) => {
      const cache = new Map<string, HoldingRecord>();
      for (const row of pending) {
        const holding = row.holdingId
          ? await repos.holdings.findById(userId, row.holdingId)
          : await resolveHolding(repos, userId, row.parsed, cache);
        if (!holding) throw DomainError.notFound('HOLDING_NOT_FOUND', 'Holding not found');
        const normalized = normalizeTransaction(holding, {
          date: row.parsed.date,
          type: row.parsed.type,
          units: row.parsed.units,
          price: row.parsed.price,
          amount: row.parsed.amount,
          charges: row.parsed.charges,
          note: row.parsed.note,
          externalRef: row.parsed.externalRef,
        });
        await repos.holdingTransactions.create({ userId, holdingId: holding.id, ...normalized });
        await repos.portfolioImports.updateRow(userId, row.id, { status: 'COMMITTED', holdingId: holding.id, message: null });
      }
      await repos.portfolioImports.updateBatch(userId, batchId, { status: 'COMMITTED' });
    });

    return this.summary(userId, batchId);
  }

  async delete(userId: string, batchId: string): Promise<void> {
    await this.requireBatch(userId, batchId);
    await this.store.portfolioImports.deleteBatch(userId, batchId);
  }

  private async requireBatch(userId: string, batchId: string): Promise<PortfolioImportBatchRecord> {
    const batch = await this.store.portfolioImports.findBatch(userId, batchId);
    if (!batch) throw DomainError.notFound('IMPORT_BATCH_NOT_FOUND', 'Import not found');
    return batch;
  }

  private async parseTransactions(
    userId: string,
    batch: PortfolioImportBatchRecord,
    bytes: Uint8Array,
    filename: string,
    source: PortfolioImportSource,
  ): Promise<PortfolioImportSummary> {
    const parsed =
      source === 'CAS_PDF' ? await this.deps.parser.parseCas(bytes) : await this.deps.parser.parseBrokerCsv(bytes, filename);
    if (parsed.rows.length === 0) {
      throw DomainError.validation('NO_TRANSACTIONS_FOUND', 'No transactions were found in this file');
    }

    const refs = parsed.rows.map((r) => r.externalRef);
    const existing = new Set(await this.store.holdingTransactions.findExistingRefs(userId, refs));
    const seen = new Set<string>();
    const holdings = await this.store.holdings.findAll(userId);

    const rows: NewPortfolioImportRow[] = parsed.rows.map((parsedRow, index) => {
      const duplicate = existing.has(parsedRow.externalRef) || seen.has(parsedRow.externalRef);
      seen.add(parsedRow.externalRef);
      const match = matchHolding(holdings, parsedRow);
      return {
        userId,
        batchId: batch.id,
        rowNumber: index + 1,
        status: duplicate ? 'DUPLICATE' : 'NEW',
        message: duplicate ? 'Already imported from an earlier statement' : null,
        holdingId: match?.id ?? null,
        parsed: parsedRow,
      };
    });

    await this.store.portfolioImports.insertRows(rows);
    const updated = await this.store.portfolioImports.updateBatch(userId, batch.id, { status: 'READY', warnings: parsed.warnings });
    const saved = await this.store.portfolioImports.findRows(userId, batch.id);
    return { batch: updated, counts: countRows(saved), rows: saved, applied: 0 };
  }

  private async applyNav(userId: string, batch: PortfolioImportBatchRecord, bytes: Uint8Array): Promise<PortfolioImportSummary> {
    const { rows, warnings } = await this.deps.parser.parseAmfiNav(bytes);
    const applied = await this.store.holdings.setPricesBySchemeCode(
      userId,
      rows.map((r) => ({ schemeCode: r.schemeCode, price: r.price, date: r.date })),
    );
    const updated = await this.store.portfolioImports.updateBatch(userId, batch.id, {
      status: 'COMMITTED',
      warnings: [...warnings, `${rows.length} NAVs read, ${applied} holdings updated`],
    });
    return { batch: updated, counts: countRows([]), rows: [], applied };
  }

  private async applyBenchmark(
    userId: string,
    batch: PortfolioImportBatchRecord,
    bytes: Uint8Array,
    filename: string,
    seriesOverride?: string,
  ): Promise<PortfolioImportSummary> {
    const parsed = await this.deps.parser.parseBenchmarkCsv(bytes, filename);
    const series = requireText('series', seriesOverride ?? parsed.series, 80).toUpperCase();
    if (parsed.points.length === 0) throw DomainError.validation('NO_POINTS_FOUND', 'No index levels were found in this file');
    const applied = await this.store.portfolioData.replaceBenchmark(userId, series, parsed.points);
    const updated = await this.store.portfolioImports.updateBatch(userId, batch.id, {
      status: 'COMMITTED',
      warnings: [...parsed.warnings, `${applied} levels stored for ${series}`],
    });
    return { batch: updated, counts: countRows([]), rows: [], applied };
  }

  private async applyDisclosure(
    userId: string,
    batch: PortfolioImportBatchRecord,
    bytes: Uint8Array,
    holdingId?: string,
  ): Promise<PortfolioImportSummary> {
    if (!holdingId) throw DomainError.validation('HOLDING_REQUIRED', 'Choose which fund this disclosure belongs to', { field: 'holdingId' });
    const holding = await this.store.holdings.findById(userId, holdingId);
    if (!holding) throw DomainError.notFound('HOLDING_NOT_FOUND', 'Holding not found');
    const parsed = await this.deps.parser.parseFundDisclosureCsv(bytes);
    if (parsed.rows.length === 0) throw DomainError.validation('NO_ROWS_FOUND', 'No portfolio lines were found in this file');
    const asOf = parsed.asOf ? requireDate('asOf', parsed.asOf) : new Date().toISOString().slice(0, 10);
    const applied = await this.store.portfolioData.replaceFundHoldings(
      userId,
      holdingId,
      parsed.rows.map((r) => ({ userId, holdingId, name: r.name, isin: r.isin, weight: r.weight, asOf })),
    );
    const updated = await this.store.portfolioImports.updateBatch(userId, batch.id, {
      status: 'COMMITTED',
      warnings: [...parsed.warnings, `${applied} lines stored for ${holding.name}`],
    });
    return { batch: updated, counts: countRows([]), rows: [], applied };
  }
}

/** Finds the holding a parsed row belongs to: ISIN, then scheme code, then symbol+folio, then name. */
export function matchHolding(holdings: HoldingRecord[], row: ParsedPortfolioRow): HoldingRecord | undefined {
  const byFolio = (h: HoldingRecord) => !row.folio || !h.folio || h.folio.replace(/\s/g, '') === row.folio.replace(/\s/g, '');
  return (
    (row.isin ? holdings.find((h) => h.isin === row.isin && byFolio(h)) : undefined) ??
    (row.schemeCode ? holdings.find((h) => h.schemeCode === row.schemeCode && byFolio(h)) : undefined) ??
    (row.symbol ? holdings.find((h) => h.symbol === row.symbol) : undefined) ??
    holdings.find((h) => h.name.toLowerCase() === row.instrumentName.toLowerCase() && byFolio(h))
  );
}

async function resolveHolding(
  repos: { holdings: FinanceStore['holdings'] },
  userId: string,
  row: ParsedPortfolioRow,
  cache: Map<string, HoldingRecord>,
): Promise<HoldingRecord> {
  const key = [row.isin, row.schemeCode, row.symbol, row.folio, row.instrumentName].join('|');
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = await repos.holdings.findByIdentity(userId, {
    isin: row.isin,
    schemeCode: row.schemeCode,
    symbol: row.symbol,
    folio: row.folio,
    name: row.instrumentName,
  });
  const holding =
    existing ??
    (await repos.holdings.create({
      userId,
      name: row.instrumentName.slice(0, 160),
      kind: row.kind,
      assetClass: DEFAULT_ASSET_CLASS[row.kind],
      currency: 'INR',
      isin: row.isin,
      schemeCode: row.schemeCode,
      symbol: row.symbol,
      folio: row.folio,
      amc: row.amc,
      sector: null,
      marketCap: null,
      plan: /\bdirect\b/i.test(row.instrumentName) ? 'DIRECT' : /\bregular\b/i.test(row.instrumentName) ? 'REGULAR' : null,
      expenseRatio: null,
      directExpenseRatio: null,
      exitLoadDays: null,
      exitLoadPercent: null,
      lockInMonths: /\belss\b|tax saver|tax saving/i.test(row.instrumentName) ? 36 : null,
      latestPrice: null,
      latestPriceDate: null,
      goalId: null,
      notes: null,
      isActive: true,
    }));
  cache.set(key, holding);
  return holding;
}

function countRows(rows: PortfolioImportRowRecord[]) {
  const count = (status: PortfolioImportRowRecord['status']) => rows.filter((r) => r.status === status).length;
  return {
    total: rows.length,
    new: count('NEW'),
    duplicate: count('DUPLICATE'),
    error: count('ERROR'),
    committed: count('COMMITTED'),
    skipped: count('SKIPPED'),
  };
}
