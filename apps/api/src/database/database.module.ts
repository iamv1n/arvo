import { createFinanceStore, databaseOptions } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { ArvoPortfolioParser, ArvoStatementParser, LocalAttachmentStore, LocalFileStore, TradeFileParser, parseOhlcvFile } from '@arvo/imports';
import { resolve } from 'node:path';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MARKETS_NOTIFIER, NotifierRelay } from '../markets/tokens';
import { createQuoteProvider } from '../markets/quote-provider';

@Global()
@Module({
  providers: [
    { provide: MARKETS_NOTIFIER, useClass: NotifierRelay },
    {
      provide: DataSource,
      inject: [APP_CONFIG],
      useFactory: async (config: AppConfig) =>
        new DataSource(databaseOptions(config.databaseUrl)).initialize(),
    },
    {
      provide: FinanceCore,
      inject: [DataSource, APP_CONFIG, MARKETS_NOTIFIER],
      useFactory: (dataSource: DataSource, config: AppConfig, notifier: NotifierRelay) =>
        new FinanceCore(createFinanceStore(dataSource), {
          imports: {
            parser: new ArvoStatementParser(),
            // Relative paths resolve from the repository root so every app shares one store.
            files: new LocalFileStore(resolve(__dirname, '../../../..', config.storagePath)),
          },
          portfolioImports: { parser: new ArvoPortfolioParser() },
          tradeImports: { parser: new TradeFileParser() },
          // Journal screenshots sit beside the statements, under the same local root.
          trading: { attachments: new LocalAttachmentStore(resolve(__dirname, '../../../..', config.storagePath, 'trading')) },
          // The Strategy Lab reads price files the user uploads and nothing else; there is no
          // market data driver here, and no code path from the lab to a network call.
          lab: { marketData: { parse: parseOhlcvFile } },
          // Markets: the quote provider is the manual one unless MARKET_DATA_DRIVER is set, so
          // a default install (and every test) has no path to a network call. The notifier
          // handles email and Telegram; the in-app copy is written by the core itself.
          markets: { quotes: createQuoteProvider(config.markets), notifier },
        }),
    },
  ],
  exports: [DataSource, FinanceCore, MARKETS_NOTIFIER],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async onApplicationShutdown() {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}
