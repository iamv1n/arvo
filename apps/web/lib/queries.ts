'use client';

import type { TransactionType } from '@arvo/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  Account,
  BudgetStatusResult,
  GoalProgress,
  SavingsOpportunitiesResult,
  Scenario,
  ScenarioComparison,
  Category,
  ImportBatch,
  ImportRow,
  ImportRowDecision,
  ImportRowStatus,
  ImportSummary,
  HighlightsResult,
  SpendingPatterns,
  Merchant,
  MerchantSpend,
  MonthlyPoint,
  PeriodComparison,
  RecurringOverview,
  NetWorth,
  Page,
  PeriodSummary,
  Transaction,
  Transfer,
  CapitalGains,
  FundOverlap,
  Holding,
  HoldingDetail,
  PortfolioAllocation,
  PortfolioImportSummary,
  PortfolioReturns,
  PortfolioSummary,
  PortfolioImportBatch,
} from './types';

export const keys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  merchants: ['merchants'] as const,
  transactions: ['transactions'] as const,
  transfers: ['transfers'] as const,
  analytics: ['analytics'] as const,
  imports: ['imports'] as const,
  budgets: ['budgets'] as const,
  goals: ['goals'] as const,
  planning: ['planning'] as const,
  scenarios: ['scenarios'] as const,
  portfolio: ['portfolio'] as const,
  holdings: ['holdings'] as const,
  portfolioImports: ['portfolio-imports'] as const,
};

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  uncategorized?: boolean;
  merchantId?: string;
  withoutMerchant?: boolean;
  type?: TransactionType[];
  source?: string[];
  direction?: 'IN' | 'OUT';
  minAmount?: string;
  maxAmount?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const useAccounts = () =>
  useQuery({ queryKey: keys.accounts, queryFn: () => api<{ items: Account[] }>('/accounts').then((r) => r.items) });

export const useCategories = () =>
  useQuery({
    queryKey: keys.categories,
    queryFn: () => api<{ items: Category[] }>('/categories').then((r) => r.items),
    staleTime: 5 * 60_000,
  });

/** Merchants for name lookups (first 500 by name). Use useMerchantSearch for pickers. */
export const useMerchants = () =>
  useQuery({
    queryKey: keys.merchants,
    queryFn: () => api<Page<Merchant>>('/merchants', { query: { limit: 500 } }).then((r) => r.items),
    staleTime: 60_000,
  });

export const useMerchantSearch = (search: string) =>
  useQuery({
    queryKey: [...keys.merchants, 'search', search],
    queryFn: () => api<Page<Merchant>>('/merchants', { query: { search, limit: 20 } }).then((r) => r.items),
    placeholderData: keepPreviousData,
  });

export const useTransactions = (filters: TransactionFilters) =>
  useQuery({
    queryKey: [...keys.transactions, filters],
    queryFn: () => api<Page<Transaction>>('/transactions', { query: { ...filters } }),
    placeholderData: keepPreviousData,
  });

export const useTransfers = (page: { limit: number; offset: number }) =>
  useQuery({
    queryKey: [...keys.transfers, page],
    queryFn: () => api<Page<Transfer>>('/transfers', { query: { ...page } }),
    placeholderData: keepPreviousData,
  });

export interface Period {
  from: string;
  to: string;
  accountId?: string;
}

export const useSummary = (period: Period) =>
  useQuery({
    queryKey: [...keys.analytics, 'summary', period],
    queryFn: () => api<PeriodSummary>('/analytics/summary', { query: { ...period } }),
    placeholderData: keepPreviousData,
  });

export const useMonthly = (period: Period) =>
  useQuery({
    queryKey: [...keys.analytics, 'monthly', period],
    queryFn: () => api<{ items: MonthlyPoint[] }>('/analytics/monthly', { query: { ...period } }).then((r) => r.items),
    placeholderData: keepPreviousData,
  });

export const useNetWorth = () =>
  useQuery({ queryKey: [...keys.analytics, 'net-worth'], queryFn: () => api<NetWorth>('/analytics/net-worth') });

