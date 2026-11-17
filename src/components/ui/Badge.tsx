import React from 'react';
import { cn } from '@/lib/utils/cn';
import { SEVERITY_STYLE } from '@/lib/domain/severity';
import type { Severity, Trigger } from '@/lib/domain/types';

export function SeverityBadge({
  severity,
  score,
  className,
}: {
  severity: Severity | 'NONE';
  score?: number;
  className?: string;
}) {
  if (severity === 'NONE') return <span className="font-mono text-mono-sm text-outline">—</span>;
  const s = SEVERITY_STYLE[severity];
  const label = severity === 'CRITICAL' ? 'CRIT' : severity === 'MEDIUM' ? 'MED' : severity;
  return (
    <span
      title={severity}
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-label-caps uppercase',
        s.bg,
        s.border,
        s.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {label}
      {score != null && <span className="font-medium normal-case tracking-normal">{score.toFixed(1)}</span>}
    </span>
  );
}

type Tone = 'neutral' | 'safe' | 'danger' | 'cyan' | 'indigo' | 'violet' | 'warn';
const TONES: Record<Tone, string> = {
  neutral: 'border-slate-400/20 bg-raised text-on-surface-variant',
  safe: 'border-severity-safe/40 bg-severity-safe/10 text-severity-safe',
  danger: 'border-severity-critical/40 bg-severity-critical/10 text-severity-critical',
  warn: 'border-severity-medium/40 bg-severity-medium/10 text-severity-medium',
  cyan: 'border-cyan/40 bg-cyan/10 text-cyan',
  indigo: 'border-indigo/40 bg-indigo/10 text-primary',
  violet: 'border-violet/40 bg-violet/10 text-violet',
};

export function Chip({
  tone = 'neutral',
  children,
  className,
  beacon,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  beacon?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-label-caps uppercase',
        TONES[tone],
        className,
      )}
    >
      {beacon && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const TRIGGER_LABEL: Record<Trigger, string> = {
  push: 'Push',
  pull_request: 'Pull request',
  'manual-repo': 'Manual repo',
  'manual-raw': 'Manual paste',
  simulated: 'Simulated',
  ping: 'Ping',
  unknown: 'Scan',
};

export function TriggerChip({ trigger }: { trigger: Trigger }) {
  const tone: Tone = trigger === 'push' || trigger === 'pull_request' ? 'indigo' : trigger === 'simulated' ? 'violet' : trigger === 'ping' ? 'cyan' : 'neutral';
  return <Chip tone={tone}>{TRIGGER_LABEL[trigger]}</Chip>;
}

export const triggerLabel = (t: Trigger) => TRIGGER_LABEL[t];
