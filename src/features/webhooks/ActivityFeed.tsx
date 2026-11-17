'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, GitCommit, GitPullRequest, Radio, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Chip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { relativeTime, shortSha } from '@/lib/utils/format';
import { useNow } from '@/hooks/useNow';
import type { ScanRun, WebhookEvent } from '@/lib/domain/types';

function summary(e: WebhookEvent): string {
  if (e.event === 'ping') return e.message || 'Ping handshake verified';
  if (e.projectsCount != null) {
    const subs = `${e.projectsCount} ${e.projectsCount === 1 ? 'subproject' : 'subprojects'}`;
    return `Scanned ${subs}${e.totalDependencies != null ? ` (${e.totalDependencies} dependencies)` : ''}`;
  }
  if (e.totalDependencies != null) return `${e.totalDependencies} dependencies scanned`;
  return 'Webhook received';
}

export function ActivityFeed({
  events,
  scans,
  limit,
  waitingHint = true,
}: {
  events: WebhookEvent[];
  scans: ScanRun[];
  limit?: number;
  waitingHint?: boolean;
}) {
  const now = useNow();
  const list = limit ? events.slice(0, limit) : events;
  if (list.length === 0) {
    return (
      <EmptyState
        icon={<Radio className="h-6 w-6" />}
        title="Listening for webhook events"
        message={waitingHint ? 'When code is pushed to a connected repository, events appear here in real time.' : undefined}
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-400/10">
      {list.map((e) => {
        const Icon = e.event === 'ping' ? Radio : e.event === 'pull_request' ? GitPullRequest : GitCommit;
        const hasScan = e.scanId && scans.some((s) => s.id === e.scanId);
        const inner = (
          <div className="flex items-center gap-3 px-4 py-3">
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded border', e.event === 'ping' ? 'border-cyan/30 bg-cyan/10 text-cyan' : 'border-indigo/40 bg-indigo/10 text-primary')}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={e.event === 'ping' ? 'cyan' : 'indigo'}>{e.event.replace('_', ' ')}</Chip>
                <span className="break-all font-mono text-mono-md text-on-surface">{e.repo || 'unknown repo'}</span>
                {e.sha && <span className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-mono-sm text-on-surface-variant">{shortSha(e.sha)}</span>}
                <span className="hidden font-mono text-label-caps uppercase text-outline sm:inline">{e.source === 'vulnwatch' ? 'VulnWatch' : 'SecureDevOps'}</span>
              </div>
              <p className="mt-0.5 text-body-sm text-on-surface-variant">{summary(e)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
              {e.event !== 'ping' && e.findingsCount != null &&
                (e.findingsCount > 0 ? (
                  <span className="inline-flex items-center gap-1 font-mono text-mono-sm text-severity-critical">
                    <AlertTriangle className="h-3.5 w-3.5" /> {e.findingsCount} {e.findingsCount === 1 ? 'vulnerability' : 'vulnerabilities'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono text-mono-sm text-severity-safe">
                    <CheckCircle2 className="h-3.5 w-3.5" /> All clear
                  </span>
                ))}
              <span className="font-mono text-mono-sm text-outline">{relativeTime(e.timestamp, now)}</span>
            </div>
            {hasScan && <ChevronRight className="h-4 w-4 shrink-0 text-outline" />}
          </div>
        );
        return (
          <li key={e.id}>
            {hasScan ? (
              <Link href={`/scans/${encodeURIComponent(e.scanId!)}`} className="block hover:bg-raised" title="Open this scan">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
