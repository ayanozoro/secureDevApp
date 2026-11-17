import React, { useId } from 'react';
import { cn } from '@/lib/utils/cn';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string, describedBy?: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="label-caps block">
        {label}
      </label>
      {children(id, descId)}
      {(error || hint) && (
        <p id={descId} className={cn('text-body-sm', error ? 'text-severity-critical' : 'text-outline')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn('input', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input h-10 appearance-none pr-8 font-mono text-mono-md', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('input font-mono text-mono-md', className)} {...rest} />;
}
