import { createFinanceStore, databaseOptions } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { ArvoPortfolioParser, ArvoStatementParser, LocalAttachmentStore, LocalFileStore, TradeFileParser } from '@arvo/imports';
import { resolve } from 'node:path';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      inject: [APP_CONFIG],
      useFactory: async (config: AppConfig) =>
        new DataSource(databaseOptions(config.databaseUrl)).initialize(),
    },
    {
      provide: FinanceCore,
      inject: [DataSource, APP_CONFIG],
      useFactory: (dataSource: DataSource, config: AppConfig) =>
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
        }),
    },
  ],
  exports: [DataSource, FinanceCore],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async onApplicationShutdown() {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}
