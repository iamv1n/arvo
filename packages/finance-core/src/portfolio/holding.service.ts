import { DomainError } from '../errors';
import { formatMoney, parseMoney } from '../money';
import type { FinanceStore } from '../ports';
import { optionalText, requireCurrency, requireDate, requireText } from '../services/validation';
import {
  DEFAULT_ASSET_CLASS,
  INCOME_TYPES,
  INVESTING_TYPES,
  REDEEMING_TYPES,
  UNIT_PRICED_KINDS,
} from './types';
import type {
  AssetClass,
  FundPlan,
  HoldingPatch,
  HoldingRecord,
  HoldingTransactionRecord,
  HoldingTransactionType,
  InstrumentKind,
  MarketCap,
} from './types';
import { formatUnits, isUnitsString, parseUnits, priceOf } from './units';
import { buildPosition, type Position } from './valuation';

const KINDS = Object.keys(DEFAULT_ASSET_CLASS) as InstrumentKind[];
const ASSET_CLASSES: AssetClass[] = ['EQUITY', 'DEBT', 'GOLD', 'REAL_ESTATE', 'CASH', 'OTHER'];
const TX_TYPES: HoldingTransactionType[] = [
  ...INVESTING_TYPES,
  ...REDEEMING_TYPES,
  ...INCOME_TYPES,
  'BONUS',
  'VALUE_UPDATE',
];
const UNIT_PRICED = new Set(UNIT_PRICED_KINDS);
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export interface CreateHoldingInput {
  name: string;
  kind: InstrumentKind;
  assetClass?: AssetClass;
  currency: string;
  isin?: string | null;
  schemeCode?: string | null;
  symbol?: string | null;
  folio?: string | null;
  amc?: string | null;
  sector?: string | null;
  marketCap?: MarketCap | null;
  plan?: FundPlan | null;
  expenseRatio?: string | null;
  directExpenseRatio?: string | null;
  exitLoadDays?: number | null;
  exitLoadPercent?: string | null;
  lockInMonths?: number | null;
  latestPrice?: string | null;
  latestPriceDate?: string | null;
  goalId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export type UpdateHoldingInput = Partial<Omit<CreateHoldingInput, 'currency'>>;

export interface CreateHoldingTransactionInput {
  date: string;
  type: HoldingTransactionType;
  units?: string | null;
  price?: string | null;
  amount?: string;
  charges?: string;
  note?: string | null;
  externalRef?: string | null;
}

export type UpdateHoldingTransactionInput = Partial<Omit<CreateHoldingTransactionInput, 'externalRef'>>;

/**
 * Holdings and their event log.
 *
 * Every write is validated here, so the API, the import pipeline and the manual-entry form all
 * land on the same rules: a unit-priced instrument needs units and a price, a cash-only event
 * must not carry units, and amounts are positive magnitudes whose direction comes from the type.
 */
export class HoldingService {
  constructor(private readonly store: FinanceStore) {}

  async list(userId: string): Promise<HoldingRecord[]> {
    return this.store.holdings.findAll(userId);
  }

  async require(userId: string, id: string): Promise<HoldingRecord> {
    const holding = await this.store.holdings.findById(userId, id);
    if (!holding) throw DomainError.notFound('HOLDING_NOT_FOUND', 'Holding not found');
    return holding;
  }

  async create(userId: string, input: CreateHoldingInput): Promise<HoldingRecord> {
    const kind = requireEnum('kind', input.kind, KINDS);
    const currency = requireCurrency(input.currency);
    if (input.goalId) await this.requireGoal(userId, input.goalId);
    return this.store.holdings.create({
      userId,
      name: requireText('name', input.name, 160),
      kind,
      assetClass: input.assetClass ? requireEnum('assetClass', input.assetClass, ASSET_CLASSES) : DEFAULT_ASSET_CLASS[kind],
      currency,
      ...identityFields(input),
      ...metadataFields(input),
      goalId: input.goalId ?? null,
      notes: optionalText('notes', input.notes, 1000),
      isActive: input.isActive ?? true,
    });
  }

  async update(userId: string, id: string, input: UpdateHoldingInput): Promise<HoldingRecord> {
    await this.require(userId, id);
    const patch: HoldingPatch = {};
    if (input.name !== undefined) patch.name = requireText('name', input.name, 160);
    if (input.kind !== undefined) patch.kind = requireEnum('kind', input.kind, KINDS);
    if (input.assetClass !== undefined) patch.assetClass = requireEnum('assetClass', input.assetClass, ASSET_CLASSES);
    if (input.notes !== undefined) patch.notes = optionalText('notes', input.notes, 1000);
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.goalId !== undefined) {
      if (input.goalId) await this.requireGoal(userId, input.goalId);
      patch.goalId = input.goalId ?? null;
    }
    const identity = identityFields(input);
    const metadata = metadataFields(input);
    for (const key of Object.keys(identity) as (keyof typeof identity)[]) {
      if (input[key] !== undefined) Object.assign(patch, { [key]: identity[key] });
    }
    for (const key of Object.keys(metadata) as (keyof typeof metadata)[]) {
      if (input[key] !== undefined) Object.assign(patch, { [key]: metadata[key] });
    }
    return this.store.holdings.update(userId, id, patch);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.store.transaction(async (repos) => {
      await repos.holdingTransactions.deleteByHolding(userId, id);
      await repos.holdings.delete(userId, id);
    });
  }

  /** Records the latest known price. Kept separate so a NAV import and the UI share one path. */
  async setPrice(userId: string, id: string, input: { price: string; date: string }): Promise<HoldingRecord> {
    await this.require(userId, id);
    const price = requirePositiveMoney('price', input.price);
    return this.store.holdings.update(userId, id, {
      latestPrice: formatMoney(price),
      latestPriceDate: requireDate('date', input.date),
    });
  }

  async transactions(userId: string, holdingId: string): Promise<HoldingTransactionRecord[]> {
    await this.require(userId, holdingId);
    return this.store.holdingTransactions.findByHolding(userId, holdingId);
  }

  async addTransaction(userId: string, holdingId: string, input: CreateHoldingTransactionInput): Promise<HoldingTransactionRecord> {
    const holding = await this.require(userId, holdingId);
    return this.store.holdingTransactions.create({ userId, holdingId, ...normalizeTransaction(holding, input) });
  }

  async updateTransaction(userId: string, id: string, input: UpdateHoldingTransactionInput): Promise<HoldingTransactionRecord> {
    const existing = await this.store.holdingTransactions.findById(userId, id);
    if (!existing) throw DomainError.notFound('HOLDING_TRANSACTION_NOT_FOUND', 'Holding transaction not found');
    const holding = await this.require(userId, existing.holdingId);
    const merged = normalizeTransaction(holding, {
      date: input.date ?? existing.date,
      type: input.type ?? existing.type,
      units: input.units !== undefined ? input.units : existing.units,
      price: input.price !== undefined ? input.price : existing.price,
      amount: input.amount ?? existing.amount,
      charges: input.charges ?? existing.charges,
      note: input.note !== undefined ? input.note : existing.note,
    });
    return this.store.holdingTransactions.update(userId, id, {
      date: merged.date,
      type: merged.type,
      units: merged.units,
      price: merged.price,
      amount: merged.amount,
      charges: merged.charges,
      note: merged.note,
    });
  }

  async deleteTransaction(userId: string, id: string): Promise<void> {
    const existing = await this.store.holdingTransactions.findById(userId, id);
    if (!existing) throw DomainError.notFound('HOLDING_TRANSACTION_NOT_FOUND', 'Holding transaction not found');
    await this.store.holdingTransactions.delete(userId, id);
  }

  /** One holding with its position on a date; used by the drill-down view. */
  async detail(userId: string, id: string, asOf: string): Promise<{ position: Position; transactions: HoldingTransactionRecord[] }> {
    const holding = await this.require(userId, id);
    const transactions = await this.store.holdingTransactions.findByHolding(userId, id);
    return { position: buildPosition(holding, transactions, requireDate('asOf', asOf)), transactions };
  }

  private async requireGoal(userId: string, goalId: string): Promise<void> {
    const goal = await this.store.goals.findById(userId, goalId);
    if (!goal) throw DomainError.notFound('GOAL_NOT_FOUND', 'Goal not found');
  }
}

