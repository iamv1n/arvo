import { randomUUID } from 'node:crypto';
import { CategoryType } from '@arvo/types';
import type { ColumnMapping, ImportBatchRecord, ImportErrorRecord, ImportRowRecord } from '../imports/types';
import { parseMoney, formatMoney } from '../money';
import { descriptionPatternKey } from '../rules/categorizer';
import type { RuleRecord } from '../rules/types';
import type { BudgetRecord, GoalRecord, RecurringSeriesRecord, ScenarioRecord } from '../records';
import type {
  BenchmarkPointRecord,
  FundHoldingRecord,
  HoldingRecord,
  HoldingTransactionRecord,
  PortfolioImportBatchRecord,
  PortfolioImportRowRecord,
} from '../portfolio/types';
import type { FinanceStore, Repositories } from '../ports';
import type { BarImportBatchRecord, BarRecord } from '../lab/bars';
import type { BacktestRecord, PaperAccountRecord, PaperOrderRecord, StrategyRecord } from '../lab/lab-records';
import { DEFAULT_TRADING_SETTINGS } from '../trading/types';
import type {
  JournalEntryRecord,
  TradeImportBatchRecord,
  TradeImportRowRecord,
  TradeRecord,
  TradingSettingsRecord,
} from '../trading/types';
import type {
  AccountRecord,
  CategoryRecord,
  MerchantRecord,
  TransactionAggregate,
  TransactionRecord,
  TransferRecord,
} from '../records';

interface State {
  accounts: Map<string, AccountRecord>;
  categories: Map<string, CategoryRecord>;
  merchants: Map<string, MerchantRecord>;
  transactions: Map<string, TransactionRecord>;
  transfers: Map<string, TransferRecord>;
  batches: Map<string, ImportBatchRecord>;
  rows: Map<string, ImportRowRecord>;
  errors: ImportErrorRecord[];
  mappings: Map<string, ColumnMapping>;
  rules: Map<string, RuleRecord>;
  recurring: Map<string, RecurringSeriesRecord>;
  budgets: Map<string, BudgetRecord>;
  goals: Map<string, GoalRecord>;
  scenarios: Map<string, ScenarioRecord>;
  holdings: Map<string, HoldingRecord>;
  holdingTransactions: Map<string, HoldingTransactionRecord>;
  benchmarkPoints: BenchmarkPointRecord[];
  fundHoldings: Map<string, FundHoldingRecord>;
  portfolioBatches: Map<string, PortfolioImportBatchRecord>;
  portfolioRows: Map<string, PortfolioImportRowRecord>;
  trades: Map<string, TradeRecord>;
  journal: Map<string, JournalEntryRecord>;
  tradingSettings: Map<string, TradingSettingsRecord>;
  tradeBatches: Map<string, TradeImportBatchRecord>;
  tradeRows: Map<string, TradeImportRowRecord>;
  bars: Map<string, BarRecord>;
  barImports: Map<string, BarImportBatchRecord>;
  labStrategies: Map<string, StrategyRecord>;
  labBacktests: Map<string, BacktestRecord>;
  paperAccounts: Map<string, PaperAccountRecord>;
  paperOrders: Map<string, PaperOrderRecord>;
}

const now = () => new Date('2026-01-01T00:00:00Z');

/**
 * In-memory FinanceStore for tests (also used by other packages via @arvo/finance-core/testing).
 * transaction() restores a snapshot if the work throws.
 */
export class InMemoryStore implements FinanceStore {
  private state: State = {
    accounts: new Map(),
    categories: new Map(),
    merchants: new Map(),
    transactions: new Map(),
    transfers: new Map(),
    batches: new Map(),
    rows: new Map(),
    errors: [],
    mappings: new Map(),
    rules: new Map(),
    recurring: new Map(),
    bars: new Map(),
    barImports: new Map(),
    labStrategies: new Map(),
    labBacktests: new Map(),
    paperAccounts: new Map(),
    paperOrders: new Map(),
    budgets: new Map(),
    goals: new Map(),
    scenarios: new Map(),
    holdings: new Map(),
    holdingTransactions: new Map(),
    benchmarkPoints: [],
    fundHoldings: new Map(),
    portfolioBatches: new Map(),
    portfolioRows: new Map(),
    trades: new Map(),
    journal: new Map(),
    tradingSettings: new Map(),
    tradeBatches: new Map(),
    tradeRows: new Map(),
  };

  accounts: Repositories['accounts'] = {
    findAll: async (userId) => [...this.state.accounts.values()].filter((a) => a.userId === userId),
    findById: async (userId, id) => owned(this.state.accounts.get(id), userId),
    create: async (input) => insert(this.state.accounts, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.accounts, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.accounts, userId, id),
  };

