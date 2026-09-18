import { HighlightsService } from './analytics/highlights.service';
import { InsightsService } from './analytics/insights.service';
import { PatternsService } from './analytics/patterns.service';
import { ImportService, type ImportDependencies } from './imports/import.service';
import type { FinanceStore } from './ports';
import { BudgetService } from './planning/budget.service';
import { GoalService } from './planning/goal.service';
import { SavingsService } from './planning/savings.service';
import { ScenarioService } from './planning/scenario.service';
import { HoldingService } from './portfolio/holding.service';
import { PortfolioService } from './portfolio/portfolio.service';
import { PortfolioImportService, type PortfolioImportDependencies } from './portfolio/import.service';
import { RuleService } from './rules/rule.service';
import { TradingService, type TradingDependencies } from './trading/trading.service';
import { TradeImportService, type TradeImportDependencies } from './trading/import.service';
import { AnalyticsService } from './services/analytics.service';
import { AccountService } from './services/account.service';
import { CategoryService } from './services/category.service';
import { MerchantService } from './services/merchant.service';
import { TransactionService } from './services/transaction.service';
import { TransferService } from './services/transfer.service';

/**
 * The single entry point every interface (REST API, MCP, worker) uses.
 * Interfaces supply the authenticated userId; they never query storage directly.
 */
export class FinanceCore {
  readonly accounts: AccountService;
  readonly analytics: AnalyticsService;
  readonly insights: InsightsService;
  readonly highlights: HighlightsService;
  readonly patterns: PatternsService;
  readonly categories: CategoryService;
  readonly merchants: MerchantService;
  readonly transactions: TransactionService;
  readonly transfers: TransferService;
  readonly rules: RuleService;
  readonly budgets: BudgetService;
  readonly goals: GoalService;
  readonly savings: SavingsService;
  readonly scenarios: ScenarioService;
  readonly holdings: HoldingService;
  readonly portfolio: PortfolioService;
  readonly trading: TradingService;
  private readonly tradeImportService?: TradeImportService;
  private readonly portfolioImportService?: PortfolioImportService;
  private readonly importService?: ImportService;

  constructor(
    store: FinanceStore,
    deps?: {
      imports?: ImportDependencies;
      portfolioImports?: PortfolioImportDependencies;
      tradeImports?: TradeImportDependencies;
      trading?: TradingDependencies;
    },
  ) {
    this.accounts = new AccountService(store);
    this.analytics = new AnalyticsService(store);
    this.insights = new InsightsService(store);
    this.highlights = new HighlightsService(store);
    this.patterns = new PatternsService(store);
    this.categories = new CategoryService(store);
    this.merchants = new MerchantService(store);
    this.transactions = new TransactionService(store);
    this.transfers = new TransferService(store);
    this.rules = new RuleService(store);
    this.budgets = new BudgetService(store);
    this.goals = new GoalService(store);
    this.savings = new SavingsService(store);
    this.scenarios = new ScenarioService(store);
    this.holdings = new HoldingService(store);
    this.portfolio = new PortfolioService(store);
    this.trading = new TradingService(store, deps?.trading);
    if (deps?.tradeImports) this.tradeImportService = new TradeImportService(store, deps.tradeImports);
    if (deps?.imports) this.importService = new ImportService(store, deps.imports);
    if (deps?.portfolioImports) this.portfolioImportService = new PortfolioImportService(store, deps.portfolioImports);
  }

  /** Statement imports; available when a parser and file store are provided. */
  get imports(): ImportService {
    if (!this.importService) throw new Error('FinanceCore was created without import dependencies');
    return this.importService;
  }

  /** Tradebook, P&L and contract-note imports; available when a parser is provided. */
  get tradeImports(): TradeImportService {
    if (!this.tradeImportService) throw new Error('FinanceCore was created without trade import dependencies');
    return this.tradeImportService;
  }

  /** Portfolio statement imports (CAS PDF, broker CSV, NAV and index files). */
  get portfolioImports(): PortfolioImportService {
    if (!this.portfolioImportService) throw new Error('FinanceCore was created without portfolio import dependencies');
    return this.portfolioImportService;
  }
}
