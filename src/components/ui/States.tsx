import React from 'react';
import { OctagonAlert, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded bg-[linear-gradient(90deg,#101827,#172235,#101827)] bg-[length:200%_100%]',
        className,
      )}
    />
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('space-y-2 p-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  message?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-raised text-secondary">{icon}</div>
      <h3 className="font-headline text-headline-sm text-on-surface">{title}</h3>
      {message && <p className="max-w-md text-body-md text-on-surface-variant">{message}</p>}
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-severity-critical/40 bg-severity-critical/10 text-severity-critical">
        <OctagonAlert className="h-6 w-6" />
      </div>
      <h3 className="font-headline text-headline-sm text-on-surface">{title}</h3>
      {message && <p className="max-w-md break-words text-body-md text-on-surface-variant">{message}</p>}
      {onRetry && (
        <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
