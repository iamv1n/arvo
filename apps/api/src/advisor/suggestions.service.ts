import { applySuggestion, type SuggestionKind, type ToolCallRecord } from '@arvo/ai';
import { AdvisorSuggestionEntity, type AdvisorSuggestionStatus } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { AdvisorProviders } from './advisor-providers';
import { localParts } from './local-time';

export interface SuggestionView {
  id: string;
  kind: SuggestionKind;
  status: AdvisorSuggestionStatus;
  payload: Record<string, unknown>;
  rationale: string;
  provenance: ToolCallRecord[];
  conversationId: string | null;
  messageId: string | null;
  edited: boolean;
  approvedAt: Date | null;
  dismissedAt: Date | null;
  appliedEntityId: string | null;
  createdAt: Date;
}

export function presentSuggestion(s: AdvisorSuggestionEntity): SuggestionView {
  return {
    id: s.id,
    kind: s.kind,
    status: s.status,
    payload: s.payload,
    rationale: s.rationale,
    provenance: s.provenance as ToolCallRecord[],
    conversationId: s.conversationId,
    messageId: s.messageId,
    edited: s.edited,
    approvedAt: s.approvedAt,
    dismissedAt: s.dismissedAt,
    appliedEntityId: s.appliedEntityId,
    createdAt: s.createdAt,
  };
}

/** Suggest, you approve: approval is the only path that persists a drafted budget, goal, rule or scenario. */
@Injectable()
export class SuggestionsService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(AdvisorProviders) private readonly providers: AdvisorProviders,
  ) {}

  private get repo() {
    return this.dataSource.getRepository(AdvisorSuggestionEntity);
  }

  async create(input: {
    userId: string;
    kind: SuggestionKind;
    payload: Record<string, unknown>;
    rationale: string;
    provenance: ToolCallRecord[];
    conversationId: string | null;
    messageId: string | null;
  }): Promise<SuggestionView> {
    return presentSuggestion(await this.repo.save(this.repo.create({ ...input, status: 'pending' })));
  }

  async list(userId: string, status?: AdvisorSuggestionStatus): Promise<SuggestionView[]> {
    const rows = await this.repo.find({ where: { userId, ...(status ? { status } : {}) }, order: { createdAt: 'DESC' }, take: 100 });
    return rows.map(presentSuggestion);
  }

  async approve(userId: string, id: string, editedPayload?: Record<string, unknown>): Promise<SuggestionView> {
    const suggestion = await this.require(userId, id);
    this.assertPending(suggestion);
    // Claim first so concurrent approvals can't apply twice.
    const claimed = await this.repo.update({ id, userId, status: 'pending' }, { status: 'approved', approvedAt: new Date() });
    if (!claimed.affected) throw notPending();

    const user = await this.providers.user(userId);
    const payload = editedPayload ?? suggestion.payload;
    try {
      const result = await applySuggestion(this.core, userId, suggestion.kind, payload, { currency: user.currency, asOf: localParts(user.timezone).date });
      const edited = editedPayload !== undefined && JSON.stringify(result.payload) !== JSON.stringify(suggestion.payload);
      await this.repo.save(this.repo.merge(suggestion, { status: 'approved', approvedAt: new Date(), payload: result.payload, appliedEntityId: result.entityId, edited }));
    } catch (error) {
      await this.repo.update({ id }, { status: 'pending', approvedAt: null });
      throw error;
    }
    return presentSuggestion(await this.require(userId, id));
  }

  async dismiss(userId: string, id: string): Promise<SuggestionView> {
    this.assertPending(await this.require(userId, id));
    const updated = await this.repo.update({ id, userId, status: 'pending' }, { status: 'dismissed', dismissedAt: new Date() });
    if (!updated.affected) throw notPending();
    return presentSuggestion(await this.require(userId, id));
  }

  private async require(userId: string, id: string): Promise<AdvisorSuggestionEntity> {
    const suggestion = await this.repo.findOneBy({ id, userId });
    if (!suggestion) throw new ApiError(HttpStatus.NOT_FOUND, 'SUGGESTION_NOT_FOUND', 'Suggestion not found');
    return suggestion;
  }

  private assertPending(suggestion: AdvisorSuggestionEntity) {
    if (suggestion.status !== 'pending') throw notPending();
  }
}

const notPending = () => new ApiError(HttpStatus.CONFLICT, 'SUGGESTION_NOT_PENDING', 'This suggestion was already approved or dismissed');
