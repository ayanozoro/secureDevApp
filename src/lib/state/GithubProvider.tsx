'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { vulnwatch } from '../api/vulnwatch';
import { errorMessage } from '../api/http';
import type { GithubUser } from '../domain/types';
import { useScan } from './ScanProvider';

interface GithubContextValue {
  status: 'loading' | 'ready' | 'error';
  authenticated: boolean;
  user?: GithubUser;
  error?: string;
  refresh: () => Promise<void>;
  connectToken: (token: string) => Promise<GithubUser>;
  disconnect: () => Promise<void>;
}

const GithubContext = createContext<GithubContextValue | null>(null);

export function useGithub(): GithubContextValue {
  const ctx = useContext(GithubContext);
  if (!ctx) throw new Error('useGithub must be used inside <GithubProvider>');
  return ctx;
}

export function GithubProvider({ children }: { children: React.ReactNode }) {
  const { setSmeeUrl } = useScan();
  const [status, setStatus] = useState<GithubContextValue['status']>('loading');
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<GithubUser | undefined>();
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const data = await vulnwatch.authStatus();
      if (data.smeeUrl) setSmeeUrl(data.smeeUrl);
      setAuthenticated(Boolean(data.authenticated && data.user));
      setUser(data.authenticated ? data.user : undefined);
      setError(undefined);
      setStatus('ready');
    } catch (err) {
      setAuthenticated(false);
      setUser(undefined);
      setError(errorMessage(err));
      setStatus('error');
    }
  }, [setSmeeUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connectToken = useCallback(
    async (token: string) => {
      const data = await vulnwatch.saveToken(token);
      await refresh();
      return data.user;
    },
    [refresh],
  );

  const disconnect = useCallback(async () => {
    await vulnwatch.logout();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, authenticated, user, error, refresh, connectToken, disconnect }),
    [status, authenticated, user, error, refresh, connectToken, disconnect],
  );
  return <GithubContext.Provider value={value}>{children}</GithubContext.Provider>;
}
