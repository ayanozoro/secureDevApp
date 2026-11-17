'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Package, ScrollText, ShieldAlert } from 'lucide-react';
import { useScan } from '@/lib/state/ScanProvider';
import { Breadcrumbs } from '@/components/layout/PageHeader';
import { BackendNotice } from '@/components/layout/BackendNotice';
import { Button, LinkButtonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Badge';
import { ErrorState, EmptyState, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { aggregateMetrics } from '@/lib/domain/normalize';
import { shortSha } from '@/lib/utils/format';
import { ScanHeader } from './ScanHeader';
import { ThreatBreakdown } from './ThreatBreakdown';
import { FindingsExplorer } from './FindingsExplorer';
import { PackagesInspector } from './PackagesInspector';

type TabId = 'findings' | 'packages' | 'logs';

export function ScanDetailView({ id }: { id: string }) {
  const { getScan, state, refresh } = useScan();
  const router = useRouter();
  const params = useSearchParams();

  const scan = getScan(id);
  const tab = (params.get('tab') === 'packages' ? 'packages' : 'findings') as TabId;
  const projectParam = params.get('project');
  const q = params.get('q') ?? '';

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(`/scans/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const scoped = useMemo(() => {
    if (!scan) return [];
    if (projectParam == null) return scan.projects;
    const hit = scan.projects.filter((p) => p.path === projectParam);
    return hit.length ? hit : scan.projects;
  }, [scan, projectParam]);

  if (!state.loaded) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading scan">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!scan) {
    const bothDown = state.conn.backendA === 'down' && state.conn.backendB === 'down';
    return (
      <>
        <Breadcrumbs items={[{ label: 'Scans', href: '/scans' }, { label: 'Not found' }]} />
        <div className="panel mt-4">
          {bothDown ? (
            <ErrorState title="Could not load scans" message="Neither backend is reachable, so this scan cannot be loaded." onRetry={() => void refresh()} />
          ) : (
            <EmptyState
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Scan not found"
              message="It may have been replaced by a newer scan, or it only existed in a previous session."
              action={
                <Link href="/scans" className={LinkButtonClasses('primary')}>
                  Open scan history
                </Link>
              }
            />
          )}
        </div>
      </>
    );
  }

  const metrics = aggregateMetrics(scoped);
  const findings = scoped.flatMap((p) => p.findings);
  const live = state.conn.streamA || state.conn.streamB;
  const showPackages = scan.capabilities.packages;
  const activeTab: TabId = tab === 'packages' && !showPackages ? 'findings' : tab;
  const scopeLabel = projectParam != null && scoped.length === 1 ? `/${scoped[0].path}` : undefined;

  return (
    <div className="space-y-4">
      <BackendNotice />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs
          items={[
            { label: 'Scans', href: '/scans' },
            { label: scan.repo ?? 'Custom scan' },
            { label: `${scan.ref ?? 'scan'}${scan.commitSha ? `@${shortSha(scan.commitSha)}` : ''}` },
          ]}
        />
        <div className="flex items-center gap-2 font-mono text-mono-sm text-outline">
          <span>Scan run ID:</span>
          <span className="max-w-[220px] truncate rounded bg-surface-container px-2 py-0.5 text-on-surface" title={scan.id}>
            {scan.id}
          </span>
          {live && (
            <Chip tone="cyan" beacon>
              Stream active
            </Chip>
          )}
        </div>
      </div>

      <ScanHeader scan={scan} metrics={metrics} scopeLabel={scopeLabel} />

      {scan.projects.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Project scope">
          <span className="label-caps">Scope:</span>
          {[{ path: null as string | null, label: 'All', n: scan.projects.length }, ...scan.projects.map((p) => ({ path: p.path as string | null, label: `/${p.path}`, n: p.metrics.totalDependencies }))].map((o) => {
            const active = o.path === null ? projectParam == null : projectParam === o.path;
            return (
              <button
                key={o.label}
                aria-pressed={active}
                onClick={() => setParam({ project: o.path })}
                className={cn(
                  'rounded border px-3 py-1.5 font-mono text-mono-md transition-colors',
                  active ? 'border-cyan/50 bg-cyan/15 text-secondary' : 'border-line bg-tray text-on-surface-variant hover:border-cyan/30',
                )}
              >
                {o.label} <span className="text-outline">{o.path === null ? o.n : `${o.n} deps`}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<TabId>
          label="Scan sections"
          value={activeTab}
          onChange={(t) => {
            if (t === 'logs') router.push('/webhooks?tab=logs');
            else setParam({ tab: t === 'findings' ? null : t });
          }}
          items={[
            { id: 'findings', label: 'Findings', icon: <ShieldAlert className="h-3.5 w-3.5" />, count: findings.length },
            ...(showPackages ? [{ id: 'packages' as const, label: 'Packages', icon: <Package className="h-3.5 w-3.5" />, count: scoped.reduce((n, p) => n + (p.packages?.length ?? 0), 0) }] : []),
            { id: 'logs', label: 'Scan logs', icon: <ScrollText className="h-3.5 w-3.5" /> },
          ]}
        />
        <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => void refresh()}>
          Refresh history
        </Button>
      </div>

      {scan.status === 'failed' ? (
        <div className="panel">
          <ErrorState title="This scan failed" message={scan.error ?? 'The backend reported an error for this scan.'} />
        </div>
      ) : activeTab === 'findings' ? (
        <>
          <FindingsExplorer scan={scan} projects={scoped} initialQuery={q} />
          <ThreatBreakdown counts={metrics.severityCounts} findings={findings} />
        </>
      ) : (
        <PackagesInspector scan={scan} projects={scoped} />
      )}
    </div>
  );
}
