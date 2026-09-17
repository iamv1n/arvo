'use client';

import type { ColorMode } from '@arvo/ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = ColorMode | 'system';

interface ThemeModeContextValue {
  mode: ColorMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = 'arvo.theme';
const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setPreferenceState(readPreference());
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode); preference lasts for this session only.
    }
  }, []);

  const mode: ColorMode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  const value = useMemo(() => ({ mode, preference, setPreference }), [mode, preference, setPreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useThemeMode must be used inside ThemeModeProvider');
  return context;
}
