'use client';

import React, { useMemo, useState } from 'react';
import { Package, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Chip, SeverityBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import type { Project, ScanRun } from '@/lib/domain/types';

export function PackagesInspector({ scan, projects }: { scan: ScanRun; projects: Project[] }) {
  const [q, setQ] = useState('');
  const rows = useMemo(
    () => projects.flatMap((p) => (p.packages ?? []).map((pkg) => ({ pkg, path: p.path }))),
    [projects],
  );
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter(({ pkg }) => pkg.name.toLowerCase().includes(t) || pkg.declared.toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  if (!scan.capabilities.packages || rows.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="No package list for this scan"
          message="This scan source did not return a per-package manifest. Scans run by the VulnWatch engine (manual scans and its webhooks) include one."
        />
      </div>
    );
  }

  const flagged = rows.filter((r) => r.pkg.isVulnerable).length;
  return (
    <section aria-label="Packages manifest inspector" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="font-headline text-headline-sm text-on-surface">Packages manifest inspector</h2>
          <p className="text-body-sm text-on-surface-variant">Declared dependencies cross-referenced with OSV advisories</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="cyan">{rows.length} indexed</Chip>
          <Chip tone={flagged ? 'danger' : 'safe'}>{flagged} flagged</Chip>
        </div>
      </div>
      <div className="border-b border-line p-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter packages" placeholder="Filter packages…" className="input h-9 pl-9 font-mono text-mono-md" />
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title="No packages match" />
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="sticky top-0 bg-tray">
              <tr className="label-caps">
                <th scope="col" className="px-4 py-2.5">Package</th>
                {projects.length > 1 && <th scope="col" className="px-4 py-2.5">Project</th>}
                <th scope="col" className="px-4 py-2.5">Declared</th>
                <th scope="col" className="px-4 py-2.5">Resolved</th>
                <th scope="col" className="px-4 py-2.5">Type</th>
                <th scope="col" className="px-4 py-2.5">Health status</th>
                <th scope="col" className="px-4 py-2.5">Vulnerabilities</th>
                <th scope="col" className="px-4 py-2.5">Highest risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ pkg, path }, i) => (
                <tr key={`${path}-${pkg.name}-${i}`} className="border-t border-slate-400/10 hover:bg-raised">
                  <td className="px-4 py-2.5 font-mono text-mono-md text-on-surface">{pkg.name}</td>
                  {projects.length > 1 && <td className="px-4 py-2.5 font-mono text-mono-sm text-outline">/{path}</td>}
                  <td className="px-4 py-2.5 font-mono text-mono-md text-outline">{pkg.declared}</td>
                  <td className={cn('px-4 py-2.5 font-mono text-mono-md', pkg.isVulnerable ? 'text-severity-high' : 'text-secondary')}>{pkg.resolved}</td>
                  <td className="px-4 py-2.5"><Chip>{pkg.type || 'n/a'}</Chip></td>
                  <td className="px-4 py-2.5">
                    {pkg.isVulnerable ? <Chip tone="danger" beacon>Vulnerable</Chip> : <Chip tone="safe">Clean</Chip>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-mono-md text-on-surface-variant">{pkg.vulnerabilityCount > 0 ? `${pkg.vulnerabilityCount} found` : '0 findings'}</td>
                  <td className="px-4 py-2.5"><SeverityBadge severity={pkg.highestSeverity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
