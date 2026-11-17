import React from 'react';
import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 font-mono text-mono-sm text-outline">
      {items.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 && <span className="text-outline-variant">/</span>}
          {c.href ? (
            <Link href={c.href} className="hover:text-on-surface">
              {c.label}
            </Link>
          ) : (
            <span className="text-secondary" aria-current="page">
              {c.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="label-caps mb-1 text-cyan">{eyebrow}</div>}
        <h1 className="font-headline text-headline-lg text-on-surface">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
