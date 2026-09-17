/*
 * Provider-neutral chat types. Drivers translate these to and from each vendor's API.
 */

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'fake';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Opaque vendor data that must be echoed back with the call (e.g. Gemini thought signatures). */
  meta?: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

/** A tool as offered to the model: JSON Schema parameters. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'other' };

export interface AIProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** True when data leaves this machine. */
  readonly cloud: boolean;
  /** Streams one model turn: text deltas, then any tool calls, then a finish event. */
  chat(request: ChatRequest): AsyncIterable<ProviderEvent>;
}

/** A provider failure with a stable code; messages never include credentials or prompts. */
export class AIProviderError extends Error {
  constructor(
    readonly code: 'AI_AUTH' | 'AI_RATE_LIMITED' | 'AI_UNAVAILABLE' | 'AI_BAD_RESPONSE' | 'AI_CONFIG',
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Maps an HTTP-ish failure from any SDK to an AIProviderError. */
export function mapProviderError(provider: string, error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  const status = typeof error === 'object' && error !== null ? Number((error as { status?: unknown }).status ?? (error as { code?: unknown }).code) : NaN;
  if (status === 401 || status === 403) return new AIProviderError('AI_AUTH', `${provider} rejected the API key or model access`, status);
  if (status === 429) return new AIProviderError('AI_RATE_LIMITED', `${provider} is rate limiting requests; try again shortly`, status);
  if (status === 400 || status === 404 || status === 422) return new AIProviderError('AI_BAD_RESPONSE', `${provider} rejected the request (check AI_MODEL)`, status);
  return new AIProviderError('AI_UNAVAILABLE', `${provider} is unavailable right now`, Number.isFinite(status) ? status : undefined);
}
