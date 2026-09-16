'use client';

import type { TransactionType } from '@arvo/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  Account,
  Category,
  ImportBatch,
  ImportRow,
  ImportRowDecision,
  ImportRowStatus,
  ImportSummary,
  Merchant,
  MonthlyPoint,
  NetWorth,
  Page,
  PeriodSummary,
  Transaction,
  Transfer,
} from './types';

export const keys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  merchants: ['merchants'] as const,
  transactions: ['transactions'] as const,
  transfers: ['transfers'] as const,
  analytics: ['analytics'] as const,
  imports: ['imports'] as const,
};

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  merchantId?: string;
  type?: TransactionType[];
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

export const useMerchants = () =>
  useQuery({ queryKey: keys.merchants, queryFn: () => api<{ items: Merchant[] }>('/merchants').then((r) => r.items) });

export const useTransactions = (filters: TransactionFilters) =>
  useQuery({
    queryKey: [...keys.transactions, filters],
    queryFn: () => api<Page<Transaction>>('/transactions', { query: { ...filters } }),
    placeholderData: keepPreviousData,
  });

export const useTransfers = () =>
  useQuery({ queryKey: keys.transfers, queryFn: () => api<{ items: Transfer[] }>('/transfers').then((r) => r.items) });

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
        [keys.accounts, keys.transactions, keys.transfers, keys.analytics, keys.merchants, keys.categories].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

export const useImports = () =>
  useQuery({ queryKey: keys.imports, queryFn: () => api<{ items: ImportBatch[] }>('/imports').then((r) => r.items) });

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
