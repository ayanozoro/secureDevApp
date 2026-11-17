'use client';

import React from 'react';
import { Code2, Copy, ExternalLink, ShieldAlert, Terminal } from 'lucide-react';
import { SeverityBadge, Chip } from '@/components/ui/Badge';
import { advisoryLinks, fixCommand, safeExternalUrl } from '@/lib/domain/normalize';
import { formatDate } from '@/lib/utils/format';
import { useCopy } from '@/hooks/useCopy';
import type { Finding } from '@/lib/domain/types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="label-caps">{title}</div>
      {children}
    </div>
  );
}

export function FindingPanel({ finding, projectPath }: { finding: Finding; projectPath?: string }) {
  const copy = useCopy();
  const cmd = fixCommand(finding);
  const links = [
    ...advisoryLinks(finding),
    ...(finding.references ?? [])
      .map((u) => safeExternalUrl(u))
      .filter((u): u is string => Boolean(u))
      .map((u) => ({ label: u.replace(/^https?:\/\//, ''), url: u })),
  ].filter((l, i, a) => a.findIndex((x) => x.url === l.url) === i);
  const ids = Array.from(new Set([finding.osvId, ...finding.aliases])).filter(Boolean);

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps flex items-center gap-1.5 text-secondary">
            <ShieldAlert className="h-3 w-3" /> Threat investigation
          </div>
          <h2 className="mt-1 break-all font-headline text-headline-md text-on-surface">
            {finding.packageName} <span className="font-mono text-mono-md font-normal text-outline">v{finding.installedVersion}</span>
          </h2>
          {projectPath && <div className="font-mono text-mono-sm text-outline">/{projectPath}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="rounded border border-line bg-panel px-2 py-1 font-mono text-mono-md text-on-surface">
            {finding.cvssScore != null ? `${finding.cvssScore.toFixed(1)} / 10` : 'Not rated'}
          </div>
          <div className="mt-1 flex justify-end">
            <SeverityBadge severity={finding.severity} />
          </div>
        </div>
      </div>

      {finding.cvssVector && (
        <button
          onClick={() => copy(finding.cvssVector!, 'CVSS vector copied')}
          title="Copy CVSS vector"
          className="flex w-full items-center justify-between gap-2 rounded border border-line bg-panel px-3 py-2 text-left font-mono text-mono-sm text-on-surface-variant hover:border-cyan/40"
        >
          <span className="truncate">{finding.cvssVector}</span>
          <Copy className="h-3.5 w-3.5 shrink-0" />
        </button>
      )}

      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <Chip key={id} tone="indigo" className="normal-case">
              {id}
            </Chip>
          ))}
        </div>
      )}

      <Section title="Vulnerability summary">
        <p className="break-words text-body-md text-on-surface">{finding.summary || 'No summary provided.'}</p>
      </Section>

      {finding.details && (
        <div className="rounded border border-line bg-panel p-3">
          <div className="label-caps mb-1 flex items-center gap-1.5 text-secondary">
            <Code2 className="h-3 w-3" /> Technical details
          </div>
          <p className="whitespace-pre-wrap break-words text-body-sm text-on-surface-variant">{finding.details}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-line bg-panel p-2.5">
          <div className="label-caps">Vulnerable range</div>
          <div className="mt-1 break-words font-mono text-mono-md text-severity-critical">{finding.affectedVersions || 'Not provided'}</div>
        </div>
        <div className="rounded border border-line bg-panel p-2.5">
          <div className="label-caps">Safe fix release</div>
          <div className="mt-1 break-words font-mono text-mono-md text-severity-safe">{finding.fixedVersion || 'No fix published'}</div>
        </div>
      </div>

      {cmd && (
        <Section title="Direct remediation">
          <button
            onClick={() => copy(cmd, 'Upgrade command copied')}
            className="flex w-full items-center justify-between gap-2 rounded border border-cyan/30 bg-panel px-3 py-2 text-left font-mono text-mono-md text-secondary hover:border-cyan"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Terminal className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{cmd}</span>
            </span>
            <Copy className="h-3.5 w-3.5 shrink-0" />
          </button>
        </Section>
      )}

      {finding.cwes && finding.cwes.length > 0 && (
        <Section title="CWE taxonomy">
          <div className="flex flex-wrap gap-1.5">
            {finding.cwes.map((c) => (
              <Chip key={c} className="normal-case">
                {c}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {(finding.dependencyType || typeof finding.isDev === 'boolean') && (
        <Section title="Scope">
          <div className="flex gap-1.5">
            {finding.dependencyType && <Chip>{finding.dependencyType}</Chip>}
            {typeof finding.isDev === 'boolean' && <Chip>{finding.isDev ? 'dev' : 'production'}</Chip>}
          </div>
        </Section>
      )}

      {links.length > 0 && (
        <Section title="Intelligence feeds">
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 break-all font-mono text-mono-sm text-primary hover:underline">
                  <ExternalLink className="h-3 w-3 shrink-0" /> {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(finding.publishedAt || finding.modifiedAt) && (
        <p className="font-mono text-mono-sm text-outline">
          {finding.publishedAt && <>Published: {formatDate(finding.publishedAt)}</>}
          {finding.publishedAt && finding.modifiedAt && ' • '}
          {finding.modifiedAt && <>Modified: {formatDate(finding.modifiedAt)}</>}
        </p>
      )}
    </div>
  );
}
