#!/usr/bin/env node
import 'reflect-metadata';
import { createFinanceStore, databaseOptions, loadRootEnv } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DataSource } from 'typeorm';
import { authenticate, toolContext } from './context';
import { createHttpServer } from './http';
import { log } from './logger';
import { createMcpServer } from './server';

/*
 * Arvo MCP server.
 *   HTTP (default):  node dist/main.js            → POST http://0.0.0.0:$MCP_PORT/mcp with Bearer token
 *   stdio:           ARVO_TOKEN=arvo_pat_… node dist/main.js --stdio
 */
async function main() {
  loadRootEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const dataSource = await new DataSource(databaseOptions(process.env.DATABASE_URL)).initialize();
  const core = new FinanceCore(createFinanceStore(dataSource));

  if (process.argv.includes('--stdio')) {
    const caller = await authenticate(dataSource, `Bearer ${process.env.ARVO_TOKEN ?? ''}`);
    const context = caller ? await toolContext(dataSource, core, caller.userId) : null;
    if (!context) throw new Error('ARVO_TOKEN must be a valid, unrevoked Arvo personal access token');
    await createMcpServer(context).connect(new StdioServerTransport());
    log('info', 'stdio server ready', { user_id: context.userId });
    return;
  }

  const port = Number(process.env.MCP_PORT ?? process.env.PORT ?? 3302);
  const server = createHttpServer(dataSource, core);
  server.listen(port, '0.0.0.0', () => log('info', 'http server ready', { port, endpoint: '/mcp' }));
  const shutdown = () => server.close(() => void dataSource.destroy().finally(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  log('error', 'startup failed', { error: String(error) });
  process.exit(1);
});
