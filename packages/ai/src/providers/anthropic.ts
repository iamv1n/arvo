import Anthropic from '@anthropic-ai/sdk';
import { mapProviderError, type AIProvider, type ChatMessage, type ChatRequest, type ProviderEvent } from '../types';

type Block = Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam;

/** Converts neutral messages; consecutive tool results become one user turn of tool_result blocks. */
export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const content: Block[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls ?? []) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      if (content.length) out.push({ role: 'assistant', content });
    } else {
      const block: Anthropic.ToolResultBlockParam = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = out.at(-1);
      if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) {
        (last.content as Block[]).push(block);
      } else out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;
  readonly cloud = true;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    apiKey: string,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ apiKey, maxRetries: 2 });
  }

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    const tools = request.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema }));
    const pending = new Map<number, { id: string; name: string; json: string }>();
    let reason: 'stop' | 'tool_calls' | 'length' | 'other' = 'stop';
    try {
      const stream = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: request.maxTokens ?? 4096,
          system: request.system,
          messages: toAnthropicMessages(request.messages),
          ...(tools?.length ? { tools } : {}),
          stream: true,
        },
        { signal: request.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          pending.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: '' });
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') yield { type: 'text', delta: event.delta.text };
          else if (event.delta.type === 'input_json_delta') {
            const block = pending.get(event.index);
            if (block) block.json += event.delta.partial_json;
          }
        } else if (event.type === 'message_delta' && event.delta.stop_reason) {
          const stop = event.delta.stop_reason;
          reason = stop === 'end_turn' || stop === 'stop_sequence' ? 'stop' : stop === 'tool_use' ? 'tool_calls' : stop === 'max_tokens' ? 'length' : 'other';
        }
      }
    } catch (error) {
      throw mapProviderError('Anthropic', error);
    }
    for (const block of [...pending.entries()].sort(([a], [b]) => a - b).map(([, b]) => b)) {
      yield { type: 'tool_call', call: { id: block.id, name: block.name, input: parseArguments(block.json) } };
    }
    yield { type: 'finish', reason };
  }
}

/** Parses streamed JSON arguments; malformed input becomes {} and fails tool validation visibly. */
export function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
