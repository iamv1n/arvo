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
  const port = Number(process.env.MCP_PORT ?? process.env.PORT ?? 3302);
  const resourceUrl = process.env.MCP_RESOURCE_URL?.trim() || process.env.NEXT_PUBLIC_MCP_URL?.trim() || `http://localhost:${port}/mcp`;
  const authorizationServer = process.env.PUBLIC_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3301';

  if (process.argv.includes('--stdio')) {
    // stdio uses a personal access token from the environment (the MCP spec's STDIO guidance).
    const caller = await authenticate(dataSource, `Bearer ${process.env.ARVO_TOKEN ?? ''}`, resourceUrl);
    const context = caller ? await toolContext(dataSource, core, caller.userId) : null;
    if (!context) throw new Error('ARVO_TOKEN must be a valid, unrevoked Arvo personal access token');
    await createMcpServer(context).connect(new StdioServerTransport());
    log('info', 'stdio server ready', { user_id: context.userId });
    return;
  }

  const server = createHttpServer(dataSource, core, { resourceUrl, authorizationServer });
  server.listen(port, '0.0.0.0', () => log('info', 'http server ready', { port, resource: resourceUrl, authorization_server: authorizationServer }));
  const shutdown = () => server.close(() => void dataSource.destroy().finally(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  log('error', 'startup failed', { error: String(error) });
  process.exit(1);
});
