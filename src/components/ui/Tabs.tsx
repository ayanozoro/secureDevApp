'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number | string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].id);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto rounded border border-line bg-panel p-1', className)}>
      {items.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded px-3 py-1.5 font-mono text-mono-md transition-colors',
              active ? 'bg-raised text-secondary shadow-[inset_0_0_0_1px_rgba(6,182,212,0.35)]' : 'text-on-surface-variant hover:bg-raised hover:text-on-surface',
            )}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span className={cn('rounded px-1.5 py-px text-mono-sm', active ? 'bg-cyan/15 text-secondary' : 'bg-surface-container-high text-outline')}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
