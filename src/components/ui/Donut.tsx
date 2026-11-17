import React from 'react';
import { SEVERITY_STYLE } from '@/lib/domain/severity';
import type { SeverityCounts } from '@/lib/domain/types';

const ORDER: { key: keyof SeverityCounts; sev: keyof typeof SEVERITY_STYLE }[] = [
  { key: 'critical', sev: 'CRITICAL' },
  { key: 'high', sev: 'HIGH' },
  { key: 'medium', sev: 'MEDIUM' },
  { key: 'low', sev: 'LOW' },
  { key: 'unknown', sev: 'UNKNOWN' },
];

/** Severity ring built from real counts. Renders an empty ring when there are no findings. */
export function SeverityDonut({ counts, size = 88 }: { counts: SeverityCounts; size?: number }) {
  const total = ORDER.reduce((n, o) => n + counts[o.key], 0);
  const r = 34;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" role="img" aria-label={`${total} findings by severity`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="#172235" strokeWidth="10" />
      {total > 0 &&
        ORDER.map(({ key, sev }) => {
          const n = counts[key];
          if (!n) return null;
          const len = (n / total) * c;
          const el = (
            <circle
              key={key}
              cx="44"
              cy="44"
              r={r}
              fill="none"
              stroke={SEVERITY_STYLE[sev].hex}
              strokeWidth="10"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 44 44)"
            />
          );
          offset += len;
          return el;
        })}
      <text x="44" y="49" textAnchor="middle" className="fill-on-surface font-headline" fontSize="18" fontWeight="700">
        {total}
      </text>
    </svg>
  );
}
