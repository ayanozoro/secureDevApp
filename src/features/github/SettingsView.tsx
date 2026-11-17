'use client';

import React, { useState } from 'react';
import { CheckCircle2, Github, OctagonAlert, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, LinkButtonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/States';
import { useGithub } from '@/lib/state/GithubProvider';
import { useScan } from '@/lib/state/ScanProvider';
import { useToast } from '@/lib/state/ToastProvider';
import { errorMessage } from '@/lib/api/http';

function BackendRow({ name, detail, health, error }: { name: string; detail: string; health: string; error?: string }) {
  const ok = health === 'up';
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-severity-safe" /> : <OctagonAlert className={health === 'down' ? 'mt-0.5 h-4 w-4 text-severity-critical' : 'mt-0.5 h-4 w-4 text-outline'} />}
      <div className="min-w-0 flex-1">
        <div className="text-body-md text-on-surface">{name}</div>
        <div className="font-mono text-mono-sm text-outline">{detail}</div>
        {error && !ok && <div className="mt-0.5 break-words text-body-sm text-severity-critical">{error}</div>}
      </div>
      <Chip tone={ok ? 'safe' : health === 'down' ? 'danger' : 'neutral'}>{ok ? 'Reachable' : health === 'down' ? 'Unreachable' : 'Unknown'}</Chip>
    </li>
  );
}

export function SettingsView() {
  const gh = useGithub();
  const toast = useToast();
  const { state, refresh } = useScan();
  const [pat, setPat] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim()) {
      toast('Please enter a GitHub Personal Access Token.', 'error');
      return;
    }
    setBusy(true);
    try {
      const user = await gh.connectToken(pat.trim());
      setPat('');
      toast(`Connected as @${user.login}.`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await gh.disconnect();
      toast('GitHub disconnected.', 'info');
      setConfirm(false);
    } catch (err) {
      toast(`Failed to disconnect: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Settings" title="GitHub connection" description="Authorize GitHub to list your repositories and install webhooks automatically." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="panel p-5" aria-label="GitHub connection">
          {gh.status === 'loading' ? (
            <SkeletonRows rows={3} />
          ) : gh.authenticated && gh.user ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {gh.user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gh.user.avatar_url} alt="" className="h-12 w-12 rounded-full" />
                  ) : (
                    <Github className="h-10 w-10 text-secondary" />
                  )}
                  <div>
                    <div className="flex items-center gap-2 text-body-md text-on-surface">
                      {gh.user.name || gh.user.login} <Chip tone="safe">Authorized</Chip>
                    </div>
                    <div className="font-mono text-mono-sm text-outline">@{gh.user.login}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void gh.refresh()}>
                    Refresh status
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
                    Disconnect
                  </Button>
                </div>
              </div>
              <p className="text-body-sm text-on-surface-variant">Repositories and webhooks are managed under Webhooks → Repositories.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {gh.error && <p role="alert" className="break-words rounded border border-severity-critical/40 bg-severity-critical/10 px-3 py-2 text-body-sm text-severity-critical">Could not read GitHub status: {gh.error}</p>}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-line bg-panel p-4">
                <div className="flex items-center gap-3">
                  <Github className="h-9 w-9 text-on-surface" />
                  <div>
                    <div className="text-body-md font-medium text-on-surface">Connect your GitHub account</div>
                    <p className="text-body-sm text-on-surface-variant">Requests <code className="font-mono text-secondary">admin:repo_hook</code> to register the webhook URL and secret.</p>
                  </div>
                </div>
                {/* Full navigation on purpose: this starts the OAuth flow on the backend. */}
                <a href="/auth/github" className={LinkButtonClasses('primary')}>
                  <Github className="mr-2 h-4 w-4" /> Authorize with GitHub
                </a>
              </div>
              <form onSubmit={link} className="space-y-2" noValidate>
                <Field label="Or use a personal access token (admin:repo_hook scope)">
                  {(id) => (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input id={id} type="password" autoComplete="off" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="ghp_xxxxxxxxxxxx" />
                      <Button type="submit" loading={busy}>
                        Link token
                      </Button>
                    </div>
                  )}
                </Field>
              </form>
            </div>
          )}
        </section>

        <section className="panel p-5" aria-label="Backend status">
          <div className="flex items-center justify-between">
            <h2 className="font-headline text-headline-sm text-on-surface">Backend status</h2>
            <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refresh()}>
              Recheck
            </Button>
          </div>
          <ul className="mt-2 divide-y divide-slate-400/10">
            <BackendRow name="VulnWatch backend" detail="/api/a → scans, auth, repos, logs, SSE" health={state.conn.backendA} error={state.errors.vulnwatch} />
            <BackendRow name="SecureDevOps backend" detail="/api/b → activity, simulate, info, SSE" health={state.conn.backendB} error={state.errors.securedevops} />
          </ul>
          <p className="mt-2 text-body-sm text-outline">Base URLs are set with VULNWATCH_API_URL and SECUREDEVOPS_API_URL at build/start time.</p>
        </section>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Disconnect GitHub?"
        danger
        confirmLabel="Disconnect"
        loading={busy}
        message="Webhooks already installed keep working, but you won't be able to list repositories or manage hooks until you reconnect."
        onCancel={() => setConfirm(false)}
        onConfirm={disconnect}
      />
    </>
  );
}
