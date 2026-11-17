'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, History, Play, Search } from 'lucide-react';
import { useScan } from '@/lib/state/ScanProvider';
import { useGithub } from '@/lib/state/GithubProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendNotice } from '@/components/layout/BackendNotice';
import { Chip, TriggerChip, triggerLabel } from '@/components/ui/Badge';
import { LinkButtonClasses } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { SEVERITY_STYLE } from '@/lib/domain/severity';
import { aggregateMetrics } from '@/lib/domain/normalize';
import { relativeTime, shortSha } from '@/lib/utils/format';
import { useNow } from '@/hooks/useNow';
import type { ScanRun, Trigger } from '@/lib/domain/types';

const TRIGGERS: Trigger[] = ['push', 'pull_request', 'manual-repo', 'manual-raw', 'simulated', 'unknown'];

function SeverityBar({ scan }: { scan: ScanRun }) {
  const c = aggregateMetrics(scan.projects).severityCounts;
  const total = c.critical + c.high + c.medium + c.low + c.unknown;
  if (total === 0) return <span className="font-mono text-mono-sm text-outline">0</span>;
  const seg: [keyof typeof SEVERITY_STYLE, number][] = [['CRITICAL', c.critical], ['HIGH', c.high], ['MEDIUM', c.medium], ['LOW', c.low], ['UNKNOWN', c.unknown]];
  return (
    <div className="flex items-center gap-2" title={`${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low} low`}>
      <div className="flex h-2 w-24 overflow-hidden rounded bg-raised" aria-hidden>
        {seg.map(([k, n]) => n > 0 && <div key={k} className={SEVERITY_STYLE[k].bar} style={{ width: `${(n / total) * 100}%` }} />)}
      </div>
      <span className="font-mono text-mono-sm text-on-surface-variant">{total}</span>
    </div>
  );
}

export function HistoryView() {
  const { state, refresh } = useScan();
  const gh = useGithub();
  const router = useRouter();
  const now = useNow();
  const [source, setSource] = useState<'all' | 'vulnwatch' | 'securedevops'>('all');
  const [trigger, setTrigger] = useState<'all' | Trigger>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(
    () =>
      state.scans.filter(
        (s) =>
          (source === 'all' || s.source === source) &&
          (trigger === 'all' || s.trigger === trigger) &&
          (!q.trim() || (s.repo ?? '').toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [state.scans, source, trigger, q],
  );

  const header = (
    <PageHeader
      eyebrow="Scans"
      title="Scan history"
      description="Every scan from both engines: webhook pushes, pull requests, manual and simulated runs."
      actions={
        <Link href="/scans/new" className={LinkButtonClasses('primary')}>
          <Play className="mr-2 h-4 w-4" /> Run a scan
        </Link>
      }
    />
  );

  if (!state.loaded)
    return (
      <>
        {header}
        <div className="panel">
          <SkeletonRows rows={6} />
        </div>
      </>
    );

  const bothDown = state.conn.backendA === 'down' && state.conn.backendB === 'down';

  return (
    <>
      {header}
      <BackendNotice />
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by repository" placeholder="Search repository…" className="input h-9 pl-9 font-mono text-mono-md" />
          </div>
          <select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="input h-9 w-auto font-mono text-mono-md">
            <option value="all">Source: All</option>
            <option value="vulnwatch">Source: VulnWatch</option>
            <option value="securedevops">Source: SecureDevOps</option>
          </select>
          <select aria-label="Filter by trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)} className="input h-9 w-auto font-mono text-mono-md">
            <option value="all">Trigger: All</option>
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>
                Trigger: {triggerLabel(t)}
              </option>
            ))}
          </select>
        </div>

        {bothDown && state.scans.length === 0 ? (
          <ErrorState title="Could not load history" message={[state.errors.vulnwatch, state.errors.securedevops].filter(Boolean).join(' / ')} onRetry={() => void refresh()} />
        ) : state.scans.length === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="No scans recorded yet"
            message="Scans appear here after a webhook push or a manual run."
            action={
              <>
                <Link href="/scans/new" className={LinkButtonClasses('primary')}>
                  Run a scan
                </Link>
                {!gh.authenticated && (
                  <Link href="/settings" className={LinkButtonClasses('secondary')}>
                    Connect GitHub
                  </Link>
                )}
              </>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title="No scans match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-tray">
                <tr className="label-caps">
                  <th scope="col" className="px-4 py-2.5">Repository</th>
                  <th scope="col" className="px-4 py-2.5">Trigger</th>
                  <th scope="col" className="px-4 py-2.5">Scanned</th>
                  <th scope="col" className="px-4 py-2.5">Packages</th>
                  <th scope="col" className="px-4 py-2.5">Findings</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                  <th scope="col" className="w-8 px-2 py-2.5"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const m = aggregateMetrics(s.projects);
                  const href = `/scans/${encodeURIComponent(s.id)}`;
                  return (
                    <tr key={s.id} onClick={() => router.push(href)} className="cursor-pointer border-t border-slate-400/10 hover:bg-raised">
                      <td className="px-4 py-3">
                        <Link href={href} onClick={(e) => e.stopPropagation()} className="break-all font-mono text-mono-md text-on-surface hover:text-secondary">
                          {s.repo ?? 'Custom scan'}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-mono-sm text-outline">
                          {s.ref && <span className="rounded bg-surface-container-high px-1.5 py-px text-secondary">{s.ref}</span>}
                          {s.commitSha && <span>{shortSha(s.commitSha)}</span>}
                          <span className="uppercase">{s.source === 'vulnwatch' ? 'VulnWatch' : 'SecureDevOps'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><TriggerChip trigger={s.trigger} /></td>
                      <td className="px-4 py-3 font-mono text-mono-sm text-on-surface-variant" title={s.scannedAt}>{relativeTime(s.scannedAt, now)}</td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface-variant">{m.totalDependencies}</td>
                      <td className="px-4 py-3"><SeverityBar scan={s} /></td>
                      <td className="px-4 py-3">
                        {s.status === 'failed' ? <Chip tone="danger">Failed</Chip> : m.totalFindings > 0 ? <Chip tone="danger">{m.totalFindings} {m.totalFindings === 1 ? 'vulnerability' : 'vulnerabilities'}</Chip> : <Chip tone="safe">All clear</Chip>}
                      </td>
                      <td className="px-2 py-3 text-outline"><ChevronRight className="h-4 w-4" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
