import { runTool, type FinanceTool, type ToolContext, type ToolResult } from '@arvo/finance-tools';
import { toolSpec } from './schema';
import { AIProviderError, type AIProvider, type ChatMessage, type ToolCall } from './types';

/** What the advisor recorded about one tool call: shown to the user as "Data used". */
export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  /** One-line summary of the output (counts and headline fields, never full data). */
  summary: string;
  /** Provenance reported by the tool plus collection sizes, e.g. { as_of, transactions: 127 }. */
  dataUsed: Record<string, unknown>;
  error?: { code: string; message: string };
  durationMs: number;
}

export type AgentEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; record: ToolCallRecord };

export interface AgentResult {
  content: string;
  toolCalls: ToolCallRecord[];
  /** Tool rounds executed. */
  rounds: number;
  stopReason: 'complete' | 'max_rounds' | 'length';
}

export interface AgentOptions {
  provider: AIProvider;
  system: string;
  /** Earlier turns plus the new user message. */
  messages: ChatMessage[];
  tools: FinanceTool[];
  context: ToolContext;
  maxToolRounds?: number;
  onEvent?: (event: AgentEvent) => void | Promise<void>;
  signal?: AbortSignal;
  maxTokens?: number;
}

/** Tool output sent back to the model is capped so one large result can't blow the context. */
export const MAX_TOOL_RESULT_CHARS = 24_000;
export const DEFAULT_MAX_TOOL_ROUNDS = 6;
const OUT_OF_ROUNDS = 'I could not finish looking this up within the tool limit. Try a narrower question.';

/**
 * Multi-turn tool-calling loop: stream a model turn; run any requested tools (validated by the
 * shared finance tools) and feed results back; repeat up to maxToolRounds; then force a final
 * answer without further tool use.
 */
export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const { provider, system, tools, context, onEvent } = options;
  const maxRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const specs = tools.map(toolSpec);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const messages = [...options.messages];
  const records: ToolCallRecord[] = [];
  let content = '';

  for (let round = 0; ; round++) {
    const final = round >= maxRounds;
    let text = '';
    const calls: ToolCall[] = [];
    let finish: string = 'stop';
    const stream = provider.chat({
      system: final ? `${system}\n\nYou have used every tool call available for this answer. Do not call tools; answer now with what you have.` : system,
      messages,
      tools: specs,
      signal: options.signal,
      maxTokens: options.maxTokens,
    });
    for await (const event of stream) {
      if (event.type === 'text') {
        if (!text && content.trim() && !content.endsWith('\n')) await emitText('\n\n');
        text += event.delta;
        await emitText(event.delta);
      } else if (event.type === 'tool_call') calls.push(event.call);
      else finish = event.reason;
    }

    if (final || !calls.length) {
      if (final && calls.length && !text.trim()) await emitText(`${content ? '\n\n' : ''}${OUT_OF_ROUNDS}`);
      return {
        content: content.trim(),
        toolCalls: records,
        rounds: round,
        stopReason: final && calls.length ? 'max_rounds' : finish === 'length' ? 'length' : 'complete',
      };
    }

    messages.push({ role: 'assistant', content: text, toolCalls: calls });
    for (const call of calls) {
      await onEvent?.({ type: 'tool_call', id: call.id, name: call.name, input: call.input });
      const started = Date.now();
      const tool = byName.get(call.name);
      let result: ToolResult;
      try {
        result = tool
          ? await runTool(tool, context, call.input)
          : { ok: false, error: { code: 'UNKNOWN_TOOL', message: `There is no tool named ${call.name}` } };
      } catch (error) {
        if (error instanceof AIProviderError) throw error;
        result = { ok: false, error: { code: 'TOOL_FAILED', message: 'The tool failed unexpectedly' } };
      }
      const record = describeResult(call, result, Date.now() - started);
      records.push(record);
      await onEvent?.({ type: 'tool_result', record });
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: serializeResult(result) });
    }
  }

  async function emitText(delta: string) {
    content += delta;
    await onEvent?.({ type: 'delta', text: delta });
  }
}

export function serializeResult(result: ToolResult): string {
  const json = JSON.stringify(result.ok ? result.data : { error: result.error });
  return json.length > MAX_TOOL_RESULT_CHARS ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated]` : json;
}

const SCALAR_KEYS = ['as_of', 'asOf', 'month', 'from', 'to', 'period', 'currency', 'status', 'totalMonthly', 'total', 'yearlyImpact', 'suggestion_id'];

export function describeResult(call: ToolCall, result: ToolResult, durationMs: number): ToolCallRecord {
  if (!result.ok) {
    return { id: call.id, name: call.name, input: call.input, ok: false, summary: result.error.message, dataUsed: {}, error: { code: result.error.code, message: result.error.message }, durationMs };
  }
  const data = result.data;
  const dataUsed: Record<string, unknown> = {};
  const provenance = data.provenance;
  if (provenance && typeof provenance === 'object' && !Array.isArray(provenance)) Object.assign(dataUsed, provenance);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'provenance') continue;
    if (Array.isArray(value)) {
      dataUsed[key] ??= value.length;
      parts.push(`${value.length} ${key}`);
    } else if (SCALAR_KEYS.includes(key) && (typeof value === 'string' || typeof value === 'number')) {
      if (['from', 'to', 'month', 'asOf', 'as_of', 'period'].includes(key)) dataUsed[key] ??= value;
      parts.push(`${key} ${value}`);
    }
  }
  const summary = parts.join(' · ').slice(0, 300) || 'OK';
  return { id: call.id, name: call.name, input: call.input, ok: true, summary, dataUsed, durationMs };
}
