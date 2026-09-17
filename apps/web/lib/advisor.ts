'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { keys } from './queries';
import type { Highlight } from './types';

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'fake';

export interface AdvisorStatus {
  enabled: boolean;
  provider: ProviderName | null;
  providerLabel: string | null;
  model: string | null;
  cloud: boolean;
  adviceLevel: number;
  maxToolRounds: number;
  installDefault: { provider: ProviderName | 'none'; model: string | null };
  override: { provider: string | null; model: string | null };
  available: { provider: ProviderName; label: string; cloud: boolean; defaultModel: string; models: string[] }[];
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
  dataUsed: Record<string, unknown>;
  error?: { code: string; message: string };
  durationMs: number;
}

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'streaming' | 'error';
  toolCalls: ToolCallRecord[];
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type SuggestionKind = 'budget' | 'goal' | 'rule' | 'scenario';
export type SuggestionStatus = 'pending' | 'approved' | 'dismissed';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  payload: Record<string, unknown>;
  rationale: string;
  provenance: ToolCallRecord[];
  conversationId: string | null;
  messageId: string | null;
  edited: boolean;
  approvedAt: string | null;
  dismissedAt: string | null;
  appliedEntityId: string | null;
  createdAt: string;
}

export interface ConversationDetail extends Conversation {
  adviceLevel: number;
  messages: AdvisorMessage[];
  suggestions: Suggestion[];
}

export interface Briefing {
  version: 1;
  weekStart: string;
  weekEnd: string;
  asOf: string;
  currency: string;
  highlights: Highlight[];
  budgets: {
    month: string;
    percentOfMonthElapsed: number;
    total: { limit: string; spent: string; projected: string; percentUsed: number } | null;
    count: number;
    attention: { budgetId: string; categoryId: string; categoryName: string; limit: string; spent: string; projected: string; projectedOverspend: string; percentUsed: number; status: 'on_track' | 'at_risk' | 'over' }[];
  };
  goals: { goalId: string; name: string; status: 'on_track' | 'behind' | 'achieved'; percent: number; current: string; targetAmount: string; remaining: string; requiredMonthly: string; targetDate: string }[];
  savings: { month: string; totalMonthly: string; top: { id: string; kind: string; title: string; monthlySaving: string; confidence: string; basis: string }[] };
  upcoming: { label: string; amount: string; date: string; frequency: string }[];
  upload: { overdue: boolean; daysSinceLastImport: number | null } | null;
  decision: { kind: 'budget_over' | 'goal_behind' | 'savings' | 'upload' | 'none'; text: string };
}

export interface BriefingView {
  id: string;
  weekStart: string;
  asOf: string;
  data: Briefing;
  narrative: string | null;
  provider: string | null;
  model: string | null;
  emailedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const advisorKeys = {
  status: ['advisor', 'status'] as const,
  conversations: ['advisor', 'conversations'] as const,
  conversation: (id: string) => ['advisor', 'conversations', id] as const,
  suggestions: ['advisor', 'suggestions'] as const,
  briefing: ['advisor', 'briefing'] as const,
};

export const useAdvisorStatus = () => useQuery({ queryKey: advisorKeys.status, queryFn: () => api<AdvisorStatus>('/advisor/status'), staleTime: 60_000 });

export const useConversations = () =>
  useQuery({ queryKey: advisorKeys.conversations, queryFn: () => api<{ items: Conversation[] }>('/advisor/conversations').then((r) => r.items) });

export const useConversation = (id: string | null) =>
  useQuery({ queryKey: advisorKeys.conversation(id ?? 'none'), enabled: !!id, queryFn: () => api<ConversationDetail>(`/advisor/conversations/${id}`) });

export const useSuggestions = (status: SuggestionStatus | 'all' = 'pending') =>
  useQuery({ queryKey: [...advisorKeys.suggestions, status], queryFn: () => api<{ items: Suggestion[] }>('/advisor/suggestions', { query: { status } }).then((r) => r.items) });

export const useLatestBriefing = () =>
  useQuery({ queryKey: advisorKeys.briefing, queryFn: () => api<{ briefing: BriefingView | null }>('/advisor/briefings/latest').then((r) => r.briefing) });

export function useGenerateBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ briefing: BriefingView }>('/advisor/briefings/generate', { method: 'POST' }).then((r) => r.briefing),
    onSuccess: (briefing) => queryClient.setQueryData(advisorKeys.briefing, briefing),
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<Conversation>('/advisor/conversations', { method: 'POST', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: advisorKeys.conversations }),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/advisor/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: advisorKeys.conversations }),
  });
}

/** Approve (optionally with an edited payload) or dismiss; approval refreshes the ledger views it changes. */
export function useResolveSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, payload }: { id: string; action: 'approve' | 'dismiss'; payload?: Record<string, unknown> }) =>
      api<Suggestion>(`/advisor/suggestions/${id}/${action}`, { method: 'POST', body: action === 'approve' ? (payload ? { payload } : {}) : undefined }),
    onSuccess: async () => {
      await Promise.all(
        [advisorKeys.suggestions, ['advisor', 'conversations'], keys.budgets, keys.goals, keys.scenarios, ['rules']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export function useUpdateAdvisorSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider?: string | null; model?: string | null }) => api<AdvisorStatus>('/advisor/settings', { method: 'PATCH', body: input }),
    onSuccess: (data) => queryClient.setQueryData(advisorKeys.status, data),
  });
}

const TOOL_LABELS: Record<string, string> = {
  finance_get_accounts: 'Accounts',
  finance_get_account_balance: 'Account balance',
  finance_get_transactions: 'Transactions',
  finance_search_transactions: 'Transaction search',
  finance_get_cashflow: 'Cashflow',
  finance_get_spending_summary: 'Spending summary',
  finance_get_income_summary: 'Income summary',
  finance_get_net_worth: 'Net worth',
  finance_get_recurring_expenses: 'Recurring',
  finance_compare_periods: 'Period comparison',
  finance_get_financial_snapshot: 'Monthly snapshot',
  finance_analyze_spending: 'Spending patterns',
  finance_analyze_cashflow: 'Cashflow analysis',
  finance_get_highlights: 'Highlights',
  finance_get_budget_status: 'Budget status',
  finance_get_goals: 'Goals',
  finance_get_savings_opportunities: 'Savings opportunities',
  finance_check_affordability: 'Affordability',
  finance_run_what_if: 'What-if',
  draft_budget: 'Budget draft',
  draft_goal: 'Goal draft',
  draft_categorization_rule: 'Rule draft',
  draft_scenario: 'Scenario draft',
};

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? name.replace(/^finance_/, '').replace(/_/g, ' ');

export const SUGGESTED_PROMPTS = ['How can I spend ₹5,000 less a month?', 'Can I afford a ₹70,000 phone in December?', 'Am I on track for my goals?'];
