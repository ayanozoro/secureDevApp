'use client';

import React from 'react';
import Link from 'next/link';
import { Github, LayoutGrid, ShieldCheck } from 'lucide-react';
import { useGithub } from '@/lib/state/GithubProvider';

const NAV_LINKS = [
  { href: '#sketchbook', label: '// Sketchbook' },
  { href: '#live-demo', label: '// Live Demo' },
  { href: '#features', label: '// Features' },
  { href: '#pipeline', label: '// Pipeline' },
];

export function LandingNavbar() {
  const gh = useGithub();
  const initial = gh.user?.login ? gh.user.login.slice(0, 1).toUpperCase() : null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-700/40 bg-[#080d16]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-400/40 bg-sky-500/10 text-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.18)] transition-transform group-hover:scale-105">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-headline text-sm font-bold tracking-wider text-white">
                SECUREDEVOPS
              </span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300 border border-amber-400/30">
                v1.0
              </span>
            </div>
            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-slate-400">
              AUTOMATED DEVSECOPS
            </div>
          </div>
        </Link>

        {/* Center Monospace Nav */}
        <nav aria-label="Landing navigation" className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-mono text-xs text-slate-400 transition-colors hover:text-sky-300"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-3.5 py-2 font-mono text-xs font-semibold text-slate-950 shadow-[0_0_24px_rgba(56,189,248,0.35)] transition-all hover:bg-sky-300 hover:shadow-[0_0_32px_rgba(56,189,248,0.5)]"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Go to Dashboard</span>
          </Link>

          <Link
            href="/settings"
            title={gh.authenticated && gh.user ? `Signed in as @${gh.user.login}` : 'Connect GitHub'}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-600/80 font-mono text-xs font-bold text-white transition-colors hover:bg-emerald-500"
          >
            {gh.authenticated && gh.user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gh.user.avatar_url}
                alt={gh.user.login}
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : initial ? (
              initial
            ) : (
              <Github className="h-4 w-4" />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
