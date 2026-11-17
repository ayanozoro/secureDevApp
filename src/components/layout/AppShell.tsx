'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useGithub } from '@/lib/state/GithubProvider';
import { useScan } from '@/lib/state/ScanProvider';
import { useToast } from '@/lib/state/ToastProvider';

/** Handles backend A's legacy redirects: `/?auth=success|failed|error` and `/?tab=<legacy tab id>`. */
function LegacyRedirects() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const gh = useGithub();
  const { latest } = useScan();
  const auth = params.get('auth');
  const tab = params.get('tab');

  useEffect(() => {
    if (pathname !== '/') return;
    if (auth) {
      if (auth === 'success') {
        toast('GitHub authorized successfully. Ready to configure webhooks.', 'success');
        void gh.refresh();
      } else {
        toast(`GitHub authorization failed: ${params.get('error') || params.get('message') || 'Unknown error'}`, 'error');
      }
      router.replace('/settings');
      return;
    }
    if (tab) {
      const map: Record<string, string> = {
        'tab-setup': '/webhooks?tab=guide',
        setup: '/webhooks?tab=guide',
        'tab-logs': '/webhooks?tab=logs',
        'tab-manual': '/scans/new',
        'tab-history': '/scans',
        'tab-vulns': latest ? `/scans/${encodeURIComponent(latest.id)}` : '/',
        'tab-packages': latest ? `/scans/${encodeURIComponent(latest.id)}?tab=packages` : '/',
      };
      router.replace(map[tab] ?? '/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, tab, pathname]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <LegacyRedirects />
      </Suspense>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded focus:bg-indigo focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 animate-fadeIn border-r border-line" aria-label="Navigation">
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <TopBar onMenu={() => setDrawer(true)} />
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
