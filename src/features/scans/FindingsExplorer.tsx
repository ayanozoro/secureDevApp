'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Search, ShieldCheck, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Chip, SeverityBadge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/States';
import { FindingPanel } from './FindingPanel';
import { compareSeverity, fixCommand, toSarif } from '@/lib/domain/normalize';
import { downloadJson } from '@/lib/utils/format';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useCopy } from '@/hooks/useCopy';
import { SEVERITY_ORDER, type Finding, type Project, type ScanRun, type Severity } from '@/lib/domain/types';

type Row = { id: string; f: Finding; path: string };
type SortKey = 'severity' | 'cvss' | 'package';
type ScopeFilter = 'ALL' | 'DIRECT' | 'TRANSITIVE' | 'PROD' | 'DEV';

const PAGE_SIZE = 10;

function SelectBox<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="relative flex min-w-[150px] flex-1 items-center sm:flex-none">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="input h-9 appearance-none pr-8 font-mono text-mono-md"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-outline" />
    </label>
  );
}

export function FindingsExplorer({
  scan,
  projects,
  initialQuery = '',
}: {
  scan: ScanRun;
  projects: Project[];
  initialQuery?: string;
}) {
  const copy = useCopy();
  const wide = useMediaQuery('(min-width: 1280px)');
  const [q, setQ] = useState(initialQuery);
  const [severity, setSeverity] = useState<'ALL' | Severity>('ALL');
  const [scope, setScope] = useState<ScopeFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('severity');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setQ(initialQuery), [initialQuery]);

  const all: Row[] = useMemo(
    () => projects.flatMap((p) => p.findings.map((f) => ({ id: `${p.path}::${f.key}`, f, path: p.path }))),
    [projects],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = all.filter(({ f }) => {
      if (severity !== 'ALL' && f.severity !== severity) return false;
      if (scope === 'DIRECT' && f.dependencyType !== 'direct') return false;
      if (scope === 'TRANSITIVE' && f.dependencyType !== 'transitive') return false;
      if (scope === 'PROD' && f.isDev !== false) return false;
      if (scope === 'DEV' && f.isDev !== true) return false;
      if (!term) return true;
      return (
        f.packageName.toLowerCase().includes(term) ||
        f.osvId.toLowerCase().includes(term) ||
        f.summary.toLowerCase().includes(term) ||
        f.aliases.some((a) => a.toLowerCase().includes(term))
      );
    });
    const sorted = [...rows];
    if (sort === 'severity') sorted.sort((a, b) => compareSeverity(a.f, b.f) || (b.f.cvssScore ?? -1) - (a.f.cvssScore ?? -1));
    else if (sort === 'cvss') sorted.sort((a, b) => (b.f.cvssScore ?? -1) - (a.f.cvssScore ?? -1) || compareSeverity(a.f, b.f));
    else sorted.sort((a, b) => a.f.packageName.localeCompare(b.f.packageName));
    return sorted;
  }, [all, q, severity, scope, sort]);

  useEffect(() => setPage(1), [q, severity, scope, sort, projects]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selected = all.find((r) => r.id === selectedId);

  // Keep the first row selected on wide screens so the investigation panel is never blank when data exists.
  useEffect(() => {
    if (wide && !selected && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [wide, selected, filtered]);

  const select = (r: Row) => {
    setSelectedId(r.id);
    if (!wide) setDrawer(true);
  };

  const hasFilter = q.trim() !== '' || severity !== 'ALL' || scope !== 'ALL';
  const clearFilters = () => {
    setQ('');
    setSeverity('ALL');
    setScope('ALL');
  };

  const exportSarif = () => downloadJson(`${(scan.repo ?? 'scan').replace(/[^\w.-]+/g, '_')}-findings.sarif.json`, toSarif(scan, projects));

  const toolbar = (
    <div className="space-y-2 border-b border-line p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search findings"
          placeholder="Search package, CVE, GHSA, summary…"
          className="input h-10 pl-9 font-mono text-mono-md"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <SelectBox
          label="Severity filter"
          value={severity}
          onChange={setSeverity}
          options={[{ value: 'ALL', label: `Severity: All (${all.length})` }, ...SEVERITY_ORDER.map((s) => ({ value: s, label: `Severity: ${s}` }))]}
        />
        <SelectBox
          label="Scope filter"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'ALL', label: 'Scope: All' },
            { value: 'DIRECT', label: 'Scope: Direct' },
            { value: 'TRANSITIVE', label: 'Scope: Transitive' },
            { value: 'PROD', label: 'Scope: Production' },
            { value: 'DEV', label: 'Scope: Dev' },
          ]}
        />
        <SelectBox
          label="Sort order"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'severity', label: 'Sort: Severity' },
            { value: 'cvss', label: 'Sort: CVSS (high to low)' },
            { value: 'package', label: 'Sort: Package A-Z' },
          ]}
        />
        <Button size="sm" className="h-9" icon={<Download className="h-3.5 w-3.5" />} onClick={exportSarif} disabled={all.length === 0} title="Export findings as SARIF 2.1.0">
          Export SARIF
        </Button>
      </div>
    </div>
  );

  const list = (
    <div className="panel overflow-hidden">
      {toolbar}
      {filtered.length === 0 ? (
        all.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No vulnerabilities detected" message="Every dependency scanned in this scope has no known advisory in OSV." />
        ) : (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No findings match your filters"
            action={
              hasFilter && (
                <Button size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )
            }
          />
        )
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left">
              <thead className="sticky top-0 bg-tray">
                <tr className="label-caps">
                  <th scope="col" className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">Package &amp; version <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </th>
                  <th scope="col" className="px-3 py-2.5">Severity</th>
                  <th scope="col" className="px-3 py-2.5">Advisory</th>
                  <th scope="col" className="px-3 py-2.5">Summary &amp; impact</th>
                  <th scope="col" className="px-3 py-2.5">Scope</th>
                  <th scope="col" className="px-3 py-2.5">Fixed in</th>
                  <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const active = r.id === selectedId;
                  const cmd = fixCommand(r.f);
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => select(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          select(r);
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-t border-slate-400/10 transition-colors hover:bg-raised',
                        active && 'bg-raised shadow-[inset_2px_0_0_#06B6D4]',
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono text-mono-md text-on-surface">
                        <span className="break-all">{r.f.packageName}</span>
                        <span className="text-outline">@{r.f.installedVersion}</span>
                      </td>
                      <td className="px-3 py-2.5"><SeverityBadge severity={r.f.severity} score={r.f.cvssScore} /></td>
                      <td className="px-3 py-2.5 font-mono text-mono-sm text-on-surface-variant">
                        <span className="break-all">{r.f.aliases.find((a) => /^CVE-/i.test(a)) ?? r.f.osvId}</span>
                      </td>
                      <td className="max-w-xs px-3 py-2.5 text-body-md text-on-surface">{r.f.summary}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.f.dependencyType && <Chip>{r.f.dependencyType === 'direct' ? 'Direct' : 'Transitive'}</Chip>}
                          {typeof r.f.isDev === 'boolean' && <Chip>{r.f.isDev ? 'Dev' : 'Prod'}</Chip>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-mono-md text-severity-safe">{r.f.fixedVersion ?? <span className="text-outline">none</span>}</td>
                      <td className="px-2 py-2.5">
                        {cmd && (
                          <button
                            aria-label={`Copy upgrade command for ${r.f.packageName}`}
                            title={cmd}
                            onClick={(e) => {
                              e.stopPropagation();
                              void copy(cmd, 'Upgrade command copied');
                            }}
                            className="rounded p-1.5 text-outline hover:bg-surface-container-high hover:text-secondary"
                          >
                            <Download className="h-3.5 w-3.5 rotate-180" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-slate-400/10 md:hidden">
            {pageRows.map((r) => (
              <li key={r.id}>
                <button onClick={() => select(r)} className={cn('w-full space-y-1.5 p-3 text-left hover:bg-raised', r.id === selectedId && 'bg-raised')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-all font-mono text-mono-md text-on-surface">
                      {r.f.packageName}
                      <span className="text-outline">@{r.f.installedVersion}</span>
                    </span>
                    <SeverityBadge severity={r.f.severity} score={r.f.cvssScore} />
                  </div>
                  <div className="font-mono text-mono-sm text-outline">{r.f.aliases.find((a) => /^CVE-/i.test(a)) ?? r.f.osvId}</div>
                  <p className="text-body-sm text-on-surface-variant">{r.f.summary}</p>
                  <div className="font-mono text-mono-sm text-severity-safe">Fixed in: {r.f.fixedVersion ?? 'none'}</div>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5 font-mono text-mono-sm text-outline">
            <span>
              Displaying {(current - 1) * PAGE_SIZE + 1}-{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length} detected vulnerabilities
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)} icon={<ChevronLeft className="h-3.5 w-3.5" />} aria-label="Previous page">
                Previous
              </Button>
              <span className="text-on-surface">
                Page {current} of {pages}
              </span>
              <Button size="sm" variant="secondary" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      {list}
      {wide && (
        <aside aria-label="Finding details" className="panel sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto xl:block">
          {selected ? (
            <FindingPanel finding={selected.f} projectPath={projects.length > 1 ? selected.path : undefined} />
          ) : (
            <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Select a finding" message="Pick a row to investigate its advisory, fix and references." />
          )}
        </aside>
      )}
      {!wide && (
        <Drawer open={drawer && !!selected} onClose={() => setDrawer(false)} title="Threat investigation">
          {selected && <FindingPanel finding={selected.f} projectPath={projects.length > 1 ? selected.path : undefined} />}
        </Drawer>
      )}
    </div>
  );
}
