/** JSON-lines logging to stderr (stdout is reserved for the stdio MCP transport). Never log tool arguments or results. */
export function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}): void {
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level, context: 'mcp', msg, ...fields })}\n`);
}
