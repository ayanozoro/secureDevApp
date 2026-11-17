'use client';

import React from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useScan } from '@/lib/state/ScanProvider';
import { useCopy } from '@/hooks/useCopy';

function CodeBox({ value, label }: { value: string; label: string }) {
  const copy = useCopy();
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded border border-line bg-panel px-3 py-2">
      <code className="min-w-0 truncate font-mono text-mono-md text-secondary">{value}</code>
      <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(value, `${label} copied`)}>
        Copy
      </Button>
    </div>
  );
}

export function SetupGuide() {
  const { state } = useScan();
  const url = state.smeeUrl;
  const steps: { title: string; body: React.ReactNode }[] = [
    { title: 'Open your repository settings', body: <>Go to your GitHub repository, then <strong>Settings</strong> → <strong>Webhooks</strong> → <strong>Add webhook</strong>.</> },
    {
      title: 'Set the payload URL',
      body: url ? (
        <>
          Paste the Smee.io delivery URL into <strong>Payload URL</strong>:
          <CodeBox value={url} label="Payload URL" />
        </>
      ) : (
        <>The delivery URL could not be read from the backends. Check that a backend is running, then reload this page.</>
      ),
    },
    {
      title: 'Set content type and secret',
      body: (
        <>
          Select <strong>Content type</strong>: <code className="font-mono text-secondary">application/json</code>. Set the <strong>Secret</strong> to the value of the webhook secret in your backend&apos;s <code className="font-mono text-secondary">.env</code>. It is never shown in this app.
        </>
      ),
    },
    { title: 'Select trigger events', body: <>Choose <strong>Let me select individual events</strong> and tick <strong>Pushes</strong> and <strong>Pull requests</strong> (or just the push event).</> },
    { title: 'Save and test', body: <>Click <strong>Add webhook</strong>. GitHub sends a <code className="font-mono text-secondary">ping</code> immediately; it appears in the Activity and Logs tabs.</> },
  ];
  return (
    <ol className="space-y-3 p-5">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded border border-line bg-panel p-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-cyan/40 bg-cyan/10 font-mono text-mono-md text-cyan">{i + 1}</span>
          <div className="min-w-0 text-body-md text-on-surface-variant">
            <h3 className="font-medium text-on-surface">{s.title}</h3>
            <div className="mt-1">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
