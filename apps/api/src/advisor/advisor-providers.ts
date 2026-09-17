import {
  CLOUD_PROVIDERS,
  configuredProviders,
  createProvider,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  resolveProvider,
  SUGGESTED_MODELS,
  type AIProvider,
  type ProviderChoice,
  type ProviderName,
} from '@arvo/ai';
import { UserEntity } from '@arvo/database';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

/** Builds a provider for a choice. Tests replace it to script the model. */
export const AI_PROVIDER_FACTORY = Symbol('AI_PROVIDER_FACTORY');
export type AIProviderFactory = (choice: ProviderChoice) => AIProvider;

export interface AdvisorStatus {
  enabled: boolean;
  provider: ProviderName | null;
  providerLabel: string | null;
  model: string | null;
  /** True when questions and financial data are sent to a third-party service. */
  cloud: boolean;
  adviceLevel: number;
  maxToolRounds: number;
  installDefault: { provider: ProviderName | 'none'; model: string | null };
  override: { provider: string | null; model: string | null };
  available: { provider: ProviderName; label: string; cloud: boolean; defaultModel: string; models: string[] }[];
}

@Injectable()
export class AdvisorProviders {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(AI_PROVIDER_FACTORY) private readonly factory: AIProviderFactory,
  ) {}

  get adviceLevel(): number {
    return this.config.ai.adviceLevel;
  }

  get maxToolRounds(): number {
    return this.config.ai.maxToolRounds;
  }

  async user(userId: string): Promise<UserEntity> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId });
    if (!user) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'User no longer exists');
    return user;
  }

  choiceFor(user: Pick<UserEntity, 'aiProvider' | 'aiModel'>): ProviderChoice | null {
    return resolveProvider(this.config.ai, { provider: user.aiProvider, model: user.aiModel });
  }

  /** The user's provider, or a 503 AI_DISABLED explaining how to enable it. */
  providerFor(user: Pick<UserEntity, 'aiProvider' | 'aiModel'>): AIProvider {
    const choice = this.choiceFor(user);
    if (!choice) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'AI_DISABLED',
        'The AI advisor is turned off on this install. Set AI_PROVIDER (anthropic, openai, gemini or ollama) and its API key or OLLAMA_BASE_URL, then restart the API.',
      );
    }
    return this.factory(choice);
  }

  async status(userId: string): Promise<AdvisorStatus> {
    const user = await this.user(userId);
    const choice = this.choiceFor(user);
    const ai = this.config.ai;
    return {
      enabled: !!choice,
      provider: choice?.provider ?? null,
      providerLabel: choice ? PROVIDER_LABELS[choice.provider]! : null,
      model: choice?.model ?? null,
      cloud: !!choice && CLOUD_PROVIDERS.includes(choice.provider),
      adviceLevel: ai.adviceLevel,
      maxToolRounds: ai.maxToolRounds,
      installDefault: { provider: ai.provider, model: ai.provider === 'none' ? null : (ai.model ?? DEFAULT_MODELS[ai.provider]) },
      override: { provider: user.aiProvider, model: user.aiModel },
      available: configuredProviders(ai).map((provider) => ({
        provider,
        label: PROVIDER_LABELS[provider]!,
        cloud: CLOUD_PROVIDERS.includes(provider),
        defaultModel: provider === ai.provider && ai.model ? ai.model : DEFAULT_MODELS[provider],
        models: [...new Set([...(provider === ai.provider && ai.model ? [ai.model] : []), ...SUGGESTED_MODELS[provider]])],
      })),
    };
  }

  async updateOverride(userId: string, input: { provider?: string | null; model?: string | null }): Promise<AdvisorStatus> {
    const patch: Partial<UserEntity> = {};
    if (input.provider !== undefined) {
      if (input.provider !== null && !configuredProviders(this.config.ai).includes(input.provider as ProviderName)) {
        throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'AI_PROVIDER_NOT_CONFIGURED', `${input.provider} is not configured on this install`);
      }
      patch.aiProvider = input.provider;
      if (input.model === undefined) patch.aiModel = null;
    }
    if (input.model !== undefined) patch.aiModel = input.model?.trim() || null;
    if (Object.keys(patch).length) await this.dataSource.getRepository(UserEntity).update({ id: userId }, patch);
    return this.status(userId);
  }
}

export const defaultProviderFactory =
  (config: AppConfig): AIProviderFactory =>
  (choice) =>
    createProvider(config.ai, choice);
