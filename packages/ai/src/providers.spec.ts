import { loadAIConfig, configuredProviders, createProvider, resolveProvider } from './config';
import { toAnthropicMessages } from './providers/anthropic';
import { toGeminiContents } from './providers/gemini';
import { OllamaProvider, toOllamaMessages } from './providers/ollama';
import { toOpenAIMessages } from './providers/openai';
import type { ChatMessage, ProviderEvent } from './types';

const conversation: ChatMessage[] = [
  { role: 'user', content: 'Budgets?' },
  { role: 'assistant', content: 'Checking.', toolCalls: [{ id: 'c1', name: 'a', input: { x: 1 }, meta: { thoughtSignature: 'sig' } }, { id: 'c2', name: 'b', input: {} }] },
  { role: 'tool', toolCallId: 'c1', name: 'a', content: '{"ok":1}' },
  { role: 'tool', toolCallId: 'c2', name: 'b', content: 'plain' },
];

describe('provider message mapping', () => {
  it('anthropic groups tool results into one user turn', () => {
    const out = toAnthropicMessages(conversation);
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'c1', name: 'a', input: { x: 1 } }, { type: 'tool_use', id: 'c2', name: 'b', input: {} }] });
    expect(out[2]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1' }, { type: 'tool_result', tool_use_id: 'c2' }] });
  });

  it('openai uses a system message and tool_call ids', () => {
    const out = toOpenAIMessages('sys', conversation);
    expect(out[0]).toEqual({ role: 'system', content: 'sys' });
    expect(out[2]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'a', arguments: '{"x":1}' } }, { id: 'c2' }] });
    expect(out[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"ok":1}' });
  });

  it('gemini echoes thought signatures and groups function responses', () => {
    const out = toGeminiContents(conversation);
    expect(out).toHaveLength(3);
    expect(out[1]!.parts![1]).toMatchObject({ functionCall: { id: 'c1', name: 'a' }, thoughtSignature: 'sig' });
    expect(out[2]!.parts).toEqual([
      { functionResponse: { id: 'c1', name: 'a', response: { output: { ok: 1 } } } },
      { functionResponse: { id: 'c2', name: 'b', response: { output: 'plain' } } },
    ]);
  });

  it('ollama streams NDJSON text and tool calls', async () => {
    expect(toOllamaMessages('sys', conversation)[4]).toEqual({ role: 'tool', content: 'plain', tool_name: 'b' });
    const body = [
      JSON.stringify({ message: { role: 'assistant', content: 'Hi ' } }),
      JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'finance_get_goals', arguments: {} } }] } }),
      JSON.stringify({ done: true, done_reason: 'stop' }),
    ].join('\n');
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (url: string, init: { body: string }) => {
      sent = { url, body: JSON.parse(init.body) as Record<string, unknown> };
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new OllamaProvider('llama3.1', 'http://localhost:11434/', fetchImpl);
    const events: ProviderEvent[] = [];
    for await (const e of provider.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }] })) events.push(e);
    expect(sent!.url).toBe('http://localhost:11434/api/chat');
    expect(sent!.body).toMatchObject({ model: 'llama3.1', stream: true, tools: [{ type: 'function', function: { name: 't' } }] });
    expect(events).toEqual([
      { type: 'text', delta: 'Hi ' },
      { type: 'tool_call', call: { id: 'ollama_0', name: 'finance_get_goals', input: {} } },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const failing = new OllamaProvider('m', 'http://x', (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch);
    await expect(failing.chat({ system: 's', messages: [] })[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
  });
});

describe('AI config', () => {
  it('defaults to disabled and validates values', () => {
    expect(loadAIConfig({}).config).toMatchObject({ provider: 'none', adviceLevel: 2, maxToolRounds: 6 });
    expect(resolveProvider(loadAIConfig({}).config)).toBeNull();
    expect(loadAIConfig({ AI_PROVIDER: 'skynet', ADVICE_LEVEL: '9' }).problems).toHaveLength(2);
    expect(loadAIConfig({ AI_PROVIDER: 'anthropic' }).problems).toEqual(['AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY']);
  });

  it('resolves per-user overrides only among configured providers', () => {
    const { config } = loadAIConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', OLLAMA_BASE_URL: 'http://localhost:11434', AI_MODEL: 'claude-opus-5' });
    expect(configuredProviders(config)).toEqual(['anthropic', 'ollama']);
    expect(resolveProvider(config)).toEqual({ provider: 'anthropic', model: 'claude-opus-5' });
    expect(resolveProvider(config, { provider: 'ollama' })).toEqual({ provider: 'ollama', model: 'llama3.1' });
    expect(resolveProvider(config, { provider: 'openai', model: 'gpt-5' })).toEqual({ provider: 'anthropic', model: 'gpt-5' });
    expect(resolveProvider(config, { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    const provider = createProvider(config, { provider: 'anthropic', model: 'claude-sonnet-5' });
    expect(provider).toMatchObject({ name: 'anthropic', model: 'claude-sonnet-5', cloud: true });
    expect(createProvider(config, { provider: 'ollama', model: 'llama3.1' }).cloud).toBe(false);
  });
});
