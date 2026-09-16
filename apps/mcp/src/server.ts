import { FINANCE_TOOLS, runTool, type ToolContext } from '@arvo/finance-tools';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { log } from './logger';

export const SERVER_INFO = { name: 'arvo-finance', version: '0.1.0' };

const INSTRUCTIONS = [
  "Arvo exposes the user's personal finance data through read-only, business-level tools.",
  'All amounts are decimal strings in the stated currency; negative transaction amounts are money leaving an account.',
  'Transfers between the user\'s own accounts are never income or spending.',
  'Use the numbers returned by tools as-is; do not recompute totals. Mention the period and provenance when answering.',
].join(' ');

/**
 * Builds an MCP server bound to one authenticated user. A new server is created per request
 * (HTTP) or per process (stdio), so tool handlers can never see another user's context.
 */
export function createMcpServer(context: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  for (const tool of FINANCE_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
      },
      async (args: unknown) => {
        const started = performance.now();
        try {
          const result = await runTool(tool, context, args);
          log('info', 'tool_call', {
            tool: tool.name,
            user_id: context.userId,
            status: result.ok ? 'ok' : 'error',
            error_code: result.ok ? null : result.error.code,
            duration_ms: Math.round(performance.now() - started),
          });
          if (!result.ok) {
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: result.error }) }] };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result.data) }],
            structuredContent: result.data,
          };
        } catch (error) {
          log('error', 'tool_call_failed', { tool: tool.name, user_id: context.userId, error: String(error) });
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'The tool failed unexpectedly' } }) }],
          };
        }
      },
    );
  }
  return server;
}
