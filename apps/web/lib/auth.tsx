'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionChange, refreshSession, setSession } from './api';
import type { TokenResponse, User } from './types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string; currency?: string; timezone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const reloadUser = useCallback(async () => {
    setUser(await api<User>('/me'));
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshSession().then(async (signedIn) => {
      if (cancelled) return;
      if (signedIn) await reloadUser().catch(() => setStatus('anonymous'));
      else setStatus('anonymous');
    });
    const unsubscribe = onSessionChange((signedIn) => {
      if (!signedIn) {
        setUser(null);
        setStatus('anonymous');
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [reloadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      setSession(await api<TokenResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }));
      await reloadUser();
    },
    [reloadUser],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (input) => {
      setSession(await api<TokenResponse>('/auth/register', { method: 'POST', body: input, auth: false }));
      await reloadUser();
    },
    [reloadUser],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {}, auth: false }).catch(() => undefined);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, user, login, register, logout, reloadUser }),
    [status, user, login, register, logout, reloadUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
