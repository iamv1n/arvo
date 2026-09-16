'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PeriodKey } from './periods';

/** Per-browser UI preferences. Stored in localStorage only; never sent to the server. */
export interface Preferences {
  tableDensity: 'small' | 'middle' | 'large';
  pageSize: number;
  /** Limit table height and scroll inside it, keeping the header visible. */
  compactTables: boolean;
  stripedRows: boolean;
  showDecimals: boolean;
  defaultPeriod: PeriodKey;
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  /** tableId → column keys the user hid. */
  hiddenColumns: Record<string, string[]>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  tableDensity: 'middle',
  pageSize: 50,
  compactTables: true,
  stripedRows: false,
  showDecimals: true,
  defaultPeriod: 'this-month',
  reduceMotion: false,
  sidebarCollapsed: false,
  hiddenColumns: {},
};

const STORAGE_KEY = 'arvo.preferences.v1';

interface PreferencesContextValue {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  setHiddenColumns: (tableId: string, keys: string[]) => void;
  reset: () => void;
  /** True once preferences were read from storage (avoids flashing defaults into layout decisions). */
  ready: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function read(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed, hiddenColumns: { ...(parsed.hiddenColumns ?? {}) } };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function write(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage unavailable (private mode, quota); preferences last for this session only.
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreferences(read());
    setReady(true);
  }, []);

  const commit = useCallback((next: (current: Preferences) => Preferences) => {
    setPreferences((current) => {
      const value = next(current);
      write(value);
      return value;
    });
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => commit((current) => ({ ...current, ...patch })), [commit]);
  const setHiddenColumns = useCallback(
    (tableId: string, keys: string[]) =>
      commit((current) => ({ ...current, hiddenColumns: { ...current.hiddenColumns, [tableId]: keys } })),
    [commit],
  );
  const reset = useCallback(() => commit(() => DEFAULT_PREFERENCES), [commit]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = preferences.reduceMotion ? 'true' : 'false';
  }, [preferences.reduceMotion]);

  const value = useMemo(
    () => ({ preferences, update, setHiddenColumns, reset, ready }),
    [preferences, update, setHiddenColumns, reset, ready],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}

/** True when either the OS or the user's Arvo preference asks for less motion. */
export function useReducedMotion(): boolean {
  const { preferences } = usePreferences();
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSystem(query.matches);
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return system || preferences.reduceMotion;
}