/**
 * Normalizes one event. Amount is derived from units × price when it is missing, and the
 * price from amount ÷ units, so a broker CSV that gives only two of the three still works.
 */
export function normalizeTransaction(
  holding: HoldingRecord,
  input: CreateHoldingTransactionInput,
): Omit<HoldingTransactionRecord, 'id' | 'userId' | 'holdingId' | 'createdAt' | 'updatedAt'> {
  const type = requireEnum('type', input.type, TX_TYPES);
  const date = requireDate('date', input.date);
  const charges = requireNonNegativeMoney('charges', input.charges ?? '0');
  const cashOnly = type === 'DIVIDEND' || type === 'INTEREST' || type === 'VALUE_UPDATE';

  let units = input.units === null || input.units === undefined || input.units === '' ? null : requireUnits('units', input.units);
  let price = input.price === null || input.price === undefined || input.price === '' ? null : requirePositiveMoney('price', input.price);
  let amount = input.amount === undefined || input.amount === '' ? null : requireNonNegativeMoney('amount', input.amount);

  if (cashOnly) {
    if (units !== null && units !== 0n) {
      throw DomainError.validation('UNITS_NOT_ALLOWED', `${type} records money only and must not carry units`, { field: 'units' });
    }
    units = null;
    price = null;
  }

  if (amount === null && units !== null && price !== null) amount = mul(units, price);
  if (price === null && amount !== null && units !== null && units !== 0n) price = priceOf(amount, units);
  if (amount === null) {
    throw DomainError.validation('INVALID_AMOUNT', 'amount is required (or give both units and price)', { field: 'amount' });
  }
  if (type === 'BONUS') amount = 0n;
  if (amount === 0n && type !== 'BONUS') {
    throw DomainError.validation('INVALID_AMOUNT', 'amount must be greater than zero', { field: 'amount' });
  }

  if (!cashOnly && UNIT_PRICED.has(holding.kind) && (units === null || units === 0n)) {
    throw DomainError.validation('UNITS_REQUIRED', `${holding.kind} transactions need a unit quantity`, { field: 'units' });
  }
  if (units !== null && units < 0n) {
    throw DomainError.validation('INVALID_UNITS', 'units must not be negative', { field: 'units' });
  }

  return {
    date,
    type,
    units: units === null ? null : formatUnits(units),
    price: price === null ? null : formatMoney(price),
    amount: formatMoney(amount),
    charges: formatMoney(charges),
    note: optionalText('note', input.note, 300),
    externalRef: input.externalRef ?? null,
  };
}