/** Any ledger change can affect balances, lists and analytics. */
export function useLedgerMutation<TInput, TResult = unknown>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(
        [keys.accounts, keys.transactions, keys.transfers, keys.analytics, keys.merchants, keys.categories, keys.budgets, keys.goals, keys.planning].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

export const useImports = (page: { limit: number; offset: number }) =>
  useQuery({
    queryKey: [...keys.imports, 'list', page],
    queryFn: () => api<Page<ImportBatch>>('/imports', { query: { ...page } }),
    placeholderData: keepPreviousData,
  });

export const useImportSummary = (id: string) =>
  useQuery({ queryKey: [...keys.imports, id], queryFn: () => api<ImportSummary>(`/imports/${id}`) });

export interface ImportRowFilter {
  status?: ImportRowStatus[];
  decision?: ImportRowDecision[];
  limit: number;
  offset: number;
}

export const useImportRows = (id: string, filter: ImportRowFilter, enabled = true) =>
  useQuery({
    queryKey: [...keys.imports, id, 'rows', filter],
    queryFn: () => api<Page<ImportRow>>(`/imports/${id}/rows`, { query: { ...filter } }),
    placeholderData: keepPreviousData,
    enabled,
  });

/** Import mutations refresh the import views; commits also refresh the ledger. */
export function useImportMutation<TInput, TResult = unknown>(fn: (input: TInput) => Promise<TResult>, options: { ledger?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      const targets: readonly (readonly string[])[] = options.ledger
        ? [keys.imports, keys.accounts, keys.transactions, keys.analytics, keys.merchants]
        : [keys.imports];
      await Promise.all(targets.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export const useComparison = (params: { from: string; to: string; previousFrom: string; previousTo: string }) =>
  useQuery({
    queryKey: [...keys.analytics, 'compare', params],
    queryFn: () => api<PeriodComparison>('/analytics/compare', { query: { ...params } }),
    placeholderData: keepPreviousData,
  });

export const useMerchantSpend = (period: Period) =>
  useQuery({
    queryKey: [...keys.analytics, 'merchants', period],
    queryFn: () => api<{ items: MerchantSpend[] }>('/analytics/merchants', { query: { ...period } }).then((r) => r.items),
    placeholderData: keepPreviousData,
  });

export const useRecurring = () =>
  useQuery({ queryKey: [...keys.analytics, 'recurring'], queryFn: () => api<RecurringOverview>('/analytics/recurring') });

export const useHighlights = () =>
  useQuery({ queryKey: [...keys.analytics, 'highlights'], queryFn: () => api<HighlightsResult>('/analytics/highlights') });

export const usePatterns = () =>
  useQuery({ queryKey: [...keys.analytics, 'patterns'], queryFn: () => api<SpendingPatterns>('/analytics/patterns') });

export const useBudgets = (month?: string) =>
  useQuery({
    queryKey: [...keys.budgets, month ?? 'current'],
    queryFn: () => api<BudgetStatusResult>('/budgets', { query: { month } }),
    placeholderData: keepPreviousData,
  });

export const useGoals = () =>
  useQuery({ queryKey: keys.goals, queryFn: () => api<{ asOf: string; goals: GoalProgress[] }>('/goals').then((r) => r.goals) });

export const useSavingsOpportunities = () =>
  useQuery({
    queryKey: [...keys.planning, 'savings'],
    queryFn: () => api<SavingsOpportunitiesResult>('/planning/savings-opportunities'),
  });

export const useScenarios = () =>
  useQuery({ queryKey: keys.scenarios, queryFn: () => api<{ items: Scenario[] }>('/scenarios').then((r) => r.items) });

export const useScenarioComparison = (ids: string[]) =>
  useQuery({
    queryKey: [...keys.scenarios, 'compare', ...ids],
    queryFn: () => api<ScenarioComparison>('/scenarios/compare', { query: { ids: ids.join(',') } }),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  });

// ---- portfolio ----

/**
 * Every portfolio query is keyed by the valuation date, so a report the user is reading never
 * silently changes underneath them. Writes invalidate the whole portfolio tree at once: one
 * transaction moves the summary, the allocation, the returns and the tax view together.
 */
export const usePortfolioSummary = (asOf?: string) =>
  useQuery({
    queryKey: [...keys.portfolio, 'summary', asOf ?? 'today'],
    queryFn: () => api<PortfolioSummary>('/portfolio/summary', { query: { asOf } }),
    placeholderData: keepPreviousData,
  });

export const usePortfolioAllocation = (asOf?: string) =>
  useQuery({
    queryKey: [...keys.portfolio, 'allocation', asOf ?? 'today'],
    queryFn: () => api<PortfolioAllocation>('/portfolio/allocation', { query: { asOf } }),
    placeholderData: keepPreviousData,
  });

export const usePortfolioReturns = (params: { asOf?: string; benchmark?: string } = {}) =>
  useQuery({
    queryKey: [...keys.portfolio, 'returns', params.asOf ?? 'today', params.benchmark ?? 'default'],
    queryFn: () => api<PortfolioReturns>('/portfolio/returns', { query: params }),
    placeholderData: keepPreviousData,
  });

export const useCapitalGains = (params: { asOf?: string; financialYear?: string } = {}) =>
  useQuery({
    queryKey: [...keys.portfolio, 'capital-gains', params.asOf ?? 'today', params.financialYear ?? 'current'],
    queryFn: () => api<CapitalGains>('/portfolio/capital-gains', { query: params }),
    placeholderData: keepPreviousData,
  });

export const useFundOverlap = (asOf?: string) =>
  useQuery({
    queryKey: [...keys.portfolio, 'overlap', asOf ?? 'today'],
    queryFn: () => api<FundOverlap>('/portfolio/overlap', { query: { asOf } }),
  });

export const useHoldings = () =>
  useQuery({ queryKey: keys.holdings, queryFn: () => api<{ items: Holding[] }>('/holdings').then((r) => r.items) });

export const useHolding = (id: string, asOf?: string) =>
  useQuery({
    queryKey: [...keys.holdings, id, asOf ?? 'today'],
    queryFn: () => api<HoldingDetail>(`/holdings/${id}`, { query: { asOf } }),
    enabled: Boolean(id),
  });

export const usePortfolioImports = () =>
  useQuery({
    queryKey: keys.portfolioImports,
    queryFn: () => api<{ items: PortfolioImportBatch[] }>('/portfolio/imports').then((r) => r.items),
  });

export const usePortfolioImport = (id: string | null) =>
  useQuery({
    queryKey: [...keys.portfolioImports, id],
    queryFn: () => api<PortfolioImportSummary>(`/portfolio/imports/${id}`),
    enabled: Boolean(id),
  });

/** Any write to holdings or imports refreshes every derived portfolio report. */
export function usePortfolioMutation<TInput, TResult = unknown>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.portfolio }),
        queryClient.invalidateQueries({ queryKey: keys.holdings }),
        queryClient.invalidateQueries({ queryKey: keys.portfolioImports }),
        queryClient.invalidateQueries({ queryKey: keys.goals }),
      ]);
    },
  });
}
