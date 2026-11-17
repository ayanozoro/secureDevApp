'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, GitBranch, History, LayoutDashboard, Play, Settings, ShieldCheck, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useScan } from '@/lib/state/ScanProvider';
import { useGithub } from '@/lib/state/GithubProvider';
import { relativeTime } from '@/lib/utils/format';
import { useNow } from '@/hooks/useNow';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { latest, state } = useScan();
  const gh = useGithub();
  const now = useNow();

  const latestFindings = latest?.projects.reduce((n, p) => n + p.metrics.totalFindings, 0);
  const scansHref = latest ? `/scans/${encodeURIComponent(latest.id)}` : '/scans/new';
  const live = state.conn.streamA || state.conn.streamB;

  const items = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, active: pathname === '/' },
    {
      href: scansHref,
      label: 'Scans',
      icon: Activity,
      active: pathname.startsWith('/scans/') && pathname !== '/scans/new',
      badge: latestFindings != null ? String(latestFindings) : undefined,
    },
    { href: '/scans/new', label: 'Run scan', icon: Play, active: pathname === '/scans/new' },
    { href: '/scans', label: 'History', icon: History, active: pathname === '/scans' },
    { href: '/webhooks', label: 'Webhooks', icon: Webhook, active: pathname.startsWith('/webhooks'), live },
    { href: '/settings', label: 'Settings', icon: Settings, active: pathname.startsWith('/settings') },
  ];

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="px-4 pb-4 pt-5">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-cyan/40 bg-cyan/10 text-cyan">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-headline text-headline-sm leading-5 text-on-surface">SecureDevOps</div>
            <div className="font-mono text-label-caps uppercase text-cyan">OSV Vulnerability Intel</div>
          </div>
        </Link>
      </div>

      <div className="px-4 pb-4">
        <div className="label-caps mb-1.5">Repository context</div>
        {latest?.repo ? (
          <Link
            href={scansHref}
            onClick={onNavigate}
            className="flex items-center gap-2 rounded border border-line bg-tray px-3 py-2 font-mono text-mono-md text-on-surface hover:border-cyan/40"
          >
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-secondary" />
            <span className="truncate">{latest.repo}</span>
          </Link>
        ) : (
          <div className="rounded border border-dashed border-line px-3 py-2 text-body-sm text-outline">No scan loaded yet</div>
        )}
      </div>

      <nav aria-label="Primary" className="flex-1 px-2">
        <div className="label-caps px-2 pb-2">Command stream</div>
        <ul className="space-y-0.5">
          {items.map((it) => (
            <li key={it.label}>
              <Link
                href={it.href}
                onClick={onNavigate}
                aria-current={it.active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded px-3 py-2 text-body-md transition-colors',
                  it.active
                    ? 'bg-raised text-secondary before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded before:bg-cyan'
                    : 'text-on-surface-variant hover:bg-tray hover:text-on-surface',
                )}
              >
                <it.icon className="h-4 w-4" />
                <span className="flex-1">{it.label}</span>
                {it.badge && <span className="rounded bg-surface-container-high px-1.5 py-px font-mono text-mono-sm text-on-surface-variant">{it.badge}</span>}
                {it.live && (
                  <span className="rounded bg-cyan/15 px-1.5 py-px font-mono text-label-caps text-cyan" title="A live event stream is connected">
                    LIVE
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-line p-3">
        <div className="flex items-center gap-2 px-1 font-mono text-mono-sm text-outline">
          <span className={cn('h-1.5 w-1.5 rounded-full', state.lastSync ? 'bg-cyan' : 'bg-outline-variant')} />
          Last sync: {state.lastSync ? relativeTime(state.lastSync, now) : 'pending'}
        </div>
        {gh.authenticated && gh.user ? (
          <Link href="/settings" onClick={onNavigate} className="flex items-center gap-2 rounded border border-line bg-tray p-2 hover:border-cyan/40">
            {gh.user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gh.user.avatar_url} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-raised font-mono text-mono-sm">{gh.user.login.slice(0, 2).toUpperCase()}</div>
            )}
            <div className="min-w-0">
              <div className="truncate font-mono text-mono-md text-on-surface">@{gh.user.login}</div>
              <div className="label-caps">GitHub authorized</div>
            </div>
          </Link>
        ) : (
          <Link href="/settings" onClick={onNavigate} className="block rounded border border-dashed border-line p-2 text-center text-body-sm text-on-surface-variant hover:border-cyan/40 hover:text-secondary">
            Connect GitHub
          </Link>
        )}
      </div>
    </div>
  );
}
