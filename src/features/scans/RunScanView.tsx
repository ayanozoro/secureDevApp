'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileJson, GitBranch, Github, Play, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, LinkButtonClasses } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useGithub } from '@/lib/state/GithubProvider';
import { useScan } from '@/lib/state/ScanProvider';
import { useToast } from '@/lib/state/ToastProvider';
import { vulnwatch } from '@/lib/api/vulnwatch';
import { securedevops } from '@/lib/api/securedevops';
import { errorMessage } from '@/lib/api/http';
import { cn } from '@/lib/utils/cn';
import type { GithubRepo, ScanRun } from '@/lib/domain/types';

type Engine = 'vulnwatch' | 'securedevops';

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CUSTOM_REPO = '__custom__';

function parsePackageJson(text: string): { error?: string; count?: number } {
  if (!text.trim()) return {};
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'Expected a JSON object' };
    const n = Object.keys(obj.dependencies ?? {}).length + Object.keys(obj.devDependencies ?? {}).length;
    if (n === 0) return { error: 'No dependencies or devDependencies found' };
    return { count: n };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}

export function RunScanView() {
  const router = useRouter();
  const toast = useToast();
  const gh = useGithub();
  const { addScan, state } = useScan();

  const [engine, setEngine] = useState<Engine>('vulnwatch');
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState('');
  const [useCustomRepo, setUseCustomRepo] = useState(false);

  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [repoBusy, setRepoBusy] = useState(false);
  const [repoTouched, setRepoTouched] = useState(false);

  const [raw, setRaw] = useState('');
  const [rawBusy, setRawBusy] = useState(false);
  const parsed = useMemo(() => parsePackageJson(raw), [raw]);

  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    setReposError(null);
    try {
      const list = await vulnwatch.repos();
      setRepos(list);
      if (list.length > 0) {
        setRepo((cur) => {
          if (cur && list.some((r) => r.full_name === cur)) return cur;
          setBranch(list[0].default_branch || 'main');
          return list[0].full_name;
        });
      }
    } catch (err) {
      setReposError(errorMessage(err));
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gh.authenticated) {
      void loadRepos();
    } else {
      setRepos(null);
      setReposError(null);
    }
  }, [gh.authenticated, loadRepos]);

  const visibleRepos = useMemo(() => {
    if (!repos) return [];
    const q = repoFilter.trim().toLowerCase();
    const filtered = q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : repos;
    if (!useCustomRepo && repo && !filtered.some((r) => r.full_name === repo)) {
      const cur = repos.find((r) => r.full_name === repo);
      if (cur) return [cur, ...filtered];
    }
    return filtered;
  }, [repos, repoFilter, repo, useCustomRepo]);

  const handleSelectRepo = (value: string) => {
    if (value === CUSTOM_REPO) {
      setUseCustomRepo(true);
      setRepo('');
      setRepoTouched(false);
      return;
    }
    setUseCustomRepo(false);
    setRepo(value);
    const chosen = repos?.find((r) => r.full_name === value);
    if (chosen?.default_branch) {
      setBranch(chosen.default_branch);
    }
  };

  const repoError = repoTouched && !REPO_RE.test(repo.trim()) ? 'Use the format owner/repo' : null;

  const done = (scan: ScanRun, msg: string) => {
    addScan(scan);
    const n = scan.projects.reduce((a, p) => a + p.metrics.totalFindings, 0);
    toast(msg, n > 0 ? 'error' : 'success');
    router.push(`/scans/${encodeURIComponent(scan.id)}`);
  };

  const submitRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepoTouched(true);
    const r = repo.trim();
    if (!REPO_RE.test(r)) return;
    setRepoBusy(true);
    try {
      if (engine === 'vulnwatch') {
        const scan = await vulnwatch.scanRepo({ repo: r, branch: branch.trim() || 'main', token: token.trim() || undefined });
        done(scan, `Scan complete: audited ${scan.projects[0]?.metrics.totalDependencies ?? 0} packages in ${r}.`);
      } else {
        const [owner, name] = r.split('/');
        const scan = await securedevops.fetchScan(owner, name, branch.trim() || 'main');
        done(scan, `Scan complete: ${scan.projects.length} project${scan.projects.length === 1 ? '' : 's'} scanned in ${r}.`);
      }
    } catch (err) {
      toast(`Scan failed: ${errorMessage(err)}`, 'error');
    } finally {
      setRepoBusy(false);
    }
  };

  const submitRaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed.error || !raw.trim()) return;
    setRawBusy(true);
    try {
      const scan = await vulnwatch.scanRaw(raw);
      done(scan, `Audit complete: ${scan.projects[0]?.metrics.vulnerableDependencies ?? 0} vulnerable packages found.`);
    } catch (err) {
      toast(`Error: ${errorMessage(err)}`, 'error');
    } finally {
      setRawBusy(false);
    }
  };

  const engines: { id: Engine; title: string; body: string; down: boolean }[] = [
    { id: 'vulnwatch', title: 'VulnWatch engine', body: 'package.json scan; supports a GitHub token for private repos.', down: state.conn.backendA === 'down' },
    { id: 'securedevops', title: 'SecureDevOps engine', body: 'package.json + lockfile, monorepo subprojects, CVSS and CWE. Public access only.', down: state.conn.backendB === 'down' },
  ];

  return (
    <>
      <PageHeader eyebrow="Scans" title="Run a scan" description="Select a GitHub repository or paste a package.json to audit against the OSV database." />
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={submitRepo} noValidate className="panel space-y-4 p-5" aria-labelledby="repo-scan-title">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-secondary" />
              <div>
                <h2 id="repo-scan-title" className="font-headline text-headline-sm text-on-surface">Scan a GitHub repository</h2>
                <p className="text-body-sm text-on-surface-variant">Choose a repository from your GitHub account to audit against OSV.</p>
              </div>
            </div>
            {gh.authenticated && (
              <Button size="sm" variant="ghost" icon={<RefreshCw className={cn('h-3.5 w-3.5', reposLoading && 'animate-spin')} />} onClick={() => void loadRepos()} disabled={reposLoading}>
                Reload
              </Button>
            )}
          </div>

          <fieldset>
            <legend className="label-caps mb-1.5">Engine</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {engines.map((en) => (
                <label
                  key={en.id}
                  className={cn(
                    'cursor-pointer rounded border p-3 transition-colors',
                    engine === en.id ? 'border-cyan/60 bg-cyan/10' : 'border-line bg-panel hover:border-cyan/30',
                  )}
                >
                  <input type="radio" name="engine" value={en.id} checked={engine === en.id} onChange={() => setEngine(en.id)} className="sr-only" />
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-on-surface">{en.title}</span>
                    {en.down && <span className="font-mono text-label-caps uppercase text-severity-medium">unreachable</span>}
                  </div>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">{en.body}</p>
                </label>
              ))}
            </div>
          </fieldset>

          {gh.authenticated ? (
            <div className="space-y-3">
              {reposError && (
                <div className="flex items-center justify-between gap-2 rounded border border-severity-critical/40 bg-severity-critical/10 px-3 py-2 text-body-sm text-severity-critical">
                  <span>Could not load repositories: {reposError}</span>
                  <Button size="sm" variant="ghost" onClick={() => void loadRepos()}>Retry</Button>
                </div>
              )}

              {repos && repos.length > 0 && (
                <>
                  <Field label={`Filter repositories (${repos.length})`}>
                    {(id) => (
                      <Input
                        id={id}
                        value={repoFilter}
                        onChange={(e) => setRepoFilter(e.target.value)}
                        placeholder="Type to filter your repositories…"
                        autoComplete="off"
                      />
                    )}
                  </Field>
                  <Field label="Select repository">
                    {(id) => (
                      <select
                        id={id}
                        value={useCustomRepo ? CUSTOM_REPO : repo}
                        onChange={(e) => handleSelectRepo(e.target.value)}
                        className="input h-10 font-mono text-mono-md"
                      >
                        {visibleRepos.map((r) => (
                          <option key={r.full_name} value={r.full_name}>
                            {r.private ? '🔒 ' : '🌐 '}
                            {r.full_name} ({r.default_branch})
                          </option>
                        ))}
                        <option value={CUSTOM_REPO}>+ Enter another repository (owner/repo)…</option>
                      </select>
                    )}
                  </Field>
                </>
              )}

              {reposLoading && !repos && (
                <div className="rounded border border-line bg-panel px-3 py-2.5 font-mono text-mono-sm text-outline">
                  Loading your GitHub repositories…
                </div>
              )}

              {(useCustomRepo || (repos && repos.length === 0) || reposError) && (
                <Field label="Repository (owner/repo)" error={repoError}>
                  {(id, d) => (
                    <Input
                      id={id}
                      aria-describedby={d}
                      aria-invalid={!!repoError}
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      onBlur={() => setRepoTouched(true)}
                      placeholder="owner/repo"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                </Field>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel p-3">
                <div className="flex items-center gap-2.5 text-body-sm text-on-surface-variant">
                  <Github className="h-4 w-4 shrink-0 text-secondary" />
                  <span>Sign in with GitHub to choose directly from your repositories.</span>
                </div>
                <Link href="/settings" className={LinkButtonClasses('primary', 'sm')}>
                  Connect GitHub
                </Link>
              </div>
              <Field label="Repository (owner/repo)" error={repoError}>
                {(id, d) => (
                  <Input
                    id={id}
                    aria-describedby={d}
                    aria-invalid={!!repoError}
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    onBlur={() => setRepoTouched(true)}
                    placeholder="owner/repo"
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch, tag or commit">{(id) => <Input id={id} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" spellCheck={false} />}</Field>
            <Field label="GitHub token (optional override)" hint={engine === 'vulnwatch' ? 'Uses your signed-in GitHub session automatically if left blank.' : 'Not used by the SecureDevOps engine.'}>
              {(id, d) => (
                <Input id={id} aria-describedby={d} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_… (optional)" disabled={engine !== 'vulnwatch'} />
              )}
            </Field>
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={repoBusy} disabled={!repo.trim() || repoBusy} icon={<Play className="h-4 w-4" />}>
            {repoBusy ? 'Scanning repository…' : 'Run vulnerability scan'}
          </Button>
        </form>

        <form onSubmit={submitRaw} noValidate className="panel space-y-4 p-5" aria-labelledby="raw-scan-title">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-secondary" />
            <div>
              <h2 id="raw-scan-title" className="font-headline text-headline-sm text-on-surface">Paste package.json</h2>
              <p className="text-body-sm text-on-surface-variant">Audits the pasted dependencies with the VulnWatch engine.</p>
            </div>
          </div>
          <Field
            label="package.json content"
            error={parsed.error ?? null}
            hint={parsed.count != null ? <span className="text-severity-safe">Valid JSON, {parsed.count} {parsed.count === 1 ? 'dependency' : 'dependencies'}</span> : 'Paste the contents of a package.json file.'}
          >
            {(id, d) => (
              <Textarea id={id} aria-describedby={d} aria-invalid={!!parsed.error} rows={12} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'{\n  "dependencies": {\n    "express": "^4.18.2"\n  }\n}'} spellCheck={false} />
            )}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={rawBusy} disabled={!raw.trim() || !!parsed.error}>
            {rawBusy ? 'Auditing dependencies…' : 'Analyze dependencies'}
          </Button>
        </form>
      </div>
    </>
  );
}
