import OpenAI from 'openai';
import { mapProviderError, type AIProvider, type ChatMessage, type ChatRequest, type ProviderEvent } from '../types';
import { parseArguments } from './anthropic';

export function toOpenAIMessages(system: string, messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) }
          : {}),
      });
    } else out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
  }
  return out;
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  readonly cloud = true;
  private readonly client: OpenAI;

  constructor(
    readonly model: string,
    apiKey: string,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI({ apiKey, maxRetries: 2 });
  }

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    const calls = new Map<number, { id: string; name: string; args: string }>();
    let reason: 'stop' | 'tool_calls' | 'length' | 'other' = 'stop';
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: toOpenAIMessages(request.system, request.messages),
          max_completion_tokens: request.maxTokens ?? 4096,
          ...(request.tools?.length
            ? { tools: request.tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })) }
            : {}),
          stream: true,
        },
        { signal: request.signal },
      );
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;
        if (choice.delta.content) yield { type: 'text', delta: choice.delta.content };
        for (const part of choice.delta.tool_calls ?? []) {
          const call = calls.get(part.index) ?? { id: '', name: '', args: '' };
          if (part.id) call.id = part.id;
          if (part.function?.name) call.name += part.function.name;
          if (part.function?.arguments) call.args += part.function.arguments;
          calls.set(part.index, call);
        }
        if (choice.finish_reason) {
          const f = choice.finish_reason;
          reason = f === 'stop' ? 'stop' : f === 'tool_calls' ? 'tool_calls' : f === 'length' ? 'length' : 'other';
        }
      }
    } catch (error) {
      throw mapProviderError('OpenAI', error);
    }
    for (const [index, call] of [...calls.entries()].sort(([a], [b]) => a - b)) {
      yield { type: 'tool_call', call: { id: call.id || `call_${index}`, name: call.name, input: parseArguments(call.args) } };
    }
    yield { type: 'finish', reason };
  }
}
