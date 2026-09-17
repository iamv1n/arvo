import { advisorSystemPrompt, AIProviderError, createDraftTools, runAgent, type AgentEvent, type AIProvider, type ChatMessage, type ToolCallRecord } from '@arvo/ai';
import { AdvisorConversationEntity, AdvisorMessageEntity, AdvisorSuggestionEntity, UserEntity } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { FINANCE_TOOLS } from '@arvo/finance-tools';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { AdvisorProviders } from './advisor-providers';
import { localParts } from './local-time';
import { presentSuggestion, SuggestionsService, type SuggestionView } from './suggestions.service';

export const DEFAULT_TITLE = 'New conversation';
const HISTORY_MESSAGES = 20;

export type AdvisorStreamEvent =
  | { event: 'delta'; data: { text: string } }
  | { event: 'tool_call'; data: { id: string; name: string; input: Record<string, unknown> } }
  | { event: 'tool_result'; data: ToolCallRecord }
  | { event: 'suggestion'; data: SuggestionView }
  | { event: 'done'; data: { message: MessageView; adviceLevel: number; stopReason: string } }
  | { event: 'error'; data: { code: string; message: string; messageId: string } };

export interface MessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: string;
  toolCalls: ToolCallRecord[];
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  createdAt: Date;
}

const presentConversation = (c: AdvisorConversationEntity) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt });

