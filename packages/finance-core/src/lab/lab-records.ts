import type { BacktestResult, BacktestStats } from './backtest';
import type { BarTimeframe } from './bars';
import type { StrategySpec } from './strategy-spec';

/*
 * What the lab stores.
 *
 * Three things, and deliberately no more: the strategies a user has written, the runs they
 * have made, and their paper-trading accounts. Payoffs, Greeks, implied volatility, futures
 * and sizing are all stateless computes — there is nothing to save, and saving them would only
 * create stale copies of numbers that are cheaper to recompute than to read.
 *
 * A backtest keeps its whole result, including the spec it ran. Specs get edited; a result that
 * silently follows the current version of a strategy would be a lie about what was tested.
 */

export interface StrategyRecord {
  id: string;
  userId: string;
  name: string;
  /** Free text the user writes about what they were trying.  */
  description: string | null;
  spec: StrategySpec;
  /** How many backtests have been run from this strategy. Feeds the overfitting warning. */
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewStrategy = Omit<StrategyRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type StrategyPatch = Partial<Pick<StrategyRecord, 'name' | 'description' | 'spec'>>;

export interface BacktestRecord {
  id: string;
  userId: string;
  /** The strategy it came from; null once that strategy is deleted, so the run survives it. */
  strategyId: string | null;
  name: string;
  symbol: string;
  timeframe: BarTimeframe;
  from: string | null;
  to: string | null;
  /** The headline figures, so a list page needs no JSON parsing. */
  stats: BacktestStats;
  /** The whole result: spec, trades, equity curve, walk-forward, warnings. */
  result: BacktestResult;
  createdAt: Date;
}

export type NewBacktest = Omit<BacktestRecord, 'id' | 'createdAt'>;

/** The list view: everything but the trades and the curve. */
export interface BacktestSummary {
  id: string;
  strategyId: string | null;
  name: string;
  symbol: string;
  timeframe: BarTimeframe;
  from: string | null;
  to: string | null;
  stats: BacktestStats;
  overfittingWarning: string | null;
  createdAt: Date;
}

// ---- paper trading ----

export interface PaperAccountRecord {
  id: string;
  userId: string;
  name: string;
  startingCapital: string;
  /** Cash not tied up in a position. Reduced by buys, increased by sells, charges taken off. */
  cash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPaperAccount = Omit<PaperAccountRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type PaperAccountPatch = Partial<Pick<PaperAccountRecord, 'name' | 'cash'>>;

export type PaperOrderType = 'MARKET' | 'LIMIT';
export type PaperOrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export interface PaperOrderRecord {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  timeframe: BarTimeframe;
  side: 'BUY' | 'SELL';
  quantity: string;
  orderType: PaperOrderType;
  limitPrice: string | null;
  status: PaperOrderStatus;
  /** The moment the order was placed, in the simulation's own clock. */
  placedDate: string;
  placedTime: string | null;
  /** The bar it filled against. */
  filledDate: string | null;
  filledTime: string | null;
  fillPrice: string | null;
  /** The journal trade this fill created, marked isPaper. */
  tradeId: string | null;
  /** Why a rejected order was rejected, in words. */
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPaperOrder = Omit<PaperOrderRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type PaperOrderPatch = Partial<
  Pick<PaperOrderRecord, 'status' | 'filledDate' | 'filledTime' | 'fillPrice' | 'tradeId' | 'message'>
>;

/** A net open position in a paper account, rebuilt from its filled orders. */
export interface PaperPosition {
  symbol: string;
  /** Positive when long, negative when short. */
  quantity: number;
  /** Weighted average price of what is still open. */
  averagePrice: string;
  /** The last price the imported bars show for this symbol. */
  lastPrice: string | null;
  lastPriceDate: string | null;
  /** (last − average) × quantity. Null when there is no price to mark against. */
  unrealisedPnl: string | null;
  /** Realised on the parts already closed, after charges. */
  realisedPnl: string;
}

export interface PaperAccountView {
  account: PaperAccountRecord;
  positions: PaperPosition[];
  orders: PaperOrderRecord[];
  /** cash + the marked value of the open positions. */
  equity: string;
  /** equity − startingCapital. */
  totalPnl: string;
  realisedPnl: string;
  unrealisedPnl: string | null;
  charges: string;
  disclaimer: string;
}

// ---- persistence ports ----

export interface StrategyRepository {
  findAll(userId: string): Promise<StrategyRecord[]>;
  findById(userId: string, id: string): Promise<StrategyRecord | null>;
  create(input: NewStrategy): Promise<StrategyRecord>;
  update(userId: string, id: string, patch: StrategyPatch): Promise<StrategyRecord>;
  delete(userId: string, id: string): Promise<void>;
  /** Bumps runCount; returns the new value. */
  recordRun(userId: string, id: string): Promise<number>;
}

export interface BacktestRepository {
  /** Newest first, without the heavy result blob. */
  list(userId: string, strategyId?: string): Promise<BacktestSummary[]>;
  findById(userId: string, id: string): Promise<BacktestRecord | null>;
  create(input: NewBacktest): Promise<BacktestRecord>;
  delete(userId: string, id: string): Promise<void>;
  /** How many runs the user has stored for a strategy; feeds the overfitting warning. */
  countForStrategy(userId: string, strategyId: string): Promise<number>;
}

export interface PaperRepository {
  listAccounts(userId: string): Promise<PaperAccountRecord[]>;
  findAccount(userId: string, id: string): Promise<PaperAccountRecord | null>;
  createAccount(input: NewPaperAccount): Promise<PaperAccountRecord>;
  updateAccount(userId: string, id: string, patch: PaperAccountPatch): Promise<PaperAccountRecord>;
  deleteAccount(userId: string, id: string): Promise<void>;
  listOrders(userId: string, accountId: string): Promise<PaperOrderRecord[]>;
  findOrder(userId: string, id: string): Promise<PaperOrderRecord | null>;
  createOrder(input: NewPaperOrder): Promise<PaperOrderRecord>;
  updateOrder(userId: string, id: string, patch: PaperOrderPatch): Promise<PaperOrderRecord>;
  deleteOrder(userId: string, id: string): Promise<void>;
}

/** The most accounts, orders and saved strategies one user may hold. Guards against a runaway client. */
export const MAX_PAPER_ACCOUNTS = 10;
export const MAX_SAVED_STRATEGIES = 200;
export const MAX_STORED_BACKTESTS = 500;
