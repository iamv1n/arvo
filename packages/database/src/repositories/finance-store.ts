import type {
  BudgetRepository,
  GoalRepository,
  ScenarioRepository,
  RecurringRepository,
  ImportRepository,
  ImportRowStatus,
  RuleRepository,
  AccountRepository,
  CategoryRepository,
  FinanceStore,
  MerchantRepository,
  Repositories,
  TransactionRepository,
  TransferRepository,
  HoldingRepository,
  HoldingTransactionRepository,
  PortfolioDataRepository,
  PortfolioImportRepository,
  TradeRepository,
  JournalRepository,
  TradingSettingsRepository,
  TradeImportRepository,
  TradeFilter,
} from '@arvo/finance-core';
import { DEFAULT_TRADING_SETTINGS } from '@arvo/finance-core';
import { ImportStatus, type TransactionType } from '@arvo/types';
import { Between, In, IsNull, LessThanOrEqual, MoreThanOrEqual, Not, type DataSource, type EntityManager, type EntityTarget, type ObjectLiteral } from 'typeorm';
import {
  BudgetEntity,
  GoalEntity,
  ScenarioEntity,
  RecurringSeriesEntity,
  ImportBatchEntity,
  ImportColumnMappingEntity,
  ImportErrorEntity,
  ImportRowEntity,
  RuleEntity,
  AccountEntity,
  CategoryEntity,
  MerchantEntity,
  TransactionEntity,
  TransferEntity,
  BenchmarkPointEntity,
  FundHoldingEntity,
  HoldingEntity,
  HoldingTransactionEntity,
  PortfolioImportBatchEntity,
  PortfolioImportRowEntity,
  TradeEntity,
  TradeImportBatchEntity,
  TradeImportRowEntity,
  TradeJournalEntryEntity,
  TradingSettingsEntity,
} from '../entities';
import {
  toAccount,
  toBudget,
  toGoal,
  toScenario,
  toCategory,
  toImportBatch,
  toImportError,
  toImportRow,
  toMerchant,
  toRecurring,
  toRule,
  toTransaction,
  toTransfer,
  toBenchmarkPoint,
  toFundHolding,
  toTrade,
  toJournalEntry,
  toTradingSettings,
  toTradeImportBatch,
  toTradeImportRow,
  toHolding,
  toHoldingTransaction,
  toPortfolioImportBatch,
  toPortfolioImportRow,
} from './mappers';

/** Mirrors descriptionPatternKey() in finance-core: upper-case, non A–Z runs → one space, trimmed. */
const DESCRIPTION_PATTERN_SQL = "btrim(regexp_replace(upper(t.description), '[^A-Z]+', ' ', 'g'))";

// TypeORM's deep-partial update typing rejects jsonb records; values are validated by finance-core.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPatch = any;

