'use client';

import React from 'react';
import { ToastProvider } from '@/lib/state/ToastProvider';
import { ScanProvider } from '@/lib/state/ScanProvider';
import { GithubProvider } from '@/lib/state/GithubProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ScanProvider>
        <GithubProvider>{children}</GithubProvider>
      </ScanProvider>
    </ToastProvider>
  );
}
