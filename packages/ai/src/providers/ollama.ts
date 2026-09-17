import { AIProviderError, mapProviderError, type AIProvider, type ChatMessage, type ChatRequest, type ProviderEvent } from '../types';
import { parseArguments } from './anthropic';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  tool_name?: string;
}

export function toOllamaMessages(system: string, messages: ChatMessage[]): OllamaMessage[] {
  return [
    { role: 'system', content: system },
    ...messages.map((m): OllamaMessage => {
      if (m.role === 'user') return { role: 'user', content: m.content };
      if (m.role === 'assistant') {
        return { role: 'assistant', content: m.content, ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.input } })) } : {}) };
      }
      return { role: 'tool', content: m.content, tool_name: m.name };
    }),
  ];
}

/** Local models through Ollama's /api/chat (tool calling needs a tools-capable model, e.g. llama3.1). */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama' as const;
  readonly cloud = false;

  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({
          model: this.model,
          stream: true,
          messages: toOllamaMessages(request.system, request.messages),
          ...(request.tools?.length ? { tools: request.tools.map((t) => ({ type: 'function', function: t })) } : {}),
          options: { num_predict: request.maxTokens ?? 4096 },
        }),
      });
    } catch (error) {
      throw mapProviderError('Ollama', error);
    }
    if (!response.ok || !response.body) throw mapProviderError('Ollama', { status: response.status });

    const decoder = new TextDecoder();
    let buffer = '';
    let reason: 'stop' | 'tool_calls' | 'length' | 'other' = 'stop';
    let index = 0;
    const calls: ProviderEvent[] = [];
    const handle = function* (line: string): Generator<ProviderEvent> {
      if (!line.trim()) return;
      let chunk: { message?: OllamaMessage; done?: boolean; done_reason?: string; error?: string };
      try {
        chunk = JSON.parse(line) as typeof chunk;
      } catch {
        throw new AIProviderError('AI_BAD_RESPONSE', 'Ollama returned malformed output');
      }
      if (chunk.error) throw new AIProviderError('AI_BAD_RESPONSE', 'Ollama could not answer (is the model pulled and tools-capable?)');
      if (chunk.message?.content) yield { type: 'text', delta: chunk.message.content };
      for (const call of chunk.message?.tool_calls ?? []) {
        calls.push({ type: 'tool_call', call: { id: `ollama_${index++}`, name: call.function.name, input: parseArguments(call.function.arguments) } });
      }
      if (chunk.done) reason = chunk.done_reason === 'length' ? 'length' : 'stop';
    };
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          yield* handle(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      }
      yield* handle(buffer);
    } catch (error) {
      throw mapProviderError('Ollama', error);
    }
    yield* calls;
    yield { type: 'finish', reason: calls.length ? 'tool_calls' : reason };
  }
}
