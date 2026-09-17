import { AnthropicProvider } from './providers/anthropic';
import { FakeProvider } from './providers/fake';
import { GeminiProvider } from './providers/gemini';
import { OllamaProvider } from './providers/ollama';
import { OpenAIProvider } from './providers/openai';
import { AIProviderError, type AIProvider, type ProviderName } from './types';

export const PROVIDER_NAMES: ProviderName[] = ['anthropic', 'openai', 'gemini', 'ollama', 'fake'];
export const CLOUD_PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'gemini'];

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5-mini',
  gemini: 'gemini-2.5-flash',
  ollama: 'llama3.1',
  fake: 'fake-1',
};

/** Suggested model ids per provider for the settings picker (any id is accepted). */
export const SUGGESTED_MODELS: Record<ProviderName, string[]> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-5-mini', 'gpt-5', 'gpt-4.1'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  ollama: ['llama3.1', 'qwen2.5', 'mistral-nemo'],
  fake: ['fake-1'],
};

export interface AIConfig {
  /** Install default; none disables the advisor's AI features. */
  provider: ProviderName | 'none';
  /** Model for the default provider (AI_MODEL). */
  model: string | null;
  /** Highest advice level the advisor may operate at (0-4, default 2). */
  adviceLevel: number;
  maxToolRounds: number;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  ollamaBaseUrl: string | null;
}

/** Reads AI settings from the environment. Returns problems instead of throwing so hosts can fail fast their own way. */
export function loadAIConfig(env: NodeJS.ProcessEnv = process.env): { config: AIConfig; problems: string[] } {
  const problems: string[] = [];
  const raw = (env.AI_PROVIDER?.trim().toLowerCase() || 'none') as AIConfig['provider'];
  const provider = raw === 'none' || PROVIDER_NAMES.includes(raw) ? raw : 'none';
  if (provider !== raw) problems.push('AI_PROVIDER must be none, anthropic, openai, gemini, ollama or fake');

  const int = (name: string, fallback: number, min: number, max: number) => {
    const value = env[name]?.trim();
    if (!value) return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} must be an integer from ${min} to ${max}`);
      return fallback;
    }
    return n;
  };

  const config: AIConfig = {
    provider,
    model: env.AI_MODEL?.trim() || null,
    adviceLevel: int('ADVICE_LEVEL', 2, 0, 4),
    maxToolRounds: int('AI_MAX_TOOL_ROUNDS', 6, 1, 12),
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    openaiApiKey: env.OPENAI_API_KEY?.trim() || null,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
    ollamaBaseUrl: env.OLLAMA_BASE_URL?.trim() || null,
  };
  if (provider !== 'none' && !configuredProviders(config).includes(provider)) {
    problems.push(`AI_PROVIDER=${provider} needs ${credentialName(provider)}`);
  }
  return { config, problems };
}

function credentialName(provider: ProviderName): string {
  return { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', ollama: 'OLLAMA_BASE_URL', fake: '' }[provider];
}

/** Providers usable on this install: the advisor is on and the provider has credentials. */
export function configuredProviders(config: AIConfig): ProviderName[] {
  if (config.provider === 'none') return [];
  const out: ProviderName[] = [];
  if (config.anthropicApiKey) out.push('anthropic');
  if (config.openaiApiKey) out.push('openai');
  if (config.geminiApiKey) out.push('gemini');
  if (config.ollamaBaseUrl) out.push('ollama');
  if (config.provider === 'fake') out.push('fake');
  return out;
}

export interface ProviderChoice {
  provider: ProviderName;
  model: string;
}

/** Resolves the provider and model for a user: their override when it is configured, else the install default. */
export function resolveProvider(config: AIConfig, override?: { provider?: string | null; model?: string | null }): ProviderChoice | null {
  if (config.provider === 'none') return null;
  const available = configuredProviders(config);
  const wanted = override?.provider as ProviderName | undefined;
  const provider = wanted && available.includes(wanted) ? wanted : config.provider;
  if (!available.includes(provider)) return null;
  const model = override?.model?.trim() || (provider === config.provider ? config.model : null) || DEFAULT_MODELS[provider];
  return { provider, model };
}

export function createProvider(config: AIConfig, choice: ProviderChoice): AIProvider {
  const missing = () => new AIProviderError('AI_CONFIG', `${choice.provider} is not configured`);
  switch (choice.provider) {
    case 'anthropic':
      if (!config.anthropicApiKey) throw missing();
      return new AnthropicProvider(choice.model, config.anthropicApiKey);
    case 'openai':
      if (!config.openaiApiKey) throw missing();
      return new OpenAIProvider(choice.model, config.openaiApiKey);
    case 'gemini':
      if (!config.geminiApiKey) throw missing();
      return new GeminiProvider(choice.model, config.geminiApiKey);
    case 'ollama':
      if (!config.ollamaBaseUrl) throw missing();
      return new OllamaProvider(choice.model, config.ollamaBaseUrl);
    case 'fake':
      return new FakeProvider(choice.model);
  }
}
