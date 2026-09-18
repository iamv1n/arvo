import { DomainError } from '../errors';
import { formatMoney, parseMoney } from '../money';
import type { FinanceStore } from '../ports';
import { requireText } from '../services/validation';
import { estimateCharges, mergeCharges } from './charges';
import type {
  ChargeBreakdown,
  NewTrade,
  NewTradeImportRow,
  ParsedTradeRow,
  TradeImportBatchRecord,
  TradeImportRowRecord,
  TradeImportSource,
  TradingSettingsRecord,
} from './types';

/*
 * Trade imports: upload → parse → review → commit.
 *
 * The same contract as the bank-statement and portfolio pipelines, for the same reason —
 * nothing reaches the ledger until the user has looked at it. Every parsed fill carries an
 * externalRef derived from the broker, the contract, the timestamp and the price, so the same
 * tradebook can be uploaded twice, or a monthly file can overlap a quarterly one, without
 * doubling anybody's turnover.
 *
 * Charges are settled at commit time rather than at parse time: brokerage is capped per order
 * and DP charges are per scrip per day, so both need the whole committed batch in hand.
 * Whatever the file stated is kept and the rest is estimated, and each trade records which of
 * the two it is.
 */

export const MAX_TRADE_IMPORT_BYTES = 15 * 1024 * 1024;

export interface TradeStatementParser {
  /** Source from the file's content and name, or null when nothing matches. */
  detectSource(filename: string, bytes: Uint8Array): Promise<TradeImportSource | null>;
  /** Tradebook or P&L CSV/XLSX from any of the supported brokers, or a generic layout. */
  parseTradeCsv(bytes: Uint8Array, filename: string): Promise<{ rows: ParsedTradeRow[]; warnings: string[]; profile: string; broker: string }>;
  /** A text-based contract note PDF. Best effort: scanned notes are refused, not guessed at. */
  parseContractNote(bytes: Uint8Array): Promise<{ rows: ParsedTradeRow[]; warnings: string[]; broker: string }>;
}

export interface TradeImportDependencies {
  parser: TradeStatementParser;
}

export interface TradeImportSummary {
  batch: TradeImportBatchRecord;
  counts: { total: number; new: number; duplicate: number; error: number; committed: number; skipped: number };
  rows: TradeImportRowRecord[];
}

export interface UploadTradeImportInput {
  filename: string;
  bytes: Uint8Array;
  /** Overrides detection when the user picks the file type. */
  source?: TradeImportSource;
  /** Overrides the broker the parser guessed from the layout. */
  broker?: string;
}

export class TradeImportService {
  constructor(
    private readonly store: FinanceStore,
    private readonly deps: TradeImportDependencies,
  ) {}

  async list(userId: string): Promise<TradeImportBatchRecord[]> {
    return this.store.tradeImports.listBatches(userId);
  }

  async upload(userId: string, input: UploadTradeImportInput): Promise<TradeImportSummary> {
    const filename = requireText('filename', input.filename, 255);
    if (input.bytes.byteLength === 0) throw DomainError.validation('EMPTY_FILE', 'The file is empty');
    if (input.bytes.byteLength > MAX_TRADE_IMPORT_BYTES) throw DomainError.validation('FILE_TOO_LARGE', 'The file is larger than 15 MB');

    const source = input.source ?? (await this.deps.parser.detectSource(filename, input.bytes));
    if (!source) {
      throw DomainError.validation(
        'UNSUPPORTED_FILE',
        'This file was not recognised. Upload a tradebook or P&L CSV from Zerodha, Upstox, Groww, Angel One, Dhan or Fyers, or a text contract note PDF.',
      );
    }

    const batch = await this.store.tradeImports.createBatch({
      userId,
      filename,
      source,
      profile: 'unknown',
      broker: input.broker ?? 'Unknown',
      status: 'PENDING',
      warnings: [],
      error: null,
    });

    try {
      const parsed =
        source === 'CONTRACT_NOTE_PDF'
          ? { ...(await this.deps.parser.parseContractNote(input.bytes)), profile: 'contract-note' }
          : await this.deps.parser.parseTradeCsv(input.bytes, filename);
      const broker = input.broker ?? parsed.broker;
      const rows = parsed.rows.map((row) => ({ ...row, broker }));

      if (rows.length === 0) {
        await this.store.tradeImports.updateBatch(userId, batch.id, {
          status: 'FAILED',
          error: 'No trades were found in the file.',
          profile: parsed.profile,
          broker,
        });
        throw DomainError.validation('NO_ROWS', 'No trades were found in the file');
      }

      const existing = new Set(await this.store.trades.findExistingRefs(userId, rows.map((row) => row.externalRef)));
      const seen = new Set<string>();
      const toInsert: NewTradeImportRow[] = rows.map((row, index) => {
        const duplicate = existing.has(row.externalRef) || seen.has(row.externalRef);
        seen.add(row.externalRef);
        return {
          userId,
          batchId: batch.id,
          rowNumber: index + 1,
          status: duplicate ? ('DUPLICATE' as const) : ('NEW' as const),
          message: duplicate ? 'This fill is already in your journal.' : null,
          parsed: row,
        };
      });
      await this.store.tradeImports.insertRows(toInsert);
      await this.store.tradeImports.updateBatch(userId, batch.id, {
        status: 'READY',
        warnings: parsed.warnings.slice(0, 50),
        profile: parsed.profile,
        broker,
      });
      return this.summary(userId, batch.id);
    } catch (error) {
      const message = error instanceof DomainError ? error.message : 'The file could not be read';
      await this.store.tradeImports.updateBatch(userId, batch.id, { status: 'FAILED', error: message });
      throw error;
    }
  }

