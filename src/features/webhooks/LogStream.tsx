'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { useScan } from '@/lib/state/ScanProvider';
import { useToast } from '@/lib/state/ToastProvider';

const LEVEL: Record<string, string> = {
  error: 'text-severity-critical',
  warn: 'text-severity-medium',
  warning: 'text-severity-medium',
  success: 'text-severity-safe',
  info: 'text-secondary',
};

export function LogStream() {
  const { state, clearLogs } = useScan();
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!paused && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [state.logs, paused]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    setPaused(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
  };

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel" aria-label="Live webhook activity log">
      <div className="flex items-center justify-between border-b border-line bg-tray px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-severity-critical/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-severity-medium/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-severity-safe/80" />
          </div>
          <span className="font-mono text-mono-md text-on-surface-variant">Live webhook &amp; Smee activity stream</span>
        </div>
        <div className="flex items-center gap-2">
          {paused && <span className="font-mono text-mono-sm text-severity-medium">auto-scroll paused</span>}
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            title="Clears this view only. Backend logs are not deleted."
            onClick={() => {
              clearLogs();
              toast('Log view cleared (backend logs are untouched).', 'info');
            }}
          >
            Clear view
          </Button>
        </div>
      </div>
      <div ref={box} onScroll={onScroll} tabIndex={0} aria-label="Log lines" className="h-[420px] overflow-y-auto p-3 font-mono text-mono-md">
        {state.logs.length === 0 ? (
          <p className="text-outline">No log lines yet. Webhook deliveries and scan activity stream in here.</p>
        ) : (
          state.logs.map((l) => (
            <div key={l.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 text-outline">[{new Date(l.timestamp).toLocaleTimeString()}]</span>
              <span className={cn('shrink-0 uppercase', LEVEL[l.type] ?? 'text-on-surface-variant')}>{l.type}</span>
              <span className="break-words text-on-surface">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
