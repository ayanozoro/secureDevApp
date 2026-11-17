import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo text-white border border-white/15 hover:bg-indigo-hover hover:border-cyan/40',
  secondary: 'bg-tray text-on-surface border border-slate-400/25 hover:border-cyan hover:text-secondary',
  ghost: 'bg-transparent text-on-surface-variant border border-transparent hover:bg-raised hover:text-on-surface',
  danger: 'bg-[#170A0F] text-severity-critical border border-severity-critical/40 hover:border-severity-critical',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-body-sm gap-1.5',
  md: 'h-10 px-4 text-body-md gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButtonClasses(variant: Variant = 'secondary', size: Size = 'md') {
  return cn(
    'inline-flex items-center justify-center rounded font-medium transition-colors',
    VARIANTS[variant],
    SIZES[size],
  );
}
