import type { AIProvider, ChatRequest, ProviderEvent } from '../types';

export interface FakeTurn {
  text?: string;
  toolCalls?: { name: string; input?: Record<string, unknown> }[];
}

export type FakeScript = FakeTurn[] | ((request: ChatRequest, turn: number) => FakeTurn);

/**
 * Deterministic provider for tests and offline demos. With no script it follows directives in
 * the latest user message: lines like `[tool:finance_get_goals {}]` (one per line) become tool calls; without
 * directives it calls finance_get_highlights. Once tool results are in, it answers with a short
 * summary naming the tools used.
 */
export class FakeProvider implements AIProvider {
  readonly name = 'fake' as const;
  readonly cloud = false;
  /** Every request received, for assertions. */
  readonly requests: ChatRequest[] = [];

  constructor(
    readonly model = 'fake-1',
    private readonly script: FakeScript = defaultScript,
  ) {}

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    const turn = this.requests.length;
    this.requests.push(request);
    const next = typeof this.script === 'function' ? this.script(request, turn) : (this.script[turn] ?? { text: 'Done.' });
    if (next.text) {
      for (const piece of next.text.match(/\S+\s*/g) ?? []) yield { type: 'text', delta: piece };
    }
    const calls = next.toolCalls ?? [];
    for (const [i, call] of calls.entries()) {
      yield { type: 'tool_call', call: { id: `fake_${turn}_${i}`, name: call.name, input: call.input ?? {} } };
    }
    yield { type: 'finish', reason: calls.length ? 'tool_calls' : 'stop' };
  }
}

function defaultScript(request: ChatRequest): FakeTurn {
  const messages = request.messages;
  const lastUser = messages.map((m, i) => [m, i] as const).filter(([m]) => m.role === 'user').at(-1);
  if (!lastUser) return { text: 'Ask me about your money.' };
  const results = messages.slice(lastUser[1] + 1).filter((m) => m.role === 'tool');
  if (!request.tools?.length) return { text: 'Here is your week in brief, using only the figures provided.' };
  if (results.length) {
    const names = [...new Set(results.map((m) => (m.role === 'tool' ? m.name : '')))];
    return { text: `I checked ${names.join(', ')}. Every figure above comes from those results.` };
  }
  const content = lastUser[0].role === 'user' ? lastUser[0].content : '';
  const directives = [...content.matchAll(/^\[tool:([a-z_]+)\s*(\{.*\})?\]\s*$/gm)].map((m) => ({
    name: m[1]!,
    input: m[2] ? (JSON.parse(m[2]) as Record<string, unknown>) : {},
  }));
  return { text: 'Let me look at your data. ', toolCalls: directives.length ? directives : [{ name: 'finance_get_highlights' }] };
}
