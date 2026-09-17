import { Global, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AnalyticsController } from './analytics/analytics.controller';
import { AccountsController } from './accounts/accounts.controller';
import { AuthModule } from './auth/auth.module';
import { CategoriesController } from './categories/categories.controller';
import { RequestLoggingMiddleware } from './common/request-logging.middleware';
import { APP_CONFIG, loadAppConfig } from './config/app-config';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { HealthController } from './health/health.controller';
import { ImportsController } from './imports/imports.controller';
import { BudgetsController, GoalsController } from './planning/planning.controller';
import { PlanningController, ScenariosController } from './planning/scenarios.controller';
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
  imports: [ConfigModule, DatabaseModule, MailModule, AuthModule],
  providers: [OAuthService],
  controllers: [
    HealthController,
    UsersController,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*path');
  }
}
