'use client';

import React from 'react';
import { AlertTriangle, GitBranch, GitCommit, ShieldCheck, User, Clock, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Chip } from '@/components/ui/Badge';
import { SEVERITY_STYLE } from '@/lib/domain/severity';
import { highestSeverity } from '@/lib/domain/normalize';
import { formatDateTime, shortSha } from '@/lib/utils/format';
import type { Metrics, ScanRun, SeverityCounts } from '@/lib/domain/types';

const SOURCE_LABEL = { vulnwatch: 'VulnWatch engine', securedevops: 'SecureDevOps engine' } as const;

export function riskLabel(counts: SeverityCounts, findings: number) {
  const top = highestSeverity(counts);
  if (findings === 0 || top === 'NONE') return { label: 'CLEAN', tone: 'safe' as const };
  return { label: `${top} RISK`, tone: top === 'CRITICAL' || top === 'HIGH' ? ('danger' as const) : ('warn' as const) };
}

function Cell({ label, value, tone }: { label: string; value: number; tone?: 'critical' | 'high' | 'medium' | 'low' | 'unknown' | 'vuln' }) {
  const color =
    tone === 'critical' ? SEVERITY_STYLE.CRITICAL.text
    : tone === 'high' ? SEVERITY_STYLE.HIGH.text
    : tone === 'medium' ? SEVERITY_STYLE.MEDIUM.text
    : tone === 'low' ? SEVERITY_STYLE.LOW.text
    : tone === 'unknown' ? SEVERITY_STYLE.UNKNOWN.text
    : tone === 'vuln' ? 'text-primary'
    : 'text-on-surface';
  return (
    <div className="min-w-[68px] rounded border border-line bg-panel px-2.5 py-2">
      <div className="label-caps whitespace-nowrap">{label}</div>
      <div className={cn('font-headline text-headline-md', color)}>{value}</div>
    </div>
  );
}

export function TelemetryMatrix({ metrics }: { metrics: Metrics }) {
  const c = metrics.severityCounts;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:flex xl:flex-nowrap">
      <Cell label="Total deps" value={metrics.totalDependencies} />
      <Cell label="Vulnerable" value={metrics.vulnerableDependencies} tone="vuln" />
      <Cell label="Critical" value={c.critical} tone="critical" />
      <Cell label="High" value={c.high} tone="high" />
      <Cell label="Medium" value={c.medium} tone="medium" />
      <Cell label="Low" value={c.low} tone="low" />
      {c.unknown > 0 && <Cell label="Unknown" value={c.unknown} tone="unknown" />}
    </div>
  );
}

export function ScanHeader({
  scan,
  metrics,
  scopeLabel,
  children,
}: {
  scan: ScanRun;
  metrics: Metrics;
  scopeLabel?: string;
  children?: React.ReactNode;
}) {
  const risk = riskLabel(metrics.severityCounts, metrics.totalFindings);
  const critical = risk.tone === 'danger' && metrics.severityCounts.critical > 0;
  return (
    <section
      aria-label="Scan summary"
      className={cn('relative overflow-hidden rounded-xl border border-line bg-surface-container-low p-4 md:p-5', critical && 'shadow-critical')}
    >
      <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-cyan/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-start gap-3">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded', risk.tone === 'safe' ? 'bg-severity-safe/15 text-severity-safe' : 'bg-severity-critical/15 text-severity-critical')}>
              {risk.tone === 'safe' ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-all font-headline text-headline-md text-on-surface">{scan.repo ?? 'Custom scan'}</h1>
                <Chip tone={risk.tone}>
                  {risk.label} • {metrics.totalFindings} {metrics.totalFindings === 1 ? 'finding' : 'findings'}
                </Chip>
                {scopeLabel && <Chip tone="cyan">Scope: {scopeLabel}</Chip>}
                {scan.status === 'failed' && <Chip tone="danger">Scan failed</Chip>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-mono-sm text-outline">
                {scan.commitSha && (
                  <span className="inline-flex items-center gap-1">
                    <GitCommit className="h-3 w-3" /> {shortSha(scan.commitSha)}
                  </span>
                )}
                {scan.ref && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="h-3 w-3" /> <span className="text-secondary">{scan.ref}</span>
                  </span>
                )}
                {scan.author && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" /> {scan.author}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatDateTime(scan.scannedAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3 w-3" /> {SOURCE_LABEL[scan.source]}
                </span>
              </div>
              {scan.commitMessage && <p className="break-words text-body-md text-on-surface-variant">{scan.commitMessage}</p>}
            </div>
          </div>
          {scan.status === 'failed' && scan.error && <p className="break-words rounded border border-severity-critical/40 bg-severity-critical/10 px-3 py-2 text-body-sm text-severity-critical">Error: {scan.error}</p>}
        </div>
        <div className="space-y-3">
          <TelemetryMatrix metrics={metrics} />
          {children}
        </div>
      </div>
    </section>
  );
}