  categories: Repositories['categories'] = {
    findVisible: async (userId) =>
      [...this.state.categories.values()].filter((c) => c.userId === null || c.userId === userId),
    findVisibleById: async (userId, id) => {
      const category = this.state.categories.get(id);
      return category && (category.userId === null || category.userId === userId) ? category : null;
    },
    create: async (input) => insert(this.state.categories, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.categories, userId, id, patch),
    delete: async (userId, id) => {
      deleteOwned(this.state.categories, userId, id);
      for (const t of this.state.transactions.values()) if (t.categoryId === id) t.categoryId = null;
    },
  };

  merchants: Repositories['merchants'] = {
    findAll: async (userId) => [...this.state.merchants.values()].filter((m) => m.userId === userId),
    findPage: async (userId, { limit, offset, search }) => {
      const rows = [...this.state.merchants.values()]
        .filter((m) => m.userId === userId && (!search || m.name.toLowerCase().includes(search.toLowerCase())))
        .sort((a, b) => a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : 1));
      return { items: rows.slice(offset, offset + limit), total: rows.length };
    },
    findById: async (userId, id) => owned(this.state.merchants.get(id), userId),
    findByNormalizedName: async (userId, normalizedName) =>
      [...this.state.merchants.values()].find((m) => m.userId === userId && m.normalizedName === normalizedName) ?? null,
    create: async (input) => insert(this.state.merchants, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.merchants, userId, id, patch),
    delete: async (userId, id) => {
      deleteOwned(this.state.merchants, userId, id);
      for (const t of this.state.transactions.values()) if (t.merchantId === id) t.merchantId = null;
    },
  };

  transactions: Repositories['transactions'] = {
    findMany: async (userId, filter) => {
      const rows = [...this.state.transactions.values()]
        .filter((t) => t.userId === userId)
        .filter((t) => !filter.accountId || t.accountId === filter.accountId)
        .filter((t) => (filter.categoryId ? t.categoryId === filter.categoryId : !filter.uncategorized || t.categoryId === null))
        .filter((t) => (filter.merchantId ? t.merchantId === filter.merchantId : !filter.withoutMerchant || t.merchantId === null))
        .filter((t) => !filter.types?.length || filter.types.includes(t.type))
        .filter((t) => !filter.statuses?.length || filter.statuses.includes(t.status))
        .filter((t) => !filter.sources?.length || filter.sources.includes(t.source))
        .filter((t) => !filter.direction || (filter.direction === 'IN' ? parseMoney(t.amount) > 0n : parseMoney(t.amount) < 0n))
        .filter((t) => {
          const abs = parseMoney(t.amount) < 0n ? -parseMoney(t.amount) : parseMoney(t.amount);
          return (!filter.minAmount || abs >= parseMoney(filter.minAmount)) && (!filter.maxAmount || abs <= parseMoney(filter.maxAmount));
        })
        .filter((t) => !filter.from || t.date >= filter.from)
        .filter((t) => !filter.to || t.date <= filter.to)
        .filter((t) => !filter.search || t.description.toLowerCase().includes(filter.search.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date));
      return { items: rows.slice(filter.offset, filter.offset + filter.limit), total: rows.length };
    },
    findById: async (userId, id) => owned(this.state.transactions.get(id), userId),
    findByIds: async (userId, ids) =>
      ids.map((id) => owned(this.state.transactions.get(id), userId)).filter((t): t is TransactionRecord => !!t),
    create: async (input) =>
      insert(this.state.transactions, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.transactions, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.transactions, userId, id),
    sumAmountsByAccount: async (userId) => {
      const sums = new Map<string, bigint>();
      for (const t of this.state.transactions.values()) {
        if (t.userId !== userId) continue;
        sums.set(t.accountId, (sums.get(t.accountId) ?? 0n) + parseMoney(t.amount));
      }
      return new Map([...sums].map(([id, units]) => [id, formatMoney(units)]));
    },
    aggregate: async (userId, filter) => {
      const buckets = new Map<string, TransactionAggregate & { units: bigint }>();
      for (const t of this.state.transactions.values()) {
        if (t.userId !== userId || t.currency !== filter.currency) continue;
        if (t.date < filter.from || t.date > filter.to) continue;
        if (filter.accountId && t.accountId !== filter.accountId) continue;
        const units = parseMoney(t.amount);
        const direction = units > 0n ? 'IN' : 'OUT';
        const key = [t.date.slice(0, 7), t.type, t.categoryId, direction].join('|');
        const bucket = buckets.get(key) ?? {
          month: t.date.slice(0, 7), type: t.type, categoryId: t.categoryId, direction, total: '0', count: 0, units: 0n,
        };
        bucket.units += units;
        bucket.count += 1;
        buckets.set(key, bucket);
      }
      return [...buckets.values()].map(({ units, ...b }) => ({ ...b, total: formatMoney(units) }));
    },
    aggregateByMerchant: async (userId, filter) => {
      const buckets = new Map<string, { merchantId: string | null; type: TransactionRecord['type']; units: bigint; count: number }>();
      for (const t of this.inPeriod(userId, filter)) {
        const key = `${t.merchantId}|${t.type}`;
        const b = buckets.get(key) ?? { merchantId: t.merchantId, type: t.type, units: 0n, count: 0 };
        b.units += parseMoney(t.amount);
        b.count += 1;
        buckets.set(key, b);
      }
      return [...buckets.values()].map(({ units, ...b }) => ({ ...b, total: formatMoney(units) }));
    },
    findInPeriod: async (userId, filter) =>
      this.inPeriod(userId, filter)
        .filter((t) => filter.types.includes(t.type))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : 1)),
    findLargestOutflows: async (userId, filter, limit) =>
      this.inPeriod(userId, filter)
        .filter((t) => filter.types.includes(t.type) && parseMoney(t.amount) < 0n)
        .sort((a, b) => {
          const d = parseMoney(a.amount) - parseMoney(b.amount);
          return d !== 0n ? (d < 0n ? -1 : 1) : a.date.localeCompare(b.date);
        })
        .slice(0, limit),
    findByFingerprints: async (userId, accountId, fingerprints) =>
      [...this.state.transactions.values()]
        .filter((t) => t.userId === userId && t.accountId === accountId && fingerprints.includes(t.fingerprint))
        .map((t) => ({ id: t.id, fingerprint: t.fingerprint })),
    merchantCategoryStats: async (userId) => {
      const counts = new Map<string, number>();
      for (const t of this.state.transactions.values()) {
        if (t.userId !== userId || !t.merchantId || !t.categoryId) continue;
        const key = `${t.merchantId}|${t.categoryId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts].map(([key, count]) => {
        const [merchantId, categoryId] = key.split('|');
        return { merchantId, categoryId, count };
      });
    },
    descriptionCategoryStats: async (userId, keys) => {
      const counts = new Map<string, number>();
      for (const t of this.state.transactions.values()) {
        const key = descriptionPatternKey(t.description);
        if (t.userId !== userId || !t.categoryId || !keys.includes(key)) continue;
        counts.set(`${key}|${t.categoryId}`, (counts.get(`${key}|${t.categoryId}`) ?? 0) + 1);
      }
      return [...counts].map(([k, count]) => {
        const i = k.lastIndexOf('|');
        return { key: k.slice(0, i), categoryId: k.slice(i + 1), count };
      });
    },
    countByAccount: async (userId, accountId) =>
      [...this.state.transactions.values()].filter((t) => t.userId === userId && t.accountId === accountId).length,
  };

  transfers: Repositories['transfers'] = {
    findAll: async (userId) => [...this.state.transfers.values()].filter((t) => t.userId === userId),
    findPage: async (userId, { limit, offset }) => {
      const rows = [...this.state.transfers.values()].filter((t) => t.userId === userId).reverse();
      return { items: rows.slice(offset, offset + limit), total: rows.length };
    },
    findById: async (userId, id) => owned(this.state.transfers.get(id), userId),
    findByTransactionId: async (userId, transactionId) =>
      [...this.state.transfers.values()].find(
        (t) => t.userId === userId && (t.fromTransactionId === transactionId || t.toTransactionId === transactionId),
      ) ?? null,
    create: async (input) => insert(this.state.transfers, { ...input, id: randomUUID(), createdAt: now() }),
    delete: async (userId, id) => void deleteOwned(this.state.transfers, userId, id),
  };

  imports: Repositories['imports'] = {
    findBatches: async (userId, { limit, offset }) => {
      const rows = [...this.state.batches.values()].filter((b) => b.userId === userId).reverse();
      return { items: rows.slice(offset, offset + limit), total: rows.length };
    },
    findBatch: async (userId, id) => owned(this.state.batches.get(id), userId),
    findCompletedBatchByHash: async (userId, accountId, fileHash) =>
      [...this.state.batches.values()].find(
        (b) => b.userId === userId && b.accountId === accountId && b.fileHash === fileHash && b.status === 'COMPLETED',
      ) ?? null,
    createBatch: async (input) => insert(this.state.batches, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    updateBatch: async (userId, id, patch) => patchOwned(this.state.batches, userId, id, patch),
    deleteBatch: async (userId, id) => {
      deleteOwned(this.state.batches, userId, id);
      for (const row of [...this.state.rows.values()]) if (row.batchId === id) this.state.rows.delete(row.id);
    },
    findRows: async (userId, batchId, filter) => {
      const rows = this.batchRows(userId, batchId)
        .filter((r) => !filter.statuses?.length || filter.statuses.includes(r.status))
        .filter((r) => !filter.decisions?.length || filter.decisions.includes(r.decision));
      return { items: rows.slice(filter.offset, filter.offset + filter.limit), total: rows.length };
    },
    findAllRows: async (userId, batchId) => this.batchRows(userId, batchId),
    findRow: async (userId, batchId, rowId) => {
      const row = owned(this.state.rows.get(rowId), userId);
      return row && row.batchId === batchId ? row : null;
    },
    replaceRows: async (userId, batchId, rows) => {
      for (const row of this.batchRows(userId, batchId)) this.state.rows.delete(row.id);
      for (const row of rows) insert(this.state.rows, { ...row, id: randomUUID(), createdAt: now(), updatedAt: now() });
    },
    updateRow: async (userId, _batchId, rowId, patch) => patchOwned(this.state.rows, userId, rowId, patch),
    setDecisions: async (userId, batchId, where, decision) => {
      let changed = 0;
      for (const row of this.batchRows(userId, batchId)) {
        const match = where.rowIds?.length ? where.rowIds.includes(row.id) : where.statuses?.includes(row.status);
        if (!match || row.transactionId || (decision === 'ACCEPT' && row.status === 'INVALID')) continue;
        this.state.rows.set(row.id, { ...row, decision });
        changed++;
      }
      return changed;
    },
    countRows: async (userId, batchId) => {
      const counts = new Map<string, number>();
      for (const row of this.batchRows(userId, batchId)) {
        counts.set(`${row.status}|${row.decision}`, (counts.get(`${row.status}|${row.decision}`) ?? 0) + 1);
      }
      return [...counts].map(([k, count]) => {
        const [status, decision] = k.split('|');
        return { status: status as ImportRowRecord['status'], decision: decision as ImportRowRecord['decision'], count };
      });
    },
    replaceErrors: async (userId, batchId, errors) => {
      this.state.errors = this.state.errors.filter((e) => !(e.userId === userId && e.batchId === batchId));
      this.state.errors.push(...errors.map((e) => ({ ...e, id: randomUUID(), createdAt: now() })));
    },
    findErrors: async (userId, batchId) => this.state.errors.filter((e) => e.userId === userId && e.batchId === batchId),
    findRememberedMapping: async (userId, signature) => this.state.mappings.get(`${userId}|${signature}`) ?? null,
    rememberMapping: async (userId, signature, mapping) => void this.state.mappings.set(`${userId}|${signature}`, mapping),
  };

  rules: Repositories['rules'] = {
    findAll: async (userId) => [...this.state.rules.values()].filter((r) => r.userId === userId),
    findById: async (userId, id) => owned(this.state.rules.get(id), userId),
    create: async (input) => insert(this.state.rules, { ...input, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() }),
    update: async (userId, id, patch) => patchOwned(this.state.rules, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.rules, userId, id),
  };

  recurring: Repositories['recurring'] = {
    findAll: async (userId) => [...this.state.recurring.values()].filter((r) => r.userId === userId),
    findById: async (userId, id) => owned(this.state.recurring.get(id), userId),
    sync: async (userId, series) => {
      const keys = new Set(series.map((s) => s.key));
      for (const existing of [...this.state.recurring.values()]) {
        if (existing.userId === userId && !keys.has(existing.key)) this.state.recurring.delete(existing.id);
      }
      for (const s of series) {
        const existing = [...this.state.recurring.values()].find((r) => r.userId === userId && r.key === s.key);
        if (existing) this.state.recurring.set(existing.id, { ...existing, ...s, updatedAt: now() });
        else insert(this.state.recurring, { ...s, id: randomUUID(), isDismissed: false, createdAt: now(), updatedAt: now() });
      }
    },
    setDismissed: async (userId, id, isDismissed) => patchOwned(this.state.recurring, userId, id, { isDismissed }),
  };

  budgets: Repositories['budgets'] = {
    findAll: async (userId) => [...this.state.budgets.values()].filter((b) => b.userId === userId),
    findById: async (userId, id) => owned(this.state.budgets.get(id), userId),
    create: async (input) => insert(this.state.budgets, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.budgets, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.budgets, userId, id),
  };

  goals: Repositories['goals'] = {
    findAll: async (userId) => [...this.state.goals.values()].filter((g) => g.userId === userId),
    findById: async (userId, id) => owned(this.state.goals.get(id), userId),
    create: async (input) => insert(this.state.goals, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.goals, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.goals, userId, id),
  };

  scenarios: Repositories['scenarios'] = {
    findAll: async (userId) => [...this.state.scenarios.values()].filter((s) => s.userId === userId),
    findById: async (userId, id) => owned(this.state.scenarios.get(id), userId),
    create: async (input) => insert(this.state.scenarios, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.scenarios, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.scenarios, userId, id),
  };

  holdings: Repositories['holdings'] = {
    findAll: async (userId) =>
      [...this.state.holdings.values()].filter((h) => h.userId === userId).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    findById: async (userId, id) => owned(this.state.holdings.get(id), userId),
    findByIdentity: async (userId, identity) => {
      const mine = [...this.state.holdings.values()].filter((h) => h.userId === userId);
      const sameFolio = (h: HoldingRecord) => !identity.folio || !h.folio || h.folio === identity.folio;
      return (
        (identity.isin ? mine.find((h) => h.isin === identity.isin && sameFolio(h)) : undefined) ??
        (identity.schemeCode ? mine.find((h) => h.schemeCode === identity.schemeCode && sameFolio(h)) : undefined) ??
        (identity.symbol ? mine.find((h) => h.symbol === identity.symbol) : undefined) ??
        (identity.name ? mine.find((h) => h.name.toLowerCase() === identity.name!.toLowerCase() && sameFolio(h)) : undefined) ??
        null
      );
    },
    create: async (input) => insert(this.state.holdings, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.holdings, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.holdings, userId, id),
    setPricesBySchemeCode: async (userId, prices) => {
      const byCode = new Map(prices.map((p) => [p.schemeCode, p]));
      let updated = 0;
      for (const holding of this.state.holdings.values()) {
        if (holding.userId !== userId || !holding.schemeCode) continue;
        const price = byCode.get(holding.schemeCode);
        if (!price) continue;
        this.state.holdings.set(holding.id, { ...holding, latestPrice: price.price, latestPriceDate: price.date, updatedAt: now() });
        updated++;
      }
      return updated;
    },
  };

  holdingTransactions: Repositories['holdingTransactions'] = {
    findAll: async (userId) => [...this.state.holdingTransactions.values()].filter((t) => t.userId === userId).sort(byDateThenId),
    findByHolding: async (userId, holdingId) =>
      [...this.state.holdingTransactions.values()].filter((t) => t.userId === userId && t.holdingId === holdingId).sort(byDateThenId),
    findById: async (userId, id) => owned(this.state.holdingTransactions.get(id), userId),
    create: async (input) => insert(this.state.holdingTransactions, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    createMany: async (inputs) => {
      for (const input of inputs) insert(this.state.holdingTransactions, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() });
      return inputs.length;
    },
    update: async (userId, id, patch) => patchOwned(this.state.holdingTransactions, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.holdingTransactions, userId, id),
    deleteByHolding: async (userId, holdingId) => {
      for (const [id, row] of this.state.holdingTransactions) {
        if (row.userId === userId && row.holdingId === holdingId) this.state.holdingTransactions.delete(id);
      }
    },
    findExistingRefs: async (userId, refs) => {
      const wanted = new Set(refs);
      return [...this.state.holdingTransactions.values()]
        .filter((t) => t.userId === userId && t.externalRef !== null && wanted.has(t.externalRef))
        .map((t) => t.externalRef as string);
    },
  };

  portfolioData: Repositories['portfolioData'] = {
    listBenchmarkSeries: async (userId) => {
      const groups = new Map<string, BenchmarkPointRecord[]>();
      for (const point of this.state.benchmarkPoints) {
        if (point.userId !== userId) continue;
        const list = groups.get(point.series);
        if (list) list.push(point);
        else groups.set(point.series, [point]);
      }
      return [...groups.entries()].map(([series, points]) => {
        const dates = points.map((p) => p.date).sort();
        return { series, points: points.length, from: dates[0], to: dates[dates.length - 1] };
      });
    },
    findBenchmarkPoints: async (userId, series) =>
      this.state.benchmarkPoints.filter((p) => p.userId === userId && p.series === series).sort((a, b) => a.date.localeCompare(b.date)),
    replaceBenchmark: async (userId, series, points) => {
      this.state.benchmarkPoints = this.state.benchmarkPoints.filter((p) => !(p.userId === userId && p.series === series));
      for (const point of points) this.state.benchmarkPoints.push({ userId, series, date: point.date, value: point.value });
      return points.length;
    },
    findFundHoldings: async (userId, holdingId) =>
      [...this.state.fundHoldings.values()].filter((r) => r.userId === userId && r.holdingId === holdingId),
    replaceFundHoldings: async (userId, holdingId, rows) => {
      for (const [id, row] of this.state.fundHoldings) {
        if (row.userId === userId && row.holdingId === holdingId) this.state.fundHoldings.delete(id);
      }
      for (const row of rows) insert(this.state.fundHoldings, { ...row, id: randomUUID() });
      return rows.length;
    },
  };

  portfolioImports: Repositories['portfolioImports'] = {
    listBatches: async (userId) =>
      [...this.state.portfolioBatches.values()].filter((b) => b.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    findBatch: async (userId, id) => owned(this.state.portfolioBatches.get(id), userId),
    createBatch: async (input) => insert(this.state.portfolioBatches, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    updateBatch: async (userId, id, patch) => patchOwned(this.state.portfolioBatches, userId, id, patch),
    deleteBatch: async (userId, id) => {
      for (const [rowId, row] of this.state.portfolioRows) {
        if (row.userId === userId && row.batchId === id) this.state.portfolioRows.delete(rowId);
      }
      deleteOwned(this.state.portfolioBatches, userId, id);
    },
    insertRows: async (rows) => {
      for (const row of rows) insert(this.state.portfolioRows, { ...row, id: randomUUID(), createdAt: now() });
    },
    findRows: async (userId, batchId) =>
      [...this.state.portfolioRows.values()].filter((r) => r.userId === userId && r.batchId === batchId).sort((a, b) => a.rowNumber - b.rowNumber),
    updateRow: async (userId, id, patch) => patchOwned(this.state.portfolioRows, userId, id, patch),
  };

  trades: Repositories['trades'] = {
    findAll: async (userId, filter = {}) =>
      [...this.state.trades.values()]
        .filter(
          (t) =>
            t.userId === userId &&
            (!filter.from || t.date >= filter.from) &&
            (!filter.to || t.date <= filter.to) &&
            (!filter.segment || t.segment === filter.segment) &&
            (!filter.underlying || t.underlying === filter.underlying) &&
            (!filter.symbol || t.symbol === filter.symbol) &&
            (!filter.side || t.side === filter.side) &&
            (!filter.broker || t.broker === filter.broker) &&
            (filter.paperAccountId ? t.paperAccountId === filter.paperAccountId : filter.includePaper === true || !t.isPaper),
        )
        .sort(byFillOrder),
    findById: async (userId, id) => owned(this.state.trades.get(id), userId),
    create: async (input) => insert(this.state.trades, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    createMany: async (inputs) => {
      for (const input of inputs) insert(this.state.trades, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() });
      return inputs.length;
    },
    update: async (userId, id, patch) => patchOwned(this.state.trades, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.trades, userId, id),
    findExistingRefs: async (userId, refs) => {
      const wanted = new Set(refs);
      return [...this.state.trades.values()]
        .filter((t) => t.userId === userId && t.externalRef !== null && wanted.has(t.externalRef))
        .map((t) => t.externalRef!);
    },
    listBrokers: async (userId) =>
      [...new Set([...this.state.trades.values()].filter((t) => t.userId === userId).map((t) => t.broker))].sort(),
  };

  tradingJournal: Repositories['tradingJournal'] = {
    findAll: async (userId) => [...this.state.journal.values()].filter((e) => e.userId === userId),
    findByPosition: async (userId, positionId) =>
      [...this.state.journal.values()].find((e) => e.userId === userId && e.positionId === positionId) ?? null,
    upsert: async (userId, positionId, patch) => {
      const existing = [...this.state.journal.values()].find((e) => e.userId === userId && e.positionId === positionId);
      if (existing) return insert(this.state.journal, { ...existing, ...patch, updatedAt: now() });
      return insert(this.state.journal, {
        id: randomUUID(),
        userId,
        positionId,
        notes: null,
        setupTags: [],
        emotionTags: [],
        mistakes: [],
        stopPrice: null,
        targetPrice: null,
        screenshots: [],
        ...patch,
        createdAt: now(),
        updatedAt: now(),
      });
    },
    delete: async (userId, positionId) => {
      for (const [id, entry] of this.state.journal) {
        if (entry.userId === userId && entry.positionId === positionId) this.state.journal.delete(id);
      }
    },
  };

  tradingSettings: Repositories['tradingSettings'] = {
    find: async (userId) => this.state.tradingSettings.get(userId) ?? null,
    save: async (userId, patch) => {
      const existing = this.state.tradingSettings.get(userId) ?? { userId, ...DEFAULT_TRADING_SETTINGS, updatedAt: now() };
      const updated = { ...existing, ...patch, userId, updatedAt: now() };
      this.state.tradingSettings.set(userId, updated);
      return { ...updated };
    },
  };

  tradeImports: Repositories['tradeImports'] = {
    listBatches: async (userId) =>
      [...this.state.tradeBatches.values()].filter((b) => b.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    findBatch: async (userId, id) => owned(this.state.tradeBatches.get(id), userId),
    createBatch: async (input) => insert(this.state.tradeBatches, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    updateBatch: async (userId, id, patch) => patchOwned(this.state.tradeBatches, userId, id, patch),
    deleteBatch: async (userId, id) => {
      for (const [rowId, row] of this.state.tradeRows) {
        if (row.userId === userId && row.batchId === id) this.state.tradeRows.delete(rowId);
      }
      deleteOwned(this.state.tradeBatches, userId, id);
    },
    insertRows: async (rows) => {
      for (const row of rows) insert(this.state.tradeRows, { ...row, id: randomUUID(), createdAt: now() });
    },
    findRows: async (userId, batchId) =>
      [...this.state.tradeRows.values()].filter((r) => r.userId === userId && r.batchId === batchId).sort((a, b) => a.rowNumber - b.rowNumber),
    updateRow: async (userId, id, patch) => patchOwned(this.state.tradeRows, userId, id, patch),
  };

  // ---- Strategy Lab ----

  marketBars: Repositories['marketBars'] = {
    listSeries: async (userId) => {
      const groups = new Map<string, BarRecord[]>();
      for (const bar of this.state.bars.values()) {
        if (bar.userId !== userId) continue;
        const key = `${bar.symbol}|${bar.timeframe}`;
        const list = groups.get(key);
        if (list) list.push(bar);
        else groups.set(key, [bar]);
      }
      return [...groups.values()]
        .map((rows) => {
          const sorted = rows.sort(byBarOrder);
          return { symbol: sorted[0].symbol, timeframe: sorted[0].timeframe, bars: sorted.length, from: sorted[0].date, to: sorted[sorted.length - 1].date };
        })
        .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.timeframe.localeCompare(b.timeframe));
    },
    find: async (userId, symbol, timeframe, filter = {}) =>
      [...this.state.bars.values()]
        .filter(
          (bar) =>
            bar.userId === userId &&
            bar.symbol === symbol &&
            bar.timeframe === timeframe &&
            (!filter.from || bar.date >= filter.from) &&
            (!filter.to || bar.date <= filter.to),
        )
        .sort(byBarOrder)
        .slice(0, filter.limit ?? Number.MAX_SAFE_INTEGER),
    count: async (userId, symbol, timeframe) =>
      [...this.state.bars.values()].filter((bar) => bar.userId === userId && bar.symbol === symbol && bar.timeframe === timeframe).length,
    insertMany: async (rows) => {
      let inserted = 0;
      const seen = new Set(
        [...this.state.bars.values()].map((bar) => `${bar.userId}|${bar.symbol}|${bar.timeframe}|${bar.date}|${bar.time ?? ''}`),
      );
      for (const row of rows) {
        const key = `${row.userId}|${row.symbol}|${row.timeframe}|${row.date}|${row.time ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        insert(this.state.bars, { ...row, id: randomUUID(), createdAt: now() });
        inserted += 1;
      }
      return inserted;
    },
    deleteSeries: async (userId, symbol, timeframe) => {
      for (const [id, bar] of this.state.bars) {
        if (bar.userId === userId && bar.symbol === symbol && bar.timeframe === timeframe) this.state.bars.delete(id);
      }
    },
  };

  labBarImports: Repositories['labBarImports'] = {
    list: async (userId) =>
      [...this.state.barImports.values()].filter((b) => b.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    find: async (userId, id) => owned(this.state.barImports.get(id), userId),
    create: async (input) => insert(this.state.barImports, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.barImports, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.barImports, userId, id),
  };

  labStrategies: Repositories['labStrategies'] = {
    findAll: async (userId) =>
      [...this.state.labStrategies.values()].filter((s) => s.userId === userId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    findById: async (userId, id) => owned(this.state.labStrategies.get(id), userId),
    create: async (input) => insert(this.state.labStrategies, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    update: async (userId, id, patch) => patchOwned(this.state.labStrategies, userId, id, patch),
    delete: async (userId, id) => void deleteOwned(this.state.labStrategies, userId, id),
    recordRun: async (userId, id) => {
      const found = owned(this.state.labStrategies.get(id), userId);
      if (!found) return 0;
      const updated = { ...found, runCount: found.runCount + 1, updatedAt: now() };
      this.state.labStrategies.set(id, updated);
      return updated.runCount;
    },
  };

  labBacktests: Repositories['labBacktests'] = {
    list: async (userId, strategyId) =>
      [...this.state.labBacktests.values()]
        .filter((b) => b.userId === userId && (!strategyId || b.strategyId === strategyId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(({ result, userId: _u, ...rest }) => ({ ...rest, overfittingWarning: result.overfittingWarning })),
    findById: async (userId, id) => owned(this.state.labBacktests.get(id), userId),
    create: async (input) => insert(this.state.labBacktests, { ...input, id: randomUUID(), createdAt: now() }),
    delete: async (userId, id) => void deleteOwned(this.state.labBacktests, userId, id),
    countForStrategy: async (userId, strategyId) =>
      [...this.state.labBacktests.values()].filter((b) => b.userId === userId && b.strategyId === strategyId).length,
  };

  labPaper: Repositories['labPaper'] = {
    listAccounts: async (userId) =>
      [...this.state.paperAccounts.values()].filter((a) => a.userId === userId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    findAccount: async (userId, id) => owned(this.state.paperAccounts.get(id), userId),
    createAccount: async (input) => insert(this.state.paperAccounts, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    updateAccount: async (userId, id, patch) => patchOwned(this.state.paperAccounts, userId, id, patch),
    deleteAccount: async (userId, id) => {
      for (const [orderId, order] of this.state.paperOrders) {
        if (order.userId === userId && order.accountId === id) this.state.paperOrders.delete(orderId);
      }
      deleteOwned(this.state.paperAccounts, userId, id);
    },
    listOrders: async (userId, accountId) =>
      [...this.state.paperOrders.values()]
        .filter((o) => o.userId === userId && o.accountId === accountId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    findOrder: async (userId, id) => owned(this.state.paperOrders.get(id), userId),
    createOrder: async (input) => insert(this.state.paperOrders, { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() }),
    updateOrder: async (userId, id, patch) => patchOwned(this.state.paperOrders, userId, id, patch),
    deleteOrder: async (userId, id) => void deleteOwned(this.state.paperOrders, userId, id),
  };

  private inPeriod(userId: string, filter: { from: string; to: string; currency: string; accountId?: string }): TransactionRecord[] {
    return [...this.state.transactions.values()].filter(
      (t) =>
        t.userId === userId &&
        t.currency === filter.currency &&
        t.date >= filter.from &&
        t.date <= filter.to &&
        (!filter.accountId || t.accountId === filter.accountId),
    );
  }

  private batchRows(userId: string, batchId: string): ImportRowRecord[] {
    return [...this.state.rows.values()]
      .filter((r) => r.userId === userId && r.batchId === batchId)
      .sort((a, b) => a.rowNumber - b.rowNumber);
  }

  async transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.state);
    try {
      return await work(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  addSystemCategory(name: string, type = CategoryType.EXPENSE, parentId: string | null = null): CategoryRecord {
    return insert(this.state.categories, {
      id: randomUUID(),
      userId: null,
      name,
      parentId,
      type,
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  get transactionCount(): number {
    return this.state.transactions.size;
  }
}

const byDateThenId = (a: HoldingTransactionRecord, b: HoldingTransactionRecord) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

const byFillOrder = (a: TradeRecord, b: TradeRecord) =>
  a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id);

function insert<T extends { id: string }>(map: Map<string, T>, record: T): T {
  map.set(record.id, record);
  return { ...record };
}

function owned<T extends { userId: string | null }>(record: T | undefined, userId: string): T | null {
  return record && record.userId === userId ? { ...record } : null;
}

function patchOwned<T extends { userId: string | null }>(
  map: Map<string, T>,
  userId: string,
  id: string,
  patch: Partial<NoInfer<T>>,
): T {
  const record = owned(map.get(id), userId);
  if (!record) throw new Error(`record ${id} not found for user`);
  const updated = { ...record, ...patch };
  map.set(id, updated);
  return { ...updated };
}

function deleteOwned<T extends { userId: string | null }>(map: Map<string, T>, userId: string, id: string): void {
  if (owned(map.get(id), userId)) map.delete(id);
}

const byBarOrder = (a: BarRecord, b: BarRecord): number =>
  a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id) : a.date.localeCompare(b.date);
