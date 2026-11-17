import React from 'react';
import { SeverityDonut } from '@/components/ui/Donut';
import { SEVERITY_STYLE } from '@/lib/domain/severity';
import type { Finding, SeverityCounts } from '@/lib/domain/types';

export function ThreatBreakdown({ counts, findings }: { counts: SeverityCounts; findings: Finding[] }) {
  const total = counts.critical + counts.high + counts.medium + counts.low + counts.unknown;
  const withType = findings.filter((f) => f.dependencyType);
  const direct = withType.filter((f) => f.dependencyType === 'direct').length;
  const withEnv = findings.filter((f) => typeof f.isDev === 'boolean');
  const prod = withEnv.filter((f) => !f.isDev).length;

  const insight: string[] = [];
  if (withType.length > 0) insight.push(`${Math.round((direct / withType.length) * 100)}% of findings are in direct dependencies`);
  if (withEnv.length > 0) insight.push(`${Math.round((prod / withEnv.length) * 100)}% are in production scope`);

  const rows: { label: string; n: number; sev: keyof typeof SEVERITY_STYLE }[] = [
    { label: 'Critical', n: counts.critical, sev: 'CRITICAL' },
    { label: 'High', n: counts.high, sev: 'HIGH' },
    { label: 'Medium', n: counts.medium, sev: 'MEDIUM' },
    { label: 'Low', n: counts.low, sev: 'LOW' },
    ...(counts.unknown ? [{ label: 'Unknown', n: counts.unknown, sev: 'UNKNOWN' as const }] : []),
  ];

  return (
    <section aria-label="Threat impact breakdown" className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <SeverityDonut counts={counts} size={96} />
      <div className="min-w-0 flex-1">
        <h2 className="font-headline text-headline-sm text-on-surface">Threat impact breakdown</h2>
        <p className="mt-0.5 text-body-sm text-on-surface-variant">
          {total === 0 ? 'No findings in this scope.' : insight.length ? `${insight.join('; ')}.` : 'Findings by severity for this scope.'}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 font-mono text-mono-md text-on-surface-variant">
            <span className={`h-2 w-2 rounded-full ${SEVERITY_STYLE[r.sev].dot}`} aria-hidden />
            {r.label}
            <span className="ml-auto text-on-surface">{r.n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
