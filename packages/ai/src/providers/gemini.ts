import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { mapProviderError, type AIProvider, type ChatMessage, type ChatRequest, type ProviderEvent } from '../types';

export function toGeminiContents(messages: ChatMessage[]): Content[] {
  const out: Content[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] });
    else if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const call of m.toolCalls ?? []) {
        const signature = call.meta?.thoughtSignature;
        parts.push({ functionCall: { id: call.id, name: call.name, args: call.input }, ...(typeof signature === 'string' ? { thoughtSignature: signature } : {}) });
      }
      if (parts.length) out.push({ role: 'model', parts });
    } else {
      let response: Record<string, unknown>;
      try {
        response = { output: JSON.parse(m.content) as unknown };
      } catch {
        response = { output: m.content };
      }
      const part: Part = { functionResponse: { id: m.toolCallId, name: m.name, response } };
      const last = out.at(-1);
      if (last?.role === 'user' && last.parts?.every((p) => p.functionResponse)) last.parts.push(part);
      else out.push({ role: 'user', parts: [part] });
    }
  }
  return out;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  readonly cloud = true;
  private readonly client: GoogleGenAI;

  constructor(
    readonly model: string,
    apiKey: string,
    client?: GoogleGenAI,
  ) {
    this.client = client ?? new GoogleGenAI({ apiKey });
  }

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    let reason: 'stop' | 'tool_calls' | 'length' | 'other' = 'stop';
    let count = 0;
    const calls: ProviderEvent[] = [];
    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: toGeminiContents(request.messages),
        config: {
          systemInstruction: request.system,
          maxOutputTokens: request.maxTokens ?? 4096,
          abortSignal: request.signal,
          ...(request.tools?.length
            ? { tools: [{ functionDeclarations: request.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] }
            : {}),
        },
      });
      for await (const chunk of stream) {
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (part.text && !part.thought) yield { type: 'text', delta: part.text };
          if (part.functionCall?.name) {
            calls.push({
              type: 'tool_call',
              call: {
                id: part.functionCall.id ?? `gemini_${count++}`,
                name: part.functionCall.name,
                input: part.functionCall.args ?? {},
                ...(part.thoughtSignature ? { meta: { thoughtSignature: part.thoughtSignature } } : {}),
              },
            });
          }
        }
        const finish = candidate?.finishReason;
        if (finish) reason = finish === 'STOP' ? 'stop' : finish === 'MAX_TOKENS' ? 'length' : 'other';
      }
    } catch (error) {
      throw mapProviderError('Gemini', error);
    }
    yield* calls;
    yield { type: 'finish', reason: calls.length ? 'tool_calls' : reason };
  }
}
