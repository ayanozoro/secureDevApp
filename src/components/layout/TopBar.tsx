'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useScan } from '@/lib/state/ScanProvider';
import { useGithub } from '@/lib/state/GithubProvider';
import { useToast } from '@/lib/state/ToastProvider';
import { errorMessage } from '@/lib/api/http';
import { usePopover } from '@/hooks/usePopover';
import { relativeTime } from '@/lib/utils/format';
import { useNow } from '@/hooks/useNow';

function StatusPill({ label, value, tone, href }: { label: string; value: string; tone: 'ok' | 'warn' | 'off'; href?: string }) {
  const body = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-1 font-mono text-mono-sm uppercase',
        tone === 'ok' && 'border-cyan/30 bg-cyan/10 text-secondary',
        tone === 'warn' && 'border-severity-medium/30 bg-severity-medium/10 text-severity-medium',
        tone === 'off' && 'border-line bg-tray text-outline',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', tone === 'ok' && 'animate-pulse')} aria-hidden />
      {label}: <strong className="font-semibold">{value}</strong>
    </span>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Notifications() {
  const { state, markRead, clearNotifications } = useScan();
  const { open, setOpen, ref } = usePopover();
  const now = useNow();
  return (
    <div ref={ref} className="relative">
      <button
        aria-label={`Notifications${state.unread ? `, ${state.unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) markRead();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded border border-line bg-tray text-on-surface-variant hover:border-cyan/40 hover:text-secondary"
      >
        <Bell className="h-4 w-4" />
        {state.unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-severity-critical px-1 font-mono text-[10px] text-white">
            {state.unread > 9 ? '9+' : state.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] animate-fadeIn rounded-lg border border-line bg-raised shadow-raised">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="label-caps">Session notifications</span>
            {state.notifications.length > 0 && (
              <button onClick={clearNotifications} className="text-body-sm text-outline hover:text-on-surface">
                Clear
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {state.notifications.length === 0 && <li className="px-3 py-6 text-center text-body-sm text-outline">No events yet in this session. Live webhook and scan events appear here.</li>}
            {state.notifications.map((n) => {
              const inner = (
                <>
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.kind === 'error' ? 'bg-severity-critical' : n.kind === 'success' ? 'bg-severity-safe' : 'bg-cyan')} />
                  <span className="flex-1 break-words text-body-sm text-on-surface">{n.message}</span>
                  <span className="shrink-0 font-mono text-mono-sm text-outline">{relativeTime(n.timestamp, now)}</span>
                </>
              );
              return (
                <li key={n.id} className="border-b border-line/60 last:border-0">
                  {n.href ? (
                    <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-2 px-3 py-2 hover:bg-tray">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex gap-2 px-3 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line px-3 py-2 text-body-sm text-outline">Notifications are kept in memory only and reset on reload.</div>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const gh = useGithub();
  const toast = useToast();
  const { open, setOpen, ref } = usePopover();
  if (!gh.authenticated || !gh.user) {
    return (
      <Link href="/settings" className="hidden h-9 items-center rounded border border-line bg-tray px-3 font-mono text-mono-md text-on-surface-variant hover:border-cyan/40 hover:text-secondary sm:inline-flex">
        Connect GitHub
      </Link>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1.5 rounded border border-line bg-tray px-1.5 hover:border-cyan/40"
      >
        {gh.user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gh.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-raised font-mono text-[10px]">{gh.user.login.slice(0, 2).toUpperCase()}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-outline" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 animate-fadeIn rounded-lg border border-line bg-raised p-1 shadow-raised">
          <div className="border-b border-line px-3 py-2">
            <div className="truncate text-body-md text-on-surface">{gh.user.name || gh.user.login}</div>
            <div className="truncate font-mono text-mono-sm text-outline">@{gh.user.login}</div>
          </div>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded px-3 py-2 text-body-md text-on-surface-variant hover:bg-tray hover:text-on-surface">
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              try {
                await gh.disconnect();
                toast('GitHub disconnected.', 'info');
              } catch (err) {
                toast(`Failed to disconnect: ${errorMessage(err)}`, 'error');
              }
            }}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-body-md text-severity-critical hover:bg-tray"
          >
            <LogOut className="h-4 w-4" /> Disconnect GitHub
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { state, latest } = useScan();
  const gh = useGithub();
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { conn } = state;
  const smee =
    conn.smeeConnected === null
      ? { v: 'Unknown', t: 'off' as const }
      : conn.smeeConnected
        ? { v: 'Online', t: 'ok' as const }
        : { v: 'Reconnecting', t: 'warn' as const };
  const stream = conn.streamA || conn.streamB ? { v: 'Active', t: 'ok' as const } : { v: 'Offline', t: 'off' as const };
  const ghp = gh.authenticated && gh.user ? { v: `@${gh.user.login}`, t: 'ok' as const } : { v: 'Not linked', t: 'off' as const };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (!state.loaded) {
      toast('Scans are still loading. Try again in a moment.', 'info');
      return;
    }
    if (!latest) {
      toast('No scan is loaded yet. Run a scan first to search its findings.', 'info');
      return;
    }
    router.push(`/scans/${encodeURIComponent(latest.id)}?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/80 px-4 py-2.5 backdrop-blur-md md:px-6">
      <button aria-label="Open navigation" onClick={onMenu} className="flex h-9 w-9 items-center justify-center rounded border border-line bg-tray text-on-surface-variant lg:hidden">
        <Menu className="h-4 w-4" />
      </button>
      <div className="hidden items-center gap-2 md:flex">
        <StatusPill label="Smee" value={smee.v} tone={smee.t} />
        <StatusPill label="Stream" value={stream.v} tone={stream.t} />
        <StatusPill label="GitHub" value={ghp.v} tone={ghp.t} href="/settings" />
      </div>
      <div className="flex-1" />
      <form onSubmit={submit} role="search" className="relative w-full max-w-xs lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search findings of the latest scan"
          placeholder="Search latest scan: CVE, GHSA, package…"
          className="input h-9 pl-9 pr-10 font-mono text-mono-md"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] text-outline sm:block">⌘K</kbd>
      </form>
      <Notifications />
      <AccountMenu />
    </header>
  );
}
