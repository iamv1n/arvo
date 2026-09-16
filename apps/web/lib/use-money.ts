'use client';

import { useCallback } from 'react';
import { formatMoney } from './format';
import { usePreferences } from './preferences';

/** Money formatter bound to the user's decimals preference (display only). */
export function useMoney() {
  const { preferences } = usePreferences();
  return useCallback(
    (amount: string | number, currency = 'INR', options: { compact?: boolean } = {}) =>
      formatMoney(amount, currency, { ...options, decimals: preferences.showDecimals }),
    [preferences.showDecimals],
  );
}