function identityFields(input: UpdateHoldingInput) {
  return {
    isin: normalizeIsin(input.isin),
    schemeCode: optionalText('schemeCode', input.schemeCode, 24),
    symbol: input.symbol ? requireText('symbol', input.symbol, 32).toUpperCase() : null,
    folio: optionalText('folio', input.folio, 64),
  };
}

function metadataFields(input: UpdateHoldingInput) {
  return {
    amc: optionalText('amc', input.amc, 120),
    sector: optionalText('sector', input.sector, 80),
    marketCap: input.marketCap ? requireEnum('marketCap', input.marketCap, ['LARGE', 'MID', 'SMALL'] as MarketCap[]) : null,
    plan: input.plan ? requireEnum('plan', input.plan, ['DIRECT', 'REGULAR'] as FundPlan[]) : null,
    expenseRatio: input.expenseRatio ? formatMoney(requirePercent('expenseRatio', input.expenseRatio)) : null,
    directExpenseRatio: input.directExpenseRatio ? formatMoney(requirePercent('directExpenseRatio', input.directExpenseRatio)) : null,
    exitLoadDays: requireCount('exitLoadDays', input.exitLoadDays, 3660),
    exitLoadPercent: input.exitLoadPercent ? formatMoney(requirePercent('exitLoadPercent', input.exitLoadPercent)) : null,
    lockInMonths: requireCount('lockInMonths', input.lockInMonths, 600),
    latestPrice: input.latestPrice ? formatMoney(requirePositiveMoney('latestPrice', input.latestPrice)) : null,
    latestPriceDate: input.latestPriceDate ? requireDate('latestPriceDate', input.latestPriceDate) : null,
  };
}

function normalizeIsin(value: string | null | undefined): string | null {
  const isin = optionalText('isin', value, 12);
  if (isin === null) return null;
  const upper = isin.toUpperCase();
  if (!ISIN_PATTERN.test(upper)) {
    throw DomainError.validation('INVALID_ISIN', 'isin must be 12 characters, e.g. INF109K01Z48', { field: 'isin' });
  }
  return upper;
}

export function requireEnum<T extends string>(field: string, value: T, allowed: readonly T[]): T {
  if (!allowed.includes(value)) {
    throw DomainError.validation('INVALID_INPUT', `${field} must be one of ${allowed.join(', ')}`, { field });
  }
  return value;
}

function requireUnits(field: string, value: string): bigint {
  if (!isUnitsString(value)) {
    throw DomainError.validation('INVALID_UNITS', `${field} must be a decimal with at most 5 fraction digits`, { field });
  }
  return parseUnits(value);
}

function requireNonNegativeMoney(field: string, value: string): bigint {
  const amount = requireMoneyString(field, value);
  if (amount < 0n) throw DomainError.validation('INVALID_AMOUNT', `${field} must not be negative`, { field });
  return amount;
}

function requirePositiveMoney(field: string, value: string): bigint {
  const amount = requireNonNegativeMoney(field, value);
  if (amount === 0n) throw DomainError.validation('INVALID_AMOUNT', `${field} must be greater than zero`, { field });
  return amount;
}

function requirePercent(field: string, value: string): bigint {
  const percent = requireNonNegativeMoney(field, value);
  if (percent > 1000000n) throw DomainError.validation('INVALID_INPUT', `${field} must be a percentage below 100`, { field });
  return percent;
}

function requireMoneyString(field: string, value: string): bigint {
  try {
    return parseMoney(value);
  } catch {
    throw DomainError.validation('INVALID_AMOUNT', `${field} must be a decimal with at most 4 fraction digits`, { field });
  }
}

function requireCount(field: string, value: number | null | undefined, max: number): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw DomainError.validation('INVALID_INPUT', `${field} must be a whole number between 0 and ${max}`, { field });
  }
  return value;
}

/** units × price → money units. */
function mul(units: bigint, price: bigint): bigint {
  const scale = 100000n;
  const abs = (units < 0n ? -units : units) * (price < 0n ? -price : price);
  const value = (abs * 2n + scale) / (2n * scale);
  return (units < 0n) !== (price < 0n) ? -value : value;
}
