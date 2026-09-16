import type { FinanceCore } from '@arvo/finance-core';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { DataSource } from 'typeorm';
import { authenticate, toolContext } from './context';
import { log } from './logger';
import { createMcpServer } from './server';

const MAX_BODY_BYTES = 1024 * 1024;

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
}

/**
 * Stateless Streamable HTTP endpoint at POST /mcp. Every request carries a personal access token
 * (Authorization: Bearer arvo_pat_…); a fresh MCP server bound to that token's user handles it.
 */
export function createHttpServer(dataSource: DataSource, core: FinanceCore): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok' });
      if (url.pathname === '/ready' && req.method === 'GET') {
        await dataSource.query('SELECT 1');
        return json(res, 200, { status: 'ready' });
      }
      if (url.pathname !== '/mcp') return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
      if (req.method !== 'POST') {
        return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'This server is stateless; use POST' } }, { Allow: 'POST' });
      }

      const caller = await authenticate(dataSource, req.headers.authorization);
      const context = caller ? await toolContext(dataSource, core, caller.userId) : null;
      if (!caller || !context) {
        log('warn', 'unauthorized', { path: url.pathname });
        return json(
          res,
          401,
          { error: { code: 'UNAUTHENTICATED', message: 'A valid Arvo personal access token is required' } },
          { 'WWW-Authenticate': 'Bearer realm="arvo-mcp"' },
        );
      }

      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
        return json(res, tooLarge ? 413 : 400, { error: { code: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_JSON', message: 'Invalid request body' } });
      }

      const server = createMcpServer(context);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      log('error', 'request_failed', { path: url.pathname, error: String(error) });
      if (!res.headersSent) json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
    }
  });
}
