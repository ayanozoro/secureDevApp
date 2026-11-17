'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Github, Play, ShieldCheck, X } from 'lucide-react';
import { useScan } from '@/lib/state/ScanProvider';
import { useGithub } from '@/lib/state/GithubProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendNotice } from '@/components/layout/BackendNotice';
import { LinkButtonClasses } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { SeverityBadge } from '@/components/ui/Badge';
import { ActivityFeed } from '@/features/webhooks/ActivityFeed';
import { ScanHeader } from './ScanHeader';
import { ThreatBreakdown } from './ThreatBreakdown';
import { aggregateMetrics, compareSeverity } from '@/lib/domain/normalize';

export function DashboardView() {
  const { state, latest, refresh, dismissBanner } = useScan();
  const gh = useGithub();

  const header = (
    <PageHeader
      eyebrow="Command center"
      title="Dashboard"
      description="Latest scan result, live webhook activity and the highest-risk findings."
      actions={
        <Link href="/scans/new" className={LinkButtonClasses('primary')}>
          <Play className="mr-2 h-4 w-4" /> Run a scan
        </Link>
      }
    />
  );

  if (!state.loaded) {
    return (
      <>
        {header}
        <div className="space-y-4" role="status" aria-label="Loading dashboard">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </>
    );
  }

  if (!latest) {
    const bothDown = state.conn.backendA === 'down' && state.conn.backendB === 'down';
    return (
      <>
        {header}
        <BackendNotice />
        <div className="panel">
          {bothDown ? (
            <ErrorState
              title="Could not reach the backends"
              message={[state.errors.vulnwatch, state.errors.securedevops].filter(Boolean).join(' / ')}
              onRetry={() => void refresh()}
            />
          ) : (
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" />}
              title="No scans yet"
              message="Run a scan on a repository or paste a package.json, or connect GitHub and install a webhook so every push is scanned."
              action={
                <>
                  <Link href="/scans/new" className={LinkButtonClasses('primary')}>
                    Run a scan
                  </Link>
                  {!gh.authenticated && (
                    <Link href="/settings" className={LinkButtonClasses('secondary')}>
                      <Github className="mr-2 h-4 w-4" /> Connect GitHub
                    </Link>
                  )}
                </>
              }
            />
          )}
        </div>
      </>
    );
  }

  const metrics = aggregateMetrics(latest.projects);
  const top = latest.projects
    .flatMap((p) => p.findings.map((f) => ({ f, path: p.path })))
    .sort((a, b) => compareSeverity(a.f, b.f) || (b.f.cvssScore ?? -1) - (a.f.cvssScore ?? -1))
    .slice(0, 5);
  const href = `/scans/${encodeURIComponent(latest.id)}`;

  return (
    <div className="space-y-4">
      {header}
      <BackendNotice />
      {state.banner && (
        <div role="status" className="flex animate-fadeIn items-center justify-between gap-3 rounded-lg border border-severity-safe/30 bg-severity-safe/10 px-4 py-3 text-body-sm text-severity-safe">
          <span className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="break-words">{state.banner.message}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {state.banner.href && (
              <Link href={state.banner.href} className="underline hover:text-white">
                View
              </Link>
            )}
            <button aria-label="Dismiss banner" onClick={dismissBanner} className="hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      )}

      <ScanHeader scan={latest} metrics={metrics}>
        <div className="flex justify-end">
          <Link href={href} className={LinkButtonClasses('secondary', 'sm')}>
            Open full scan <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </div>
      </ScanHeader>

      <ThreatBreakdown counts={metrics.severityCounts} findings={latest.projects.flatMap((p) => p.findings)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel overflow-hidden" aria-label="Top findings">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-headline text-headline-sm text-on-surface">Top findings</h2>
            <Link href={href} className="font-mono text-mono-sm text-secondary hover:underline">
              View all {metrics.totalFindings}
            </Link>
          </div>
          {top.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No vulnerabilities detected" message="All scanned dependencies are clean in OSV." />
          ) : (
            <ul className="divide-y divide-slate-400/10">
              {top.map(({ f, path }) => (
                <li key={`${path}-${f.key}`}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-raised">
                    <SeverityBadge severity={f.severity} score={f.cvssScore} />
                    <div className="min-w-0 flex-1">
                      <div className="break-all font-mono text-mono-md text-on-surface">
                        {f.packageName}
                        <span className="text-outline">@{f.installedVersion}</span>
                      </div>
                      <div className="truncate text-body-sm text-on-surface-variant">{f.summary}</div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-mono-sm">
                      <div className="label-caps">Fix</div>
                      <div className={f.fixedVersion ? 'text-severity-safe' : 'text-outline'}>{f.fixedVersion ?? 'none'}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel overflow-hidden" aria-label="Recent webhook activity">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-headline text-headline-sm text-on-surface">Recent webhook activity</h2>
            <Link href="/webhooks" className="font-mono text-mono-sm text-secondary hover:underline">
              All activity
            </Link>
          </div>
          <ActivityFeed events={state.events} scans={state.scans} limit={5} />
        </section>
      </div>
    </div>
  );
}
