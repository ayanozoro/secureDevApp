import type { Severity } from './types';

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0,
};

export function normalizeSeverity(value: unknown): Severity {
  const s = String(value ?? '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW') return s;
  if (s === 'MODERATE') return 'MEDIUM';
  return 'UNKNOWN';
}

/** Tailwind class sets per severity. Colour is never the only cue: badges always print the label. */
export const SEVERITY_STYLE: Record<
  Severity,
  { text: string; bg: string; border: string; dot: string; bar: string; hex: string }
> = {
  CRITICAL: { text: 'text-severity-critical', bg: 'bg-severity-critical/10', border: 'border-severity-critical/40', dot: 'bg-severity-critical', bar: 'bg-severity-critical', hex: '#EF4444' },
  HIGH: { text: 'text-severity-high', bg: 'bg-severity-high/10', border: 'border-severity-high/40', dot: 'bg-severity-high', bar: 'bg-severity-high', hex: '#F97316' },
  MEDIUM: { text: 'text-severity-medium', bg: 'bg-severity-medium/10', border: 'border-severity-medium/40', dot: 'bg-severity-medium', bar: 'bg-severity-medium', hex: '#F59E0B' },
  LOW: { text: 'text-severity-low', bg: 'bg-severity-low/10', border: 'border-severity-low/40', dot: 'bg-severity-low', bar: 'bg-severity-low', hex: '#3B82F6' },
  UNKNOWN: { text: 'text-severity-unknown', bg: 'bg-severity-unknown/10', border: 'border-severity-unknown/40', dot: 'bg-severity-unknown', bar: 'bg-severity-unknown', hex: '#6B7280' },
};
