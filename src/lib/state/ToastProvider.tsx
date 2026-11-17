'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Info, OctagonAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}
type ToastFn = (message: string, kind?: Kind) => void;

const ToastContext = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastContext);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastFn>(
    (message, kind = 'info') => {
      const id = ++counter;
      setItems((l) => [...l.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
      >
        {items.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? OctagonAlert : Info;
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex animate-fadeIn items-start gap-2 rounded-lg border bg-raised px-3 py-2.5 text-body-md shadow-raised',
                t.kind === 'success' && 'border-severity-safe/40 text-severity-safe',
                t.kind === 'error' && 'border-severity-critical/40 text-severity-critical',
                t.kind === 'info' && 'border-cyan/40 text-secondary',
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 break-words text-on-surface">{t.message}</span>
              <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-outline hover:text-on-surface">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
