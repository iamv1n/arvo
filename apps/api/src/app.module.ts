import { Global, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AdvisorController } from './advisor/advisor.controller';
import { AdvisorProviders, AI_PROVIDER_FACTORY, defaultProviderFactory } from './advisor/advisor-providers';
import { AdvisorService } from './advisor/advisor.service';
import { BriefingsService } from './advisor/briefings.service';
import { SuggestionsService } from './advisor/suggestions.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AccountsController } from './accounts/accounts.controller';
import { AuthModule } from './auth/auth.module';
import { CategoriesController } from './categories/categories.controller';
import { RequestLoggingMiddleware } from './common/request-logging.middleware';
import { APP_CONFIG, loadAppConfig } from './config/app-config';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MailModule } from './mail/mail.module';
import { RemindersController } from './reminders/reminders.controller';
import { RemindersService } from './reminders/reminders.service';
import { HealthController } from './health/health.controller';
import { LabController } from './lab/lab.controller';
import { AlertsController, MarketController, NotificationsController, WatchlistsController } from './markets/markets.controller';
import { AlertsScheduler } from './markets/alerts.scheduler';
import { MarketsNotifier, TELEGRAM_SENDER, createTelegramSender } from './markets/notifier';
import { NEWS_FETCHER, NewsService, createFeedFetcher } from './markets/news.service';
import { ImportsController } from './imports/imports.controller';
import { BudgetsController, GoalsController } from './planning/planning.controller';
import { PlanningController, ScenariosController } from './planning/scenarios.controller';
import { HoldingsController, PortfolioController, PortfolioImportsController } from './portfolio/portfolio.controller';
import { PositionsController, TradeImportsController, TradesController, TradingController } from './trading/trading.controller';
import { RulesController } from './rules/rules.controller';
import { MerchantsController } from './merchants/merchants.controller';
import { TransactionsController } from './transactions/transactions.controller';
import { TransfersController } from './transfers/transfers.controller';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { TokensController } from './tokens/tokens.controller';
import { UsersController } from './users/users.controller';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadAppConfig() }],
  exports: [APP_CONFIG],
})
class ConfigModule {}

@Module({
  imports: [ConfigModule, DatabaseModule, MailModule, AuthModule, ScheduleModule.forRoot()],
  providers: [
    OAuthService,
    RemindersService,
    { provide: AI_PROVIDER_FACTORY, inject: [APP_CONFIG], useFactory: defaultProviderFactory },
    AdvisorProviders,
    SuggestionsService,
    AdvisorService,
    BriefingsService,
    // Markets & Alerts. Both outbound channels are built from configuration and refuse to act
    // when it is absent, so a default install (and every test) has no path to a network call.
    { provide: TELEGRAM_SENDER, inject: [APP_CONFIG], useFactory: (config: ReturnType<typeof loadAppConfig>) => createTelegramSender(config.markets.telegramBotToken) },
    { provide: NEWS_FETCHER, inject: [APP_CONFIG], useFactory: (config: ReturnType<typeof loadAppConfig>) => createFeedFetcher(config.markets.newsEnabled) },
    MarketsNotifier,
    NewsService,
    AlertsScheduler,
  ],
  controllers: [
    HealthController,
    LabController,
    UsersController,
    RemindersController,
    TokensController,
    OAuthController,
    AccountsController,
    AnalyticsController,
    CategoriesController,
    MerchantsController,
    TransactionsController,
    TransfersController,
    ImportsController,
    RulesController,
    BudgetsController,
    GoalsController,
    PlanningController,
    ScenariosController,
    AdvisorController,
    HoldingsController,
    PortfolioController,
    PortfolioImportsController,
    TradesController,
    TradeImportsController,
    PositionsController,
    TradingController,
    WatchlistsController,
    MarketController,
    AlertsController,
    NotificationsController,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*path');
  }
}