  async summary(userId: string, batchId: string): Promise<TradeImportSummary> {
    const batch = await this.requireBatch(userId, batchId);
    const rows = await this.store.tradeImports.findRows(userId, batchId);
    return { batch, rows, counts: countRows(rows) };
  }

  /** Marks a row as skipped, or puts a skipped row back in. */
  async decideRow(userId: string, batchId: string, rowId: string, include: boolean): Promise<TradeImportSummary> {
    const batch = await this.requireBatch(userId, batchId);
    if (batch.status === 'COMMITTED') throw DomainError.conflict('BATCH_COMMITTED', 'This import has already been committed');
    const rows = await this.store.tradeImports.findRows(userId, batchId);
    const row = rows.find((r) => r.id === rowId);
    if (!row) throw DomainError.notFound('IMPORT_ROW_NOT_FOUND', 'That row does not exist');
    if (row.status === 'ERROR' && include) throw DomainError.validation('ROW_HAS_ERROR', 'That row could not be read, so it cannot be imported');
    await this.store.tradeImports.updateRow(userId, rowId, {
      status: include ? 'NEW' : 'SKIPPED',
      message: include ? null : 'Skipped by you.',
    });
    return this.summary(userId, batchId);
  }

  /** Writes every row still marked NEW into the journal, with charges settled per order. */
  async commit(userId: string, batchId: string): Promise<TradeImportSummary> {
    const batch = await this.requireBatch(userId, batchId);
    if (batch.status === 'COMMITTED') throw DomainError.conflict('BATCH_COMMITTED', 'This import has already been committed');
    if (batch.status !== 'READY') throw DomainError.conflict('BATCH_NOT_READY', 'This import is not ready to commit');

    const rows = await this.store.tradeImports.findRows(userId, batchId);
    const pending = rows.filter((row) => row.status === 'NEW');
    if (pending.length === 0) throw DomainError.validation('NOTHING_TO_COMMIT', 'Every row is a duplicate, skipped or in error');

    const settings = await this.store.tradingSettings.find(userId);
    const drafts = pending.map((row) => ({ row, trade: toTrade(userId, row.parsed) }));
    // Estimate against a synthetic id per row so brokerage is grouped by order, then merge in
    // whatever the file itself stated.
    const estimates = estimateCharges(
      drafts.map(({ row, trade }) => ({ ...trade, id: row.id, kind: trade.kind })),
      settings,
    );
    const inputs: NewTrade[] = drafts.map(({ row, trade }) => {
      const charges = mergeCharges(estimates.get(row.id)!, row.parsed.reportedCharges);
      return { ...trade, ...applyCharges(charges) };
    });

    await this.store.transaction(async (repos) => {
      await repos.trades.createMany(inputs);
      for (const row of pending) await repos.tradeImports.updateRow(userId, row.id, { status: 'COMMITTED', message: null });
      await repos.tradeImports.updateBatch(userId, batchId, { status: 'COMMITTED' });
    });
    return this.summary(userId, batchId);
  }

  async delete(userId: string, batchId: string): Promise<void> {
    await this.requireBatch(userId, batchId);
    await this.store.tradeImports.deleteBatch(userId, batchId);
  }

  private async requireBatch(userId: string, batchId: string): Promise<TradeImportBatchRecord> {
    const batch = await this.store.tradeImports.findBatch(userId, batchId);
    if (!batch) throw DomainError.notFound('IMPORT_BATCH_NOT_FOUND', 'That import does not exist');
    return batch;
  }
}

function countRows(rows: TradeImportRowRecord[]): TradeImportSummary['counts'] {
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return {
    total: rows.length,
    new: count('NEW'),
    duplicate: count('DUPLICATE'),
    error: count('ERROR'),
    committed: count('COMMITTED'),
    skipped: count('SKIPPED'),
  };
}

function toTrade(userId: string, parsed: ParsedTradeRow): NewTrade {
  const quantity = BigInt(parsed.quantity);
  return {
    userId,
    date: parsed.date,
    time: parsed.time,
    broker: parsed.broker,
    exchange: parsed.exchange,
    segment: parsed.segment,
    kind: 'TRADE',
    symbol: parsed.symbol,
    underlying: parsed.underlying,
    isin: parsed.isin,
    expiry: parsed.expiry,
    strike: parsed.strike,
    right: parsed.right,
    lotSize: parsed.lotSize,
    side: parsed.side,
    quantity: parsed.quantity,
    price: parsed.price,
    amount: parsed.amount || formatMoney(quantity * parseMoney(parsed.price)),
    brokerage: '0',
    stt: '0',
    exchangeCharges: '0',
    sebiCharges: '0',
    stampDuty: '0',
    gst: '0',
    dpCharges: '0',
    otherCharges: '0',
    totalCharges: '0',
    chargesSource: 'ESTIMATED',
    orderId: parsed.orderId,
    tradeRef: parsed.tradeRef,
    notes: null,
    externalRef: parsed.externalRef,
    isPaper: false,
    paperAccountId: null,
  };
}

const applyCharges = (charges: ChargeBreakdown) => ({
  brokerage: charges.brokerage,
  stt: charges.stt,
  exchangeCharges: charges.exchangeCharges,
  sebiCharges: charges.sebiCharges,
  stampDuty: charges.stampDuty,
  gst: charges.gst,
  dpCharges: charges.dpCharges,
  otherCharges: charges.otherCharges,
  totalCharges: charges.total,
  chargesSource: charges.source,
});

export type { TradingSettingsRecord };
