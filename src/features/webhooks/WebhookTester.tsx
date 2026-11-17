'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, Copy, OctagonAlert, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Field';
import { useScan } from '@/lib/state/ScanProvider';
import { useToast } from '@/lib/state/ToastProvider';
import { useCopy } from '@/hooks/useCopy';
import { securedevops, type SimulationResult, type WebhookInfo } from '@/lib/api/securedevops';
import { errorMessage } from '@/lib/api/http';
import { cn } from '@/lib/utils/cn';

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div>
      <div className="label-caps mb-1.5">{label}</div>
      <div role="radiogroup" aria-label={label} className="grid grid-flow-col gap-1 rounded border border-line bg-panel p-1">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            type="button"
            className={cn('rounded px-3 py-1.5 font-mono text-mono-md transition-colors', value === o.value ? 'bg-indigo text-white' : 'text-on-surface-variant hover:bg-raised')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WebhookTester() {
  const { latest, addScan, state } = useScan();
  const toast = useToast();
  const router = useRouter();
  const copy = useCopy();

  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [ref, setRef] = useState('main');
  const [event, setEvent] = useState<'push' | 'ping'>('push');
  const [target, setTarget] = useState<'local' | 'smee'>('local');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    securedevops.info().then(setInfo).catch((e) => setInfoError(errorMessage(e)));
  }, []);

  // Pre-fill once from the most recent scan; never from hard-coded values.
  useEffect(() => {
    if (prefilled || !latest?.repo?.includes('/')) return;
    const [o, r] = latest.repo.split('/');
    setOwner(o);
    setRepo(r);
    if (latest.ref) setRef(latest.ref);
    setPrefilled(true);
  }, [latest, prefilled]);

  const valid = owner.trim() && repo.trim() && ref.trim();

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await securedevops.simulate({ owner, repo, ref, event, target }));
    } catch (err) {
      toast(`Simulation failed: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const scan = result ? securedevops.scanFromSimulation(result, `${owner.trim()}/${repo.trim()}`, ref.trim()) : undefined;

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-2">
      <form onSubmit={send} className="space-y-4" noValidate>
        <div className="flex items-center gap-2">
          <Chip tone="violet">Simulation</Chip>
          <span className="text-body-sm text-on-surface-variant">Sends a signed test delivery. Not a real GitHub event.</span>
        </div>

        <div className="rounded border border-line bg-panel p-3">
          <div className="label-caps mb-1">Smee relay URL</div>
          {info?.smeeUrl ? (
            <div className="flex items-center justify-between gap-2">
              <code className="min-w-0 truncate font-mono text-mono-md text-secondary">{info.smeeUrl}</code>
              <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(info.smeeUrl, 'Smee URL copied')}>
                Copy
              </Button>
            </div>
          ) : (
            <p className="text-body-sm text-outline">{infoError ? `Webhook info unavailable: ${infoError}` : 'Loading…'}</p>
          )}
          {info && <p className="mt-1 font-mono text-mono-sm text-outline">Local target: {info.localWebhookUrl} · Secret configured: {info.hasWebhookSecret ? 'yes' : 'no'}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Owner">{(id) => <Input id={id} value={owner} onChange={(e) => setOwner(e.target.value)} spellCheck={false} />}</Field>
          <Field label="Repository">{(id) => <Input id={id} value={repo} onChange={(e) => setRepo(e.target.value)} spellCheck={false} />}</Field>
        </div>
        <Field label="Ref (branch)">{(id) => <Input id={id} value={ref} onChange={(e) => setRef(e.target.value)} spellCheck={false} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented label="Event" value={event} onChange={setEvent} options={[{ value: 'push', label: 'push' }, { value: 'ping', label: 'ping' }]} />
          <Segmented label="Target" value={target} onChange={setTarget} options={[{ value: 'local', label: 'Local receiver' }, { value: 'smee', label: 'Smee relay' }]} />
        </div>
        <Button type="submit" variant="primary" loading={busy} disabled={!valid} icon={<Send className="h-4 w-4" />}>
          {busy ? 'Sending…' : 'Send test event'}
        </Button>
        {state.conn.backendB === 'down' && <p className="text-body-sm text-severity-medium">The SecureDevOps backend is unreachable, so simulations will fail until it is back.</p>}
      </form>

      <div aria-live="polite">
        {!result ? (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded border border-dashed border-line p-6 text-center text-body-sm text-outline">
            Delivery result appears here.
          </div>
        ) : (
          <div className="space-y-3 rounded border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              {result.success ? <Chip tone="safe"><CheckCircle2 className="h-3 w-3" /> Delivered</Chip> : <Chip tone="danger"><OctagonAlert className="h-3 w-3" /> Failed</Chip>}
              <Chip tone={result.statusCode >= 200 && result.statusCode < 300 ? 'safe' : 'danger'}>HTTP {result.statusCode}</Chip>
              <Chip tone={result.signatureVerified ? 'safe' : 'warn'}>{result.signatureVerified ? <><Check className="h-3 w-3" /> Signature verified</> : 'Signature not verified'}</Chip>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-mono-sm">
              <dt className="text-outline">Delivery</dt><dd className="break-all text-on-surface">{result.deliveryId}</dd>
              <dt className="text-outline">Event</dt><dd className="text-on-surface">{result.event}</dd>
              <dt className="text-outline">Target</dt><dd className="break-all text-on-surface">{result.targetUrl}</dd>
              <dt className="text-outline">Time</dt><dd className="text-on-surface">{result.timestamp}</dd>
            </dl>
            {result.error && <p className="break-words text-body-sm text-severity-critical">{typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}</p>}
            <details>
              <summary className="cursor-pointer font-mono text-mono-sm text-secondary">Response payload</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-canvas p-3 font-mono text-mono-sm text-on-surface-variant">{JSON.stringify(result.data, null, 2)}</pre>
            </details>
            {scan && (
              <Button
                variant="primary"
                onClick={() => {
                  addScan(scan);
                  toast(`Simulated push processed: ${scan.projects.length} project(s).`, 'success');
                  router.push(`/scans/${encodeURIComponent(scan.id)}`);
                }}
              >
                Open simulated scan results
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
