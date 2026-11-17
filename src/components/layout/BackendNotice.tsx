'use client';

import React from 'react';
import { OctagonAlert } from 'lucide-react';
import { useScan } from '@/lib/state/ScanProvider';

/** Shows which backend is unreachable so partial data is never mistaken for complete data. */
export function BackendNotice() {
  const { state, refresh } = useScan();
  const { backendA, backendB } = state.conn;
  const down: string[] = [];
  if (backendA === 'down') down.push(`VulnWatch backend: ${state.errors.vulnwatch ?? 'unreachable'}`);
  if (backendB === 'down') down.push(`SecureDevOps backend: ${state.errors.securedevops ?? 'unreachable'}`);
  if (down.length === 0 || !state.loaded) return null;
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-severity-medium/40 bg-severity-medium/10 px-4 py-3 text-body-sm text-severity-medium">
      <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Some data may be missing</div>
        <ul className="mt-0.5 space-y-0.5 break-words text-on-surface-variant">
          {down.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
      <button onClick={() => void refresh()} className="rounded border border-severity-medium/40 px-2.5 py-1 text-body-sm hover:bg-severity-medium/10">
        Retry
      </button>
    </div>
  );
}
