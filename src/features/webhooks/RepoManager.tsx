'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Github, Globe, Lock, RefreshCw, Scan, Trash2, Zap } from 'lucide-react';
import { Button, LinkButtonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useGithub } from '@/lib/state/GithubProvider';
import { useScan } from '@/lib/state/ScanProvider';
import { useToast } from '@/lib/state/ToastProvider';
import { vulnwatch } from '@/lib/api/vulnwatch';
import { errorMessage } from '@/lib/api/http';
import type { GithubRepo } from '@/lib/domain/types';

type HookState = { status: 'checking' } | { status: 'active'; hookId?: number | string } | { status: 'inactive' } | { status: 'unknown' };

export function RepoManager() {
  const gh = useGithub();
  const toast = useToast();
  const router = useRouter();
  const { addScan, state } = useScan();

  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState('');
  const [hook, setHook] = useState<HookState>({ status: 'unknown' });
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState<null | 'install' | 'remove' | 'scan'>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const seq = useRef(0);

  const loadRepos = useCallback(async () => {
    setRepos(null);
    setLoadError(null);
    try {
      const list = await vulnwatch.repos();
      setRepos(list);
      setSelected((cur) => (list.some((r) => r.full_name === cur) ? cur : (list[0]?.full_name ?? '')));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (gh.authenticated) void loadRepos();
  }, [gh.authenticated, loadRepos]);

  const checkHook = useCallback(async (repo: string) => {
    if (!repo) return;
    const mine = ++seq.current;
    setHook({ status: 'checking' });
    try {
      const d = await vulnwatch.checkWebhook(repo);
      if (mine !== seq.current) return;
      setHook(d.installed ? { status: 'active', hookId: d.hookId } : { status: 'inactive' });
    } catch {
      if (mine === seq.current) setHook({ status: 'unknown' });
    }
  }, []);

  useEffect(() => {
    const r = repos?.find((x) => x.full_name === selected);
    setBranch(r?.default_branch ?? 'main');
    void checkHook(selected);
  }, [selected, repos, checkHook]);

  if (gh.status === 'loading') return <SkeletonRows rows={3} />;

  if (!gh.authenticated) {
    return (
      <EmptyState
        icon={<Github className="h-6 w-6" />}
        title="Connect GitHub to manage webhooks"
        message={gh.error ? `GitHub status could not be read: ${gh.error}` : 'Authorize with GitHub (OAuth or a personal access token) to list your repositories and install webhooks automatically.'}
        action={
          <Link href="/settings" className={LinkButtonClasses('primary')}>
            Open GitHub settings
          </Link>
        }
      />
    );
  }

  if (loadError) return <ErrorState title="Could not load repositories" message={loadError} onRetry={() => void loadRepos()} />;
  if (!repos) return <SkeletonRows rows={3} />;
  if (repos.length === 0)
    return (
      <EmptyState
        icon={<Github className="h-6 w-6" />}
        title="No repositories with admin access"
        message="Webhooks can only be managed on repositories where you have admin permission."
        action={<Button onClick={() => void loadRepos()} icon={<RefreshCw className="h-4 w-4" />}>Reload repositories</Button>}
      />
    );

  const visible = repos.filter((r) => r.full_name.toLowerCase().includes(filter.trim().toLowerCase()));
  const options = visible.some((r) => r.full_name === selected) || !selected ? visible : [repos.find((r) => r.full_name === selected)!, ...visible];

  const install = async () => {
    setBusy('install');
    try {
      await vulnwatch.setupWebhook(selected);
      toast(`Webhook configured on ${selected}. GitHub sent a ping event.`, 'success');
      await checkHook(selected);
    } catch (err) {
      toast(`Failed to install webhook: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (hook.status !== 'active' || hook.hookId == null) return;
    setBusy('remove');
    try {
      await vulnwatch.removeWebhook(selected, hook.hookId);
      toast(`Webhook removed from ${selected}.`, 'info');
      setConfirmRemove(false);
      await checkHook(selected);
    } catch (err) {
      toast(`Failed to remove webhook: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const scanNow = async () => {
    setBusy('scan');
    toast(`Starting on-demand scan for ${selected}…`, 'info');
    try {
      const scan = await vulnwatch.scanRepo({ repo: selected, branch: branch.trim() || 'main' });
      addScan(scan);
      toast(`Scan complete for ${selected}.`, 'success');
      router.push(`/scans/${encodeURIComponent(scan.id)}`);
    } catch (err) {
      toast(`Scan failed: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel p-3">
        <div className="flex items-center gap-3">
          {gh.user?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gh.user.avatar_url} alt="" className="h-9 w-9 rounded-full" />
          ) : (
            <Github className="h-8 w-8 text-secondary" />
          )}
          <div>
            <div className="flex items-center gap-2 text-body-md text-on-surface">
              {gh.user?.name || gh.user?.login} <Chip tone="safe">Authorized</Chip>
            </div>
            <div className="font-mono text-mono-sm text-outline">@{gh.user?.login}</div>
          </div>
        </div>
        <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void loadRepos()}>
          Reload repos
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <Field label={`Filter repositories (${repos.length})`}>
            {(id) => <Input id={id} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to filter…" />}
          </Field>
          <Field label="Repository (admin access)">
            {(id) => (
              <select id={id} value={selected} onChange={(e) => setSelected(e.target.value)} className="input h-10 font-mono text-mono-md">
                {options.map((r) => (
                  <option key={r.full_name} value={r.full_name}>
                    {r.private ? '🔒 ' : '🌐 '}
                    {r.full_name} ({r.default_branch})
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div>
          <div className="label-caps mb-1.5">Webhook status</div>
          <div aria-live="polite">
            {hook.status === 'checking' && <Chip tone="cyan" beacon>Checking GitHub…</Chip>}
            {hook.status === 'active' && <Chip tone="safe">Webhook active{hook.hookId != null ? ` · hook ${hook.hookId}` : ''}</Chip>}
            {hook.status === 'inactive' && <Chip tone="warn">Not configured</Chip>}
            {hook.status === 'unknown' && <Chip>Status unknown</Chip>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Button variant="primary" onClick={install} loading={busy === 'install'} disabled={!selected || busy !== null} icon={<Zap className="h-4 w-4" />}>
          {hook.status === 'active' ? 'Re-register webhook' : 'Auto-install webhook'}
        </Button>
        <div className="flex items-end gap-2">
          <Field label="Scan branch" className="w-36">{(id) => <Input id={id} value={branch} onChange={(e) => setBranch(e.target.value)} className="h-10" />}</Field>
          <Button onClick={scanNow} loading={busy === 'scan'} disabled={!selected || busy !== null} icon={<Scan className="h-4 w-4" />}>
            Scan now
          </Button>
        </div>
        {hook.status === 'active' && hook.hookId != null && (
          <Button variant="danger" onClick={() => setConfirmRemove(true)} disabled={busy !== null} icon={<Trash2 className="h-4 w-4" />}>
            Remove webhook
          </Button>
        )}
      </div>

      <dl className="grid gap-3 border-t border-line pt-4 text-body-sm text-on-surface-variant sm:grid-cols-3">
        <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-secondary" /><dt className="font-medium text-on-surface">Target URL</dt><dd className="min-w-0 truncate font-mono text-mono-sm">{state.smeeUrl ?? 'unavailable'}</dd></div>
        <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-secondary" /><dt className="font-medium text-on-surface">Secret</dt><dd className="font-mono text-mono-sm">set in backend .env</dd></div>
        <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-secondary" /><dt className="font-medium text-on-surface">Events</dt><dd className="font-mono text-mono-sm">push, pull_request, ping</dd></div>
      </dl>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove webhook?"
        danger
        confirmLabel="Remove webhook"
        loading={busy === 'remove'}
        message={<>This stops automatic scans on every push to <strong className="font-mono text-on-surface">{selected}</strong>. You can install it again at any time.</>}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={remove}
      />
    </div>
  );
}