/** Aggregates read date columns back as strings on some drivers and Dates on others. */
function isoDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** Escapes LIKE/ILIKE wildcards so user search text matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Every query below is scoped by user_id. Rows of other users behave as absent. */
export function createRepositories(manager: EntityManager): Repositories {
  async function updateOwned<T extends ObjectLiteral>(
    target: EntityTarget<T>,
    userId: string,
    id: string,
    patch: object,
  ): Promise<T> {
    if (Object.keys(patch).length > 0) {
      await manager.update(target, { id, userId } as AnyPatch, patch as AnyPatch);
    }
    const row = await manager.findOneBy(target, { id, userId } as AnyPatch);
    if (!row) throw new Error('Row vanished during update');
    return row;
  }

  const accounts: AccountRepository = {
    findAll: async (userId) =>
      (await manager.find(AccountEntity, { where: { userId }, order: { createdAt: 'ASC' } })).map(toAccount),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(AccountEntity, { id, userId });
      return row ? toAccount(row) : null;
    },
    create: async (input) => toAccount(await manager.save(manager.create(AccountEntity, input))),
    update: async (userId, id, patch) => toAccount(await updateOwned(AccountEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(AccountEntity, { id, userId })),
  };

  const categories: CategoryRepository = {
    findVisible: async (userId) =>
      (await manager.find(CategoryEntity, { where: [{ userId }, { userId: IsNull() }] })).map(toCategory),
    findVisibleById: async (userId, id) => {
      const row = await manager.findOne(CategoryEntity, {
        where: [
          { id, userId },
          { id, userId: IsNull() },
        ],
      });
      return row ? toCategory(row) : null;
    },
    create: async (input) => toCategory(await manager.save(manager.create(CategoryEntity, input))),
    update: async (userId, id, patch) => toCategory(await updateOwned(CategoryEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(CategoryEntity, { id, userId })),
  };

  const merchants: MerchantRepository = {
    findAll: async (userId) => (await manager.findBy(MerchantEntity, { userId })).map(toMerchant),
    findPage: async (userId, { limit, offset, search }) => {
      const qb = manager.createQueryBuilder(MerchantEntity, 'm').where('m.user_id = :userId', { userId });
      if (search) qb.andWhere('m.name ILIKE :pattern', { pattern: `%${escapeLike(search)}%` });
      const [rows, total] = await qb.orderBy('lower(m.name)', 'ASC').addOrderBy('m.id', 'ASC').take(limit).skip(offset).getManyAndCount();
      return { items: rows.map(toMerchant), total };
    },
    findById: async (userId, id) => {
      const row = await manager.findOneBy(MerchantEntity, { id, userId });
      return row ? toMerchant(row) : null;
    },
    findByNormalizedName: async (userId, normalizedName) => {
      const row = await manager.findOneBy(MerchantEntity, { userId, normalizedName });
      return row ? toMerchant(row) : null;
    },
    create: async (input) => toMerchant(await manager.save(manager.create(MerchantEntity, input))),
    update: async (userId, id, patch) => toMerchant(await updateOwned(MerchantEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(MerchantEntity, { id, userId })),
  };

  const transactions: TransactionRepository = {
    findMany: async (userId, filter) => {
      const qb = manager
        .createQueryBuilder(TransactionEntity, 't')
        .leftJoin(MerchantEntity, 'm', 'm.id = t.merchant_id')
        .where('t.user_id = :userId', { userId });
      if (filter.accountId) qb.andWhere('t.account_id = :accountId', { accountId: filter.accountId });
      if (filter.categoryId) qb.andWhere('t.category_id = :categoryId', { categoryId: filter.categoryId });
      else if (filter.uncategorized) qb.andWhere('t.category_id IS NULL');
      if (filter.merchantId) qb.andWhere('t.merchant_id = :merchantId', { merchantId: filter.merchantId });
      else if (filter.withoutMerchant) qb.andWhere('t.merchant_id IS NULL');
      if (filter.types?.length) qb.andWhere('t.type IN (:...types)', { types: filter.types });
      if (filter.statuses?.length) qb.andWhere('t.status IN (:...statuses)', { statuses: filter.statuses });
      if (filter.sources?.length) qb.andWhere('t.source IN (:...sources)', { sources: filter.sources });
      if (filter.direction === 'IN') qb.andWhere('t.amount > 0');
      if (filter.direction === 'OUT') qb.andWhere('t.amount < 0');
      if (filter.minAmount) qb.andWhere('abs(t.amount) >= :minAmount', { minAmount: filter.minAmount });
      if (filter.maxAmount) qb.andWhere('abs(t.amount) <= :maxAmount', { maxAmount: filter.maxAmount });
      if (filter.from) qb.andWhere('t.date >= :from', { from: filter.from });
      if (filter.to) qb.andWhere('t.date <= :to', { to: filter.to });
      if (filter.search) {
        const pattern = `%${escapeLike(filter.search)}%`;
        qb.andWhere('(t.description ILIKE :pattern OR m.name ILIKE :pattern)', { pattern });
      }
      const [rows, total] = await qb
        .orderBy('t.date', 'DESC')
        .addOrderBy('t.created_at', 'DESC')
        .addOrderBy('t.id', 'DESC')
        .take(filter.limit)
        .skip(filter.offset)
        .getManyAndCount();
      return { items: rows.map(toTransaction), total };
    },
    findById: async (userId, id) => {
      const row = await manager.findOneBy(TransactionEntity, { id, userId });
      return row ? toTransaction(row) : null;
    },
    findByIds: async (userId, ids) =>
      ids.length ? (await manager.findBy(TransactionEntity, { id: In(ids), userId })).map(toTransaction) : [],
    create: async (input) => toTransaction(await manager.save(manager.create(TransactionEntity, input))),
    update: async (userId, id, patch) => toTransaction(await updateOwned(TransactionEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(TransactionEntity, { id, userId })),
    sumAmountsByAccount: async (userId) => {
      const rows: { account_id: string; total: string }[] = await manager
        .createQueryBuilder(TransactionEntity, 't')
        .select('t.account_id', 'account_id')
        .addSelect('SUM(t.amount)::text', 'total')
        .where('t.user_id = :userId', { userId })
        .groupBy('t.account_id')
        .getRawMany();
      return new Map(rows.map((r) => [r.account_id, r.total]));
    },
    countByAccount: (userId, accountId) => manager.countBy(TransactionEntity, { userId, accountId }),
    aggregateByMerchant: async (userId, filter) => {
      const qb = manager
        .createQueryBuilder(TransactionEntity, 't')
        .select('t.merchant_id', 'merchant_id')
        .addSelect('t.type', 'type')
        .addSelect('SUM(t.amount)::text', 'total')
        .addSelect('COUNT(*)::int', 'count')
        .where('t.user_id = :userId AND t.currency = :currency', { userId, currency: filter.currency })
        .andWhere('t.date BETWEEN :from AND :to', { from: filter.from, to: filter.to });
      if (filter.accountId) qb.andWhere('t.account_id = :accountId', { accountId: filter.accountId });
      const rows = await qb.groupBy('t.merchant_id, t.type').getRawMany<{ merchant_id: string | null; type: TransactionType; total: string; count: number }>();
      return rows.map((r) => ({ merchantId: r.merchant_id, type: r.type, total: r.total, count: r.count }));
    },
    findInPeriod: async (userId, filter) =>
      (
        await manager.find(TransactionEntity, {
          where: {
            userId,
            currency: filter.currency,
            date: Between(filter.from, filter.to),
            type: In(filter.types),
            ...(filter.accountId ? { accountId: filter.accountId } : {}),
          },
          order: { date: 'ASC', id: 'ASC' },
        })
      ).map(toTransaction),
    findLargestOutflows: async (userId, filter, limit) => {
      const qb = manager
        .createQueryBuilder(TransactionEntity, 't')
        .where('t.user_id = :userId AND t.currency = :currency', { userId, currency: filter.currency })
        .andWhere('t.date BETWEEN :from AND :to', { from: filter.from, to: filter.to })
        .andWhere('t.type IN (:...types)', { types: filter.types })
        .andWhere('t.amount < 0');
      if (filter.accountId) qb.andWhere('t.account_id = :accountId', { accountId: filter.accountId });
      return (await qb.orderBy('t.amount', 'ASC').addOrderBy('t.date', 'ASC').take(limit).getMany()).map(toTransaction);
    },
    findByFingerprints: async (userId, accountId, fingerprints) =>
      fingerprints.length
        ? manager.find(TransactionEntity, {
            select: { id: true, fingerprint: true },
            where: { userId, accountId, fingerprint: In(fingerprints) },
            order: { createdAt: 'ASC' },
          })
        : [],
    merchantCategoryStats: async (userId) =>
      (
        await manager
          .createQueryBuilder(TransactionEntity, 't')
          .select('t.merchant_id', 'merchant_id')
          .addSelect('t.category_id', 'category_id')
          .addSelect('COUNT(*)::int', 'count')
          .where('t.user_id = :userId', { userId })
          .andWhere('t.merchant_id IS NOT NULL AND t.category_id IS NOT NULL')
          .groupBy('t.merchant_id, t.category_id')
          .getRawMany<{ merchant_id: string; category_id: string; count: number }>()
      ).map((r) => ({ merchantId: r.merchant_id, categoryId: r.category_id, count: r.count })),
    descriptionCategoryStats: async (userId, keys) => {
      if (keys.length === 0) return [];
      const rows = await manager
        .createQueryBuilder(TransactionEntity, 't')
        .select(DESCRIPTION_PATTERN_SQL, 'key')
        .addSelect('t.category_id', 'category_id')
        .addSelect('COUNT(*)::int', 'count')
        .where('t.user_id = :userId', { userId })
        .andWhere('t.category_id IS NOT NULL')
        .andWhere(`${DESCRIPTION_PATTERN_SQL} IN (:...keys)`, { keys })
        .groupBy('1, 2')
        .getRawMany<{ key: string; category_id: string; count: number }>();
      return rows.map((r) => ({ key: r.key, categoryId: r.category_id, count: r.count }));
    },
    aggregate: async (userId, filter) => {
      const qb = manager
        .createQueryBuilder(TransactionEntity, 't')
        .select("to_char(t.date, 'YYYY-MM')", 'month')
        .addSelect('t.type', 'type')
        .addSelect('t.category_id', 'category_id')
        .addSelect("CASE WHEN t.amount > 0 THEN 'IN' ELSE 'OUT' END", 'direction')
        .addSelect('SUM(t.amount)::text', 'total')
        .addSelect('COUNT(*)::int', 'count')
        .where('t.user_id = :userId', { userId })
        .andWhere('t.currency = :currency', { currency: filter.currency })
        .andWhere('t.date BETWEEN :from AND :to', { from: filter.from, to: filter.to });
      if (filter.accountId) qb.andWhere('t.account_id = :accountId', { accountId: filter.accountId });
      const rows: { month: string; type: TransactionType; category_id: string | null; direction: 'IN' | 'OUT'; total: string; count: number }[] =
        await qb.groupBy('1, 2, 3, 4').orderBy('1').addOrderBy('2').getRawMany();
      return rows.map((r) => ({
        month: r.month,
        type: r.type,
        categoryId: r.category_id,
        direction: r.direction,
        total: r.total,
        count: r.count,
      }));
    },
  };

  const transfers: TransferRepository = {
    findAll: async (userId) =>
      (await manager.find(TransferEntity, { where: { userId }, order: { createdAt: 'DESC' } })).map(toTransfer),
    findPage: async (userId, { limit, offset }) => {
      const [rows, total] = await manager.findAndCount(TransferEntity, {
        where: { userId },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: limit,
        skip: offset,
      });
      return { items: rows.map(toTransfer), total };
    },
    findById: async (userId, id) => {
      const row = await manager.findOneBy(TransferEntity, { id, userId });
      return row ? toTransfer(row) : null;
    },
    findByTransactionId: async (userId, transactionId) => {
      const row = await manager.findOne(TransferEntity, {
        where: [
          { userId, fromTransactionId: transactionId },
          { userId, toTransactionId: transactionId },
        ],
      });
      return row ? toTransfer(row) : null;
    },
    create: async (input) => toTransfer(await manager.save(manager.create(TransferEntity, input))),
    delete: async (userId, id) => void (await manager.delete(TransferEntity, { id, userId })),
  };

  const imports: ImportRepository = {
    findBatches: async (userId, { limit, offset }) => {
      const [rows, total] = await manager.findAndCount(ImportBatchEntity, {
        where: { userId },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: limit,
        skip: offset,
      });
      return { items: rows.map(toImportBatch), total };
    },
    findBatch: async (userId, id) => {
      const row = await manager.findOneBy(ImportBatchEntity, { id, userId });
      return row ? toImportBatch(row) : null;
    },
    findCompletedBatchByHash: async (userId, accountId, fileHash) => {
      const row = await manager.findOne(ImportBatchEntity, {
        where: { userId, accountId, fileHash, status: ImportStatus.COMPLETED },
        order: { completedAt: 'DESC' },
      });
      return row ? toImportBatch(row) : null;
    },
    createBatch: async (input) => toImportBatch(await manager.save(manager.create(ImportBatchEntity, input as AnyPatch))),
    updateBatch: async (userId, id, patch) => toImportBatch(await updateOwned(ImportBatchEntity, userId, id, patch)),
    deleteBatch: async (userId, id) => void (await manager.delete(ImportBatchEntity, { id, userId })),

    findRows: async (userId, batchId, filter) => {
      const qb = manager
        .createQueryBuilder(ImportRowEntity, 'r')
        .where('r.user_id = :userId AND r.batch_id = :batchId', { userId, batchId });
      if (filter.statuses?.length) qb.andWhere('r.status IN (:...statuses)', { statuses: filter.statuses });
      if (filter.decisions?.length) qb.andWhere('r.decision IN (:...decisions)', { decisions: filter.decisions });
      const [rows, total] = await qb.orderBy('r.row_number', 'ASC').take(filter.limit).skip(filter.offset).getManyAndCount();
      return { items: rows.map(toImportRow), total };
    },
    findAllRows: async (userId, batchId) =>
      (await manager.find(ImportRowEntity, { where: { userId, batchId }, order: { rowNumber: 'ASC' } })).map(toImportRow),
    findRow: async (userId, batchId, rowId) => {
      const row = await manager.findOneBy(ImportRowEntity, { id: rowId, userId, batchId });
      return row ? toImportRow(row) : null;
    },
    replaceRows: async (userId, batchId, rows) => {
      await manager.delete(ImportRowEntity, { userId, batchId });
      for (let i = 0; i < rows.length; i += 500) {
        await manager.insert(ImportRowEntity, rows.slice(i, i + 500) as AnyPatch);
      }
    },
    updateRow: async (userId, batchId, rowId, patch) => {
      if (Object.keys(patch).length > 0) {
        await manager.update(ImportRowEntity, { id: rowId, userId, batchId }, patch as AnyPatch);
      }
      return toImportRow(await manager.findOneByOrFail(ImportRowEntity, { id: rowId, userId, batchId }));
    },
    setDecisions: async (userId, batchId, where, decision) => {
      const qb = manager
        .createQueryBuilder()
        .update(ImportRowEntity)
        .set({ decision })
        .where('user_id = :userId AND batch_id = :batchId AND transaction_id IS NULL', { userId, batchId });
      if (where.rowIds?.length) qb.andWhere('id IN (:...rowIds)', { rowIds: where.rowIds });
      else qb.andWhere('status IN (:...statuses)', { statuses: where.statuses as ImportRowStatus[] });
      if (decision === 'ACCEPT') qb.andWhere("status <> 'INVALID'");
      return (await qb.execute()).affected ?? 0;
    },
    countRows: async (userId, batchId) =>
      (
        await manager
          .createQueryBuilder(ImportRowEntity, 'r')
          .select('r.status', 'status')
          .addSelect('r.decision', 'decision')
          .addSelect('COUNT(*)::int', 'count')
          .where('r.user_id = :userId AND r.batch_id = :batchId', { userId, batchId })
          .groupBy('r.status, r.decision')
          .getRawMany()
      ).map((r) => ({ status: r.status, decision: r.decision, count: r.count })),

    replaceErrors: async (userId, batchId, errors) => {
      await manager.delete(ImportErrorEntity, { userId, batchId });
      for (let i = 0; i < errors.length; i += 500) {
        await manager.insert(ImportErrorEntity, errors.slice(i, i + 500));
      }
    },
    findErrors: async (userId, batchId) =>
      (
        await manager.find(ImportErrorEntity, {
          where: { userId, batchId },
          order: { rowNumber: { direction: 'ASC', nulls: 'FIRST' } },
        })
      ).map(toImportError),

    findRememberedMapping: async (userId, headerSignature) =>
      (await manager.findOneBy(ImportColumnMappingEntity, { userId, headerSignature }))?.mapping ?? null,
    rememberMapping: async (userId, headerSignature, mapping) => {
      await manager.upsert(ImportColumnMappingEntity, { userId, headerSignature, mapping } as AnyPatch, ['userId', 'headerSignature']);
    },
  };

  const rules: RuleRepository = {
    findAll: async (userId) => (await manager.findBy(RuleEntity, { userId })).map(toRule),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(RuleEntity, { id, userId });
      return row ? toRule(row) : null;
    },
    create: async (input) => toRule(await manager.save(manager.create(RuleEntity, input as AnyPatch))),
    update: async (userId, id, patch) => toRule(await updateOwned(RuleEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(RuleEntity, { id, userId })),
  };

  const recurring: RecurringRepository = {
    findAll: async (userId) => (await manager.findBy(RecurringSeriesEntity, { userId })).map(toRecurring),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(RecurringSeriesEntity, { id, userId });
      return row ? toRecurring(row) : null;
    },
    sync: async (userId, series) => {
      const keys = series.map((s) => s.key);
      await manager.delete(RecurringSeriesEntity, keys.length ? { userId, key: Not(In(keys)) } : { userId });
      if (series.length === 0) return;
      // Upsert by (user_id, key); is_dismissed is not in the payload, so dismissals survive.
      await manager.upsert(
        RecurringSeriesEntity,
        series.map((s) => ({ ...s, confidence: s.confidence.toFixed(2) })) as AnyPatch,
        { conflictPaths: ['userId', 'key'], skipUpdateIfNoValuesChanged: true },
      );
    },
    setDismissed: async (userId, id, isDismissed) => toRecurring(await updateOwned(RecurringSeriesEntity, userId, id, { isDismissed })),
  };

  const budgets: BudgetRepository = {
    findAll: async (userId) => (await manager.find(BudgetEntity, { where: { userId }, order: { createdAt: 'ASC' } })).map(toBudget),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(BudgetEntity, { id, userId });
      return row ? toBudget(row) : null;
    },
    create: async (input) => toBudget(await manager.save(manager.create(BudgetEntity, input))),
    update: async (userId, id, patch) => toBudget(await updateOwned(BudgetEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(BudgetEntity, { id, userId })),
  };

  const goals: GoalRepository = {
    findAll: async (userId) => (await manager.find(GoalEntity, { where: { userId }, order: { createdAt: 'ASC' } })).map(toGoal),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(GoalEntity, { id, userId });
      return row ? toGoal(row) : null;
    },
    create: async (input) => toGoal(await manager.save(manager.create(GoalEntity, input))),
    update: async (userId, id, patch) => toGoal(await updateOwned(GoalEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(GoalEntity, { id, userId })),
  };

  const scenarios: ScenarioRepository = {
    findAll: async (userId) => (await manager.find(ScenarioEntity, { where: { userId }, order: { createdAt: 'ASC', id: 'ASC' } })).map(toScenario),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(ScenarioEntity, { id, userId });
      return row ? toScenario(row) : null;
    },
    create: async (input) => toScenario(await manager.save(manager.create(ScenarioEntity, input))),
    update: async (userId, id, patch) => toScenario(await updateOwned(ScenarioEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(ScenarioEntity, { id, userId })),
  };

  const holdings: HoldingRepository = {
    findAll: async (userId) => (await manager.find(HoldingEntity, { where: { userId }, order: { name: 'ASC', id: 'ASC' } })).map(toHolding),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(HoldingEntity, { id, userId });
      return row ? toHolding(row) : null;
    },
    findByIdentity: async (userId, identity) => {
      // Identifiers are tried in order of how specific they are; the folio disambiguates
      // the same scheme held in two folios.
      const attempts: ObjectLiteral[] = [];
      if (identity.isin) attempts.push({ userId, isin: identity.isin });
      if (identity.schemeCode) attempts.push({ userId, schemeCode: identity.schemeCode });
      if (identity.symbol) attempts.push({ userId, symbol: identity.symbol });
      if (identity.name) attempts.push({ userId, name: identity.name });
      for (const where of attempts) {
        const candidates = await manager.find(HoldingEntity, { where: where as AnyPatch, order: { createdAt: 'ASC' } });
        const match = identity.folio ? (candidates.find((c) => c.folio === identity.folio) ?? candidates.find((c) => c.folio === null)) : candidates[0];
        if (match) return toHolding(match);
      }
      return null;
    },
    create: async (input) => toHolding(await manager.save(manager.create(HoldingEntity, input as AnyPatch))),
    update: async (userId, id, patch) => toHolding(await updateOwned(HoldingEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(HoldingEntity, { id, userId })),
    setPricesBySchemeCode: async (userId, prices) => {
      if (prices.length === 0) return 0;
      const owned = await manager.find(HoldingEntity, { where: { userId, schemeCode: Not(IsNull()) } });
      const byCode = new Map(prices.map((p) => [p.schemeCode, p]));
      let updated = 0;
      for (const holding of owned) {
        const price = holding.schemeCode ? byCode.get(holding.schemeCode) : undefined;
        if (!price) continue;
        await manager.update(HoldingEntity, { id: holding.id, userId }, { latestPrice: price.price, latestPriceDate: price.date } as AnyPatch);
        updated++;
      }
      return updated;
    },
  };

  const holdingTransactions: HoldingTransactionRepository = {
    findAll: async (userId) =>
      (await manager.find(HoldingTransactionEntity, { where: { userId }, order: { date: 'ASC', createdAt: 'ASC', id: 'ASC' } })).map(toHoldingTransaction),
    findByHolding: async (userId, holdingId) =>
      (await manager.find(HoldingTransactionEntity, { where: { userId, holdingId }, order: { date: 'ASC', createdAt: 'ASC', id: 'ASC' } })).map(
        toHoldingTransaction,
      ),
    findById: async (userId, id) => {
      const row = await manager.findOneBy(HoldingTransactionEntity, { id, userId });
      return row ? toHoldingTransaction(row) : null;
    },
    create: async (input) => toHoldingTransaction(await manager.save(manager.create(HoldingTransactionEntity, input as AnyPatch))),
    createMany: async (inputs) => {
      for (let i = 0; i < inputs.length; i += 500) await manager.insert(HoldingTransactionEntity, inputs.slice(i, i + 500) as AnyPatch);
      return inputs.length;
    },
    update: async (userId, id, patch) => toHoldingTransaction(await updateOwned(HoldingTransactionEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(HoldingTransactionEntity, { id, userId })),
    deleteByHolding: async (userId, holdingId) => void (await manager.delete(HoldingTransactionEntity, { userId, holdingId })),
    findExistingRefs: async (userId, refs) => {
      if (refs.length === 0) return [];
      const found: string[] = [];
      for (let i = 0; i < refs.length; i += 500) {
        const rows = await manager.find(HoldingTransactionEntity, {
          where: { userId, externalRef: In(refs.slice(i, i + 500)) },
          select: { externalRef: true },
        });
        found.push(...rows.map((r) => r.externalRef as string));
      }
      return found;
    },
  };

  const portfolioData: PortfolioDataRepository = {
    listBenchmarkSeries: async (userId) => {
      const rows = (await manager
        .createQueryBuilder(BenchmarkPointEntity, 'p')
        .select('p.series', 'series')
        .addSelect('COUNT(*)', 'points')
        .addSelect('MIN(p.date)', 'from')
        .addSelect('MAX(p.date)', 'to')
        .where('p.user_id = :userId', { userId })
        .groupBy('p.series')
        .orderBy('p.series', 'ASC')
        .getRawMany()) as { series: string; points: string; from: string | Date; to: string | Date }[];
      return rows.map((r) => ({ series: r.series, points: Number(r.points), from: isoDate(r.from), to: isoDate(r.to) }));
    },
    findBenchmarkPoints: async (userId, series) =>
      (await manager.find(BenchmarkPointEntity, { where: { userId, series }, order: { date: 'ASC' } })).map(toBenchmarkPoint),
    replaceBenchmark: async (userId, series, points) => {
      await manager.delete(BenchmarkPointEntity, { userId, series });
      for (let i = 0; i < points.length; i += 500) {
        await manager.insert(BenchmarkPointEntity, points.slice(i, i + 500).map((p) => ({ userId, series, ...p })) as AnyPatch);
      }
      return points.length;
    },
    findFundHoldings: async (userId, holdingId) =>
      (await manager.find(FundHoldingEntity, { where: { userId, holdingId }, order: { weight: 'DESC' } })).map(toFundHolding),
    replaceFundHoldings: async (userId, holdingId, rows) => {
      await manager.delete(FundHoldingEntity, { userId, holdingId });
      for (let i = 0; i < rows.length; i += 500) await manager.insert(FundHoldingEntity, rows.slice(i, i + 500) as AnyPatch);
      return rows.length;
    },
  };

  const portfolioImports: PortfolioImportRepository = {
    listBatches: async (userId) =>
      (await manager.find(PortfolioImportBatchEntity, { where: { userId }, order: { createdAt: 'DESC' } })).map(toPortfolioImportBatch),
    findBatch: async (userId, id) => {
      const row = await manager.findOneBy(PortfolioImportBatchEntity, { id, userId });
      return row ? toPortfolioImportBatch(row) : null;
    },
    createBatch: async (input) => toPortfolioImportBatch(await manager.save(manager.create(PortfolioImportBatchEntity, input as AnyPatch))),
    updateBatch: async (userId, id, patch) => toPortfolioImportBatch(await updateOwned(PortfolioImportBatchEntity, userId, id, patch)),
    deleteBatch: async (userId, id) => void (await manager.delete(PortfolioImportBatchEntity, { id, userId })),
    insertRows: async (rows) => {
      for (let i = 0; i < rows.length; i += 500) await manager.insert(PortfolioImportRowEntity, rows.slice(i, i + 500) as AnyPatch);
    },
    findRows: async (userId, batchId) =>
      (await manager.find(PortfolioImportRowEntity, { where: { userId, batchId }, order: { rowNumber: 'ASC' } })).map(toPortfolioImportRow),
    updateRow: async (userId, id, patch) => toPortfolioImportRow(await updateOwned(PortfolioImportRowEntity, userId, id, patch)),
  };

  /*
   * Trading journal. Trades are read in fill order — date, then time, then id — because the
   * FIFO reconstruction depends on that order and a tradebook import has no other guarantee.
   * Fills with no time sort first within their day, which is the conservative reading.
   */
  const trades: TradeRepository = {
    findAll: async (userId, filter: TradeFilter = {}) => {
      const where: ObjectLiteral = { userId };
      if (filter.from && filter.to) where.date = Between(filter.from, filter.to);
      else if (filter.from) where.date = MoreThanOrEqual(filter.from);
      else if (filter.to) where.date = LessThanOrEqual(filter.to);
      if (filter.segment) where.segment = filter.segment;
      if (filter.underlying) where.underlying = filter.underlying;
      if (filter.symbol) where.symbol = filter.symbol;
      if (filter.side) where.side = filter.side;
      if (filter.broker) where.broker = filter.broker;
      const rows = await manager.find(TradeEntity, { where: where as AnyPatch, order: { date: 'ASC', time: 'ASC', id: 'ASC' } });
      return rows.map(toTrade);
    },
    findById: async (userId, id) => {
      const row = await manager.findOneBy(TradeEntity, { id, userId });
      return row ? toTrade(row) : null;
    },
    create: async (input) => toTrade(await manager.save(manager.create(TradeEntity, input as AnyPatch))),
    createMany: async (inputs) => {
      for (let i = 0; i < inputs.length; i += 500) await manager.insert(TradeEntity, inputs.slice(i, i + 500) as AnyPatch);
      return inputs.length;
    },
    update: async (userId, id, patch) => toTrade(await updateOwned(TradeEntity, userId, id, patch)),
    delete: async (userId, id) => void (await manager.delete(TradeEntity, { id, userId })),
    findExistingRefs: async (userId, refs) => {
      if (refs.length === 0) return [];
      const found: string[] = [];
      for (let i = 0; i < refs.length; i += 500) {
        const rows = await manager.find(TradeEntity, { where: { userId, externalRef: In(refs.slice(i, i + 500)) }, select: { externalRef: true } });
        found.push(...rows.map((r) => r.externalRef as string));
      }
      return found;
    },
    listBrokers: async (userId) => {
      const rows = (await manager
        .createQueryBuilder(TradeEntity, 't')
        .select('DISTINCT t.broker', 'broker')
        .where('t.user_id = :userId', { userId })
        .orderBy('broker', 'ASC')
        .getRawMany()) as { broker: string }[];
      return rows.map((r) => r.broker);
    },
  };

  const tradingJournal: JournalRepository = {
    findAll: async (userId) => (await manager.find(TradeJournalEntryEntity, { where: { userId } })).map(toJournalEntry),
    findByPosition: async (userId, positionId) => {
      const row = await manager.findOneBy(TradeJournalEntryEntity, { userId, positionId });
      return row ? toJournalEntry(row) : null;
    },
    upsert: async (userId, positionId, patch) => {
      const existing = await manager.findOneBy(TradeJournalEntryEntity, { userId, positionId });
      if (existing) {
        await manager.update(TradeJournalEntryEntity, { id: existing.id, userId }, patch as AnyPatch);
        return toJournalEntry((await manager.findOneByOrFail(TradeJournalEntryEntity, { id: existing.id, userId })) as TradeJournalEntryEntity);
      }
      const created = manager.create(TradeJournalEntryEntity, {
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
      } as AnyPatch);
      return toJournalEntry(await manager.save(created));
    },
    delete: async (userId, positionId) => void (await manager.delete(TradeJournalEntryEntity, { userId, positionId })),
  };

  const tradingSettings: TradingSettingsRepository = {
    find: async (userId) => {
      const row = await manager.findOneBy(TradingSettingsEntity, { userId });
      return row ? toTradingSettings(row) : null;
    },
    save: async (userId, patch) => {
      const existing = await manager.findOneBy(TradingSettingsEntity, { userId });
      const merged = { userId, ...DEFAULT_TRADING_SETTINGS, ...(existing ? toTradingSettings(existing) : {}), ...patch };
      const { updatedAt: _ignored, ...values } = merged as Record<string, unknown>;
      await manager.upsert(TradingSettingsEntity, values as AnyPatch, ['userId']);
      return toTradingSettings((await manager.findOneByOrFail(TradingSettingsEntity, { userId })) as TradingSettingsEntity);
    },
  };

  const tradeImports: TradeImportRepository = {
    listBatches: async (userId) => (await manager.find(TradeImportBatchEntity, { where: { userId }, order: { createdAt: 'DESC' } })).map(toTradeImportBatch),
    findBatch: async (userId, id) => {
      const row = await manager.findOneBy(TradeImportBatchEntity, { id, userId });
      return row ? toTradeImportBatch(row) : null;
    },
    createBatch: async (input) => toTradeImportBatch(await manager.save(manager.create(TradeImportBatchEntity, input as AnyPatch))),
    updateBatch: async (userId, id, patch) => toTradeImportBatch(await updateOwned(TradeImportBatchEntity, userId, id, patch)),
    deleteBatch: async (userId, id) => void (await manager.delete(TradeImportBatchEntity, { id, userId })),
    insertRows: async (rows) => {
      for (let i = 0; i < rows.length; i += 500) await manager.insert(TradeImportRowEntity, rows.slice(i, i + 500) as AnyPatch);
    },
    findRows: async (userId, batchId) =>
      (await manager.find(TradeImportRowEntity, { where: { userId, batchId }, order: { rowNumber: 'ASC' } })).map(toTradeImportRow),
    updateRow: async (userId, id, patch) => toTradeImportRow(await updateOwned(TradeImportRowEntity, userId, id, patch)),
  };

  return {
    accounts,
    categories,
    merchants,
    transactions,
    transfers,
    imports,
    rules,
    recurring,
    budgets,
    goals,
    scenarios,
    holdings,
    holdingTransactions,
    portfolioData,
    portfolioImports,
    trades,
    tradingJournal,
    tradingSettings,
    tradeImports,
  };
}

export function createFinanceStore(dataSource: DataSource): FinanceStore {
  return {
    ...createRepositories(dataSource.manager),
    transaction: (work) => dataSource.transaction((manager) => work(createRepositories(manager))),
  };
}
