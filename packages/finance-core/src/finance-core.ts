import { HighlightsService } from './analytics/highlights.service';
import { InsightsService } from './analytics/insights.service';
import { PatternsService } from './analytics/patterns.service';
import { ImportService, type ImportDependencies } from './imports/import.service';
import type { FinanceStore } from './ports';
import { RuleService } from './rules/rule.service';
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
  private readonly importService?: ImportService;

  constructor(store: FinanceStore, deps?: { imports?: ImportDependencies }) {
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
    if (deps?.imports) this.importService = new ImportService(store, deps.imports);
  }

  /** Statement imports; available when a parser and file store are provided. */
  get imports(): ImportService {
    if (!this.importService) throw new Error('FinanceCore was created without import dependencies');
    return this.importService;
  }
}