const presentMessage = (m: AdvisorMessageEntity): MessageView => ({
  id: m.id,
  role: m.role,
  content: m.content,
  status: m.status,
  toolCalls: m.toolCalls as ToolCallRecord[],
  provider: m.provider,
  model: m.model,
  errorCode: m.errorCode,
  createdAt: m.createdAt,
});

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger('advisor');
  /** One answer at a time per user. */
  private readonly inFlight = new Set<string>();

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(AdvisorProviders) private readonly providers: AdvisorProviders,
    @Inject(SuggestionsService) private readonly suggestions: SuggestionsService,
  ) {}

  private get conversations() {
    return this.dataSource.getRepository(AdvisorConversationEntity);
  }

  private get messages() {
    return this.dataSource.getRepository(AdvisorMessageEntity);
  }

  async list(userId: string) {
    const rows = await this.conversations.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 100 });
    return { items: rows.map(presentConversation) };
  }

  async create(userId: string, title?: string) {
    this.providers.providerFor(await this.providers.user(userId));
    const conversation = await this.conversations.save(this.conversations.create({ userId, title: title?.trim() || DEFAULT_TITLE }));
    return presentConversation(conversation);
  }

  async get(userId: string, id: string) {
    const conversation = await this.require(userId, id);
    const [messages, suggestions] = await Promise.all([
      this.messages.find({ where: { conversationId: id, userId }, order: { createdAt: 'ASC' } }),
      this.dataSource.getRepository(AdvisorSuggestionEntity).find({ where: { conversationId: id, userId }, order: { createdAt: 'ASC' } }),
    ]);
    return {
      ...presentConversation(conversation),
      adviceLevel: this.providers.adviceLevel,
      messages: messages.map(presentMessage),
      suggestions: suggestions.map(presentSuggestion),
    };
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.conversations.delete({ id, userId });
  }

  /**
   * Checks everything that can fail before streaming starts (so errors are plain JSON), saves the
   * user message and returns a runner that streams the answer.
   */
  async prepareMessage(userId: string, conversationId: string, content: string) {
    const user = await this.providers.user(userId);
    const provider = this.providers.providerFor(user);
    const conversation = await this.require(userId, conversationId);
    if (this.inFlight.has(userId)) throw new ApiError(HttpStatus.CONFLICT, 'AI_BUSY', 'The advisor is still answering your previous question');
    this.inFlight.add(userId);
    try {
      return await this.start(user, provider, conversation, content);
    } catch (error) {
      this.inFlight.delete(userId);
      throw error;
    }
  }

  private async start(user: UserEntity, provider: AIProvider, conversation: AdvisorConversationEntity, content: string) {
    const userId = user.id;
    const conversationId = conversation.id;

    const history = await this.messages.find({ where: { conversationId, userId }, order: { createdAt: 'DESC' }, take: HISTORY_MESSAGES });
    await this.messages.save(this.messages.create({ conversationId, userId, role: 'user', content, status: 'complete' }));
    if (conversation.title === DEFAULT_TITLE) conversation.title = titleFrom(content);
    conversation.updatedAt = new Date();
    await this.conversations.save(conversation);
    const assistant = await this.messages.save(
      this.messages.create({ conversationId, userId, role: 'assistant', content: '', status: 'streaming', provider: provider.name, model: provider.model }),
    );

    const messages: ChatMessage[] = [
      ...history
        .reverse()
        .filter((m) => m.status === 'complete' && m.content)
        .map((m): ChatMessage => (m.role === 'user' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.content })),
      { role: 'user', content },
    ];

    return async (emit: (event: AdvisorStreamEvent) => void, signal: AbortSignal): Promise<void> => {
      const records: ToolCallRecord[] = [];
      let partial = '';
      try {
        const today = localParts(user.timezone).date;
        const context = { core: this.core, userId, currency: user.currency, today };
        const drafts = createDraftTools({
          create: async ({ kind, payload, rationale }) => {
            const suggestion = await this.suggestions.create({ userId, kind, payload, rationale, provenance: [...records], conversationId, messageId: assistant.id });
            emit({ event: 'suggestion', data: suggestion });
            return { id: suggestion.id };
          },
        });
        const result = await runAgent({
          provider,
          system: advisorSystemPrompt({ today, currency: user.currency, adviceLevel: this.providers.adviceLevel, userName: user.name }),
          messages,
          tools: [...FINANCE_TOOLS, ...drafts],
          context,
          maxToolRounds: this.providers.maxToolRounds,
          signal,
          onEvent: (event: AgentEvent) => {
            if (event.type === 'delta') {
              partial += event.text;
              emit({ event: 'delta', data: { text: event.text } });
            } else if (event.type === 'tool_call') emit({ event: 'tool_call', data: { id: event.id, name: event.name, input: event.input } });
            else {
              records.push(event.record);
              emit({ event: 'tool_result', data: event.record });
            }
          },
        });
        await this.messages.update({ id: assistant.id }, { content: result.content, toolCalls: result.toolCalls, status: 'complete' });
        emit({
          event: 'done',
          data: { message: presentMessage({ ...assistant, content: result.content, toolCalls: result.toolCalls, status: 'complete' }), adviceLevel: this.providers.adviceLevel, stopReason: result.stopReason },
        });
      } catch (error) {
        const aborted = signal.aborted;
        const code = error instanceof AIProviderError ? error.code : aborted ? 'AI_ABORTED' : 'AI_FAILED';
        const message = error instanceof AIProviderError ? error.message : 'The advisor could not finish this answer';
        // Codes only: prompts and financial data are never logged.
        this.logger.warn({ msg: 'advisor answer failed', user_id: userId, provider: provider.name, code, status: error instanceof AIProviderError ? error.status : undefined });
        if (!(error instanceof AIProviderError) && !aborted) this.logger.debug?.({ msg: 'advisor failure detail', error: String(error) });
        await this.messages.update({ id: assistant.id }, { content: partial, toolCalls: records, status: 'error', errorCode: code });
        emit({ event: 'error', data: { code, message, messageId: assistant.id } });
      } finally {
        this.inFlight.delete(userId);
      }
    };
  }

  private async require(userId: string, id: string): Promise<AdvisorConversationEntity> {
    const conversation = await this.conversations.findOneBy({ id, userId });
    if (!conversation) throw new ApiError(HttpStatus.NOT_FOUND, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    return conversation;
  }
}

function titleFrom(content: string): string {
  const line = content.replace(/\s+/g, ' ').trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || DEFAULT_TITLE;
}
