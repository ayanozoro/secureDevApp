'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Database,
  GitPullRequest,
  Github,
  Mail,
  Radar,
  ShieldCheck,
  Webhook,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Github,
    title: 'One-Click GitHub OAuth',
    desc: 'Sign in securely with GitHub to browse all public and private repositories with admin access.',
    accent: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  },
  {
    icon: Webhook,
    title: 'Automated Webhook Setup',
    desc: 'Register HMAC-SHA256 signed webhooks in one click. Every push and PR triggers an instant audit.',
    accent: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  },
  {
    icon: Radar,
    title: 'Monorepo OSV Discovery',
    desc: 'Uses GitHub Git Trees to locate every package.json at any depth and hydrate full OSV advisories.',
    accent: 'text-cyan border-cyan/30 bg-cyan/10',
  },
  {
    icon: GitPullRequest,
    title: 'Non-Breaking Fix PRs',
    desc: 'Automatically opens a clean upgrade Pull Request preferring same-major patched versions.',
    accent: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  {
    icon: Mail,
    title: 'Multi-Channel Alerts',
    desc: 'Receive HTML email reports, GitHub Commit/PR comments, and self-healing Security Alert Issues.',
    accent: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  {
    icon: Database,
    title: 'MongoDB Per-User History',
    desc: 'Every scan, webhook delivery, log line, and fix PR is persisted per user across restarts.',
    accent: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  },
];

const PIPELINE_STEPS = [
  { step: '01', title: 'Connect GitHub', detail: 'Authorize via GitHub OAuth & select any repository.' },
  { step: '02', title: 'Install Webhook', detail: 'One click registers an HMAC-verified push/PR hook.' },
  { step: '03', title: 'Hydrate & Audit', detail: 'Discovers all package.json files & queries OSV.dev.' },
  { step: '04', title: 'Auto-Patch & Alert', detail: 'Opens Fix PR, posts Commit/Issue alerts & sends email.' },
];

export function PipelineFeaturesSection() {
  return (
    <>
      {/* Features Grid */}
      <section id="features" className="border-t border-slate-800/70 bg-[#080c14] py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="font-mono text-[11px] tracking-widest uppercase text-sky-400">
              {'// CAPABILITIES'}
            </div>
            <h2 className="mt-2 font-headline text-3xl font-bold text-white sm:text-4xl">
              Everything Built Into{' '}
              <span className="font-hand text-4xl text-sky-400 sm:text-5xl">One Pipeline</span>
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-800 bg-[#0c1220] p-6 transition-all hover:border-sky-500/40 hover:bg-[#0f1729]"
              >
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${f.accent}`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-headline text-base font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline Steps + Final CTA */}
      <section id="pipeline" className="border-t border-slate-800/70 bg-[#070b12] py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="font-mono text-[11px] tracking-widest uppercase text-sky-400">
              {'// EXECUTION PIPELINE'}
            </div>
            <h2 className="mt-2 font-headline text-3xl font-bold text-white sm:text-4xl">
              From Git Push to Merged Fix in{' '}
              <span className="font-hand text-4xl text-emerald-400 sm:text-5xl">4 Steps</span>
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STEPS.map((item) => (
              <div
                key={item.step}
                className="relative rounded-xl border border-slate-800 bg-[#0c1220] p-5"
              >
                <div className="font-mono text-xs font-bold text-sky-400">STEP {item.step}</div>
                <div className="mt-2 font-headline text-base font-bold text-white">{item.title}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>

          {/* Final CTA Card */}
          <div className="mt-16 rounded-2xl border border-sky-500/30 bg-gradient-to-br from-[#0e192d] via-[#0b1222] to-[#11152b] p-8 text-center shadow-[0_0_60px_rgba(56,189,248,0.12)] sm:p-12">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/10 text-sky-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-headline text-2xl font-bold text-white sm:text-3xl">
              Ready to lock down your dependencies?
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
              Connect your GitHub account, choose a repository, and let SecureDevOps watch every commit automatically.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-6 py-3 font-mono text-sm font-semibold text-slate-950 shadow-[0_0_25px_rgba(56,189,248,0.35)] transition-all hover:bg-sky-300"
              >
                <span>Open Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-[#0b111e] px-6 py-3 font-mono text-sm text-slate-200 transition-colors hover:border-sky-400/50 hover:text-white"
              >
                <Github className="h-4 w-4" />
                <span>Connect GitHub</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#060910] py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 font-mono text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="h-4 w-4 text-sky-400" />
            <span>SecureDevOps · OSV Vulnerability Intelligence</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="hover:text-sky-300">Dashboard</Link>
            <Link href="/scans/new" className="hover:text-sky-300">Run Scan</Link>
            <Link href="/webhooks" className="hover:text-sky-300">Webhooks</Link>
            <Link href="/settings" className="hover:text-sky-300">Settings</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
