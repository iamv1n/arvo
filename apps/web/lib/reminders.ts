'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ReminderFrequency, ReminderSettings } from './types';

const KEY = ['me', 'reminders'];

export const useReminderSettings = () => useQuery({ queryKey: KEY, queryFn: () => api<ReminderSettings>('/me/reminders') });

export function useUpdateReminderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { frequency?: ReminderFrequency; day?: number | null; weeklyBriefing?: boolean }) => api<ReminderSettings>('/me/reminders', { method: 'PATCH', body: input }),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}

export function lastImportHint(settings: ReminderSettings | undefined): string {
  if (!settings) return 'Get a nudge by email when it has been a while since your last statement upload.';
  if (settings.daysSinceLastImport === null) return 'No statements imported yet.';
  const days = settings.daysSinceLastImport;
  return `Last import ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}. Reminders only go out if nothing is imported within the period.`;
}
