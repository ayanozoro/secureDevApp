'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { initialState, reducer, type State } from './reducer';
import { useToast } from './ToastProvider';
import { vulnwatch } from '../api/vulnwatch';
import { securedevops } from '../api/securedevops';
import { connectSecuredevopsEvents, connectVulnwatchEvents } from '../api/events';
import { errorMessage } from '../api/http';
import type { LiveEvent, LogLine, ScanRun, WebhookEvent } from '../domain/types';
import { shortSha } from '../utils/format';

interface ScanContextValue {
  state: State;
  /** Most recent completed scan across both sources, if any. */
  latest?: ScanRun;
  getScan: (id: string) => ScanRun | undefined;
  addScan: (scan: ScanRun, event?: WebhookEvent) => void;
  refresh: () => Promise<void>;
  setSmeeUrl: (url: string) => void;
  dismissBanner: () => void;
  markRead: () => void;
  clearNotifications: () => void;
  clearLogs: () => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScan must be used inside <ScanProvider>');
  return ctx;
}

let uid = 0;
const nextId = (p: string) => `${p}-${Date.now()}-${++uid}`;

function scanToEvent(s: ScanRun): WebhookEvent | undefined {
  if (s.trigger !== 'push' && s.trigger !== 'pull_request') return undefined;
  return {
    id: `a-scan-${s.id}`,
    source: s.source,
    event: s.trigger,
    repo: s.repo ?? '',
    sha: s.commitSha,
    ref: s.ref,
    timestamp: s.scannedAt,
    findingsCount: s.projects.reduce((n, p) => n + p.metrics.totalFindings, 0),
    totalDependencies: s.projects.reduce((n, p) => n + p.metrics.totalDependencies, 0),
    projectsCount: s.projects.length,
    scanId: s.id,
  };
}

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const toast = useToast();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.allSettled([
      Promise.all([vulnwatch.scans(), vulnwatch.logs(), vulnwatch.status()]),
      Promise.all([securedevops.activity(), securedevops.info()]),
    ]);

    if (a.status === 'fulfilled') {
      const [scans, logs, status] = a.value;
      dispatch({
        type: 'scans',
        source: 'vulnwatch',
        scans,
        events: scans.map(scanToEvent).filter((e): e is WebhookEvent => Boolean(e)),
      });
      dispatch({ type: 'logs', source: 'vulnwatch', logs });
      dispatch({
        type: 'conn',
        patch: {
          backendA: 'up',
          ...(status.smee ? { smeeConnected: status.smee.connected, smeeMessage: status.smee.message } : {}),
        },
      });
    } else {
      dispatch({ type: 'conn', patch: { backendA: 'down' } });
      dispatch({ type: 'error', source: 'vulnwatch', message: errorMessage(a.reason) });
    }

    if (b.status === 'fulfilled') {
      const [activity, info] = b.value;
      dispatch({ type: 'scans', source: 'securedevops', scans: activity.scans, events: activity.events });
      dispatch({ type: 'conn', patch: { backendB: 'up' } });
      if (info.smeeUrl) dispatch({ type: 'smeeUrl', url: info.smeeUrl });
    } else {
      dispatch({ type: 'conn', patch: { backendB: 'down' } });
      dispatch({ type: 'error', source: 'securedevops', message: errorMessage(b.reason) });
    }
    dispatch({ type: 'loaded' });
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refresh(), 800);
  }, [refresh]);

  const onLive = useCallback(
    (e: LiveEvent) => {
      switch (e.kind) {
        case 'smee_status':
          dispatch({ type: 'conn', patch: { smeeConnected: e.connected, smeeMessage: e.message } });
          break;
        case 'stream_status':
          dispatch({ type: 'conn', patch: e.source === 'vulnwatch' ? { streamA: e.connected } : { streamB: e.connected } });
          break;
        case 'webhook': {
          dispatch({ type: 'eventAdded', event: e.event });
          const label = e.event.event.toUpperCase();
          const msg =
            e.event.event === 'ping'
              ? `Webhook ping received${e.event.repo ? ` from ${e.event.repo}` : ''}${e.event.message ? `: ${e.event.message}` : ''}`
              : `GitHub webhook received: ${label} on ${e.event.repo}`;
          toast(msg, 'info');
          dispatch({ type: 'notify', item: { id: nextId('n'), kind: 'info', message: msg, timestamp: new Date().toISOString() } });
          if (e.event.source === 'securedevops') {
            dispatch({
              type: 'logAdded',
              line: { id: nextId('l'), type: 'info', message: msg, timestamp: new Date().toISOString(), source: 'securedevops' },
            });
          }
          break;
        }
        case 'scan_completed': {
          dispatch({ type: 'scanAdded', scan: e.scan, event: e.event });
          const total = e.scan.projects.reduce((n, p) => n + p.metrics.totalFindings, 0);
          const repo = e.scan.repo ?? 'custom scan';
          const msg = `Scan completed for ${repo}${e.scan.commitSha ? ` (${shortSha(e.scan.commitSha)})` : ''}: ${total} ${total === 1 ? 'finding' : 'findings'}`;
          toast(msg, total > 0 ? 'error' : 'success');
          dispatch({
            type: 'notify',
            item: { id: nextId('n'), kind: total > 0 ? 'error' : 'success', message: msg, timestamp: new Date().toISOString(), href: `/scans/${encodeURIComponent(e.scan.id)}` },
          });
          dispatch({ type: 'banner', banner: { message: msg, href: `/scans/${encodeURIComponent(e.scan.id)}` } });
          if (e.scan.source === 'securedevops') {
            dispatch({
              type: 'logAdded',
              line: { id: nextId('l'), type: total > 0 ? 'warn' : 'success', message: msg, timestamp: new Date().toISOString(), source: 'securedevops' },
            });
          }
          scheduleRefresh();
          break;
        }
        case 'scan_failed': {
          const msg = `Scan failed${e.repo ? ` for ${e.repo}` : ''}: ${e.error}`;
          toast(msg, 'error');
          dispatch({ type: 'notify', item: { id: nextId('n'), kind: 'error', message: msg, timestamp: new Date().toISOString() } });
          break;
        }
        case 'log':
          dispatch({ type: 'logAdded', line: e.line as LogLine });
          break;
      }
    },
    [toast, scheduleRefresh],
  );

  useEffect(() => {
    void refresh();
    const closeA = connectVulnwatchEvents(onLive);
    const closeB = connectSecuredevopsEvents(onLive);
    return () => {
      closeA();
      closeB();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh, onLive]);

  const latest = useMemo(() => state.scans.find((s) => s.status === 'completed') ?? state.scans[0], [state.scans]);

  const getScan = useCallback(
    (id: string) => {
      const real = state.aliases[id] ?? id;
      return state.scans.find((s) => s.id === real || s.id === id);
    },
    [state.scans, state.aliases],
  );

  const value = useMemo<ScanContextValue>(
    () => ({
      state,
      latest,
      getScan,
      addScan: (scan, event) => dispatch({ type: 'scanAdded', scan, event }),
      refresh,
      setSmeeUrl: (url) => dispatch({ type: 'smeeUrl', url }),
      dismissBanner: () => dispatch({ type: 'banner', banner: undefined }),
      markRead: () => dispatch({ type: 'markRead' }),
      clearNotifications: () => dispatch({ type: 'clearNotifications' }),
      clearLogs: () => dispatch({ type: 'clearLogs' }),
    }),
    [state, latest, getScan, refresh],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}
