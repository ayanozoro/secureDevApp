'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Flame,
  GitPullRequest,
  Mail,
  MessageSquareCode,
  Pencil,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type ArenaTab = 'results' | 'pr' | 'alerts';

export function LiveBenchmarkSection() {
  const [tab, setTab] = useState<ArenaTab>('results');

  return (
    <section id="live-demo" className="relative border-t border-slate-800/70 bg-[#070b12] py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Real Live Scan:
            <span className="mt-1 block font-hand text-4xl font-bold text-sky-400 sm:text-6xl">
              openMesh Monorepo
            </span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">
            Witness how SecureDevOps discovers every <code className="font-mono text-sky-300">package.json</code> across
            a live monorepo, hydrates real OSV.dev advisories, and prepares non-breaking fix PRs.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 font-hand text-xl text-emerald-400">
            <Pencil className="h-4 w-4 text-amber-300" />
            <span>Zero breaking major bumps — strictly prefers same-major patched releases.</span>
          </p>
        </div>

        {/* macOS Window Arena */}
        <div className="mt-12 overflow-hidden rounded-2xl border border-slate-700/70 bg-[#0b111e] shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
          {/* Window Title Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0d1424] px-5 py-3.5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-500/90" />
                <span className="h-3 w-3 rounded-full bg-amber-400/90" />
                <span className="h-3 w-3 rounded-full bg-emerald-400/90" />
              </div>
              <span className="font-mono text-xs text-slate-400">
                scanner://ayanozoro/openMesh
              </span>
            </div>

            {/* Segmented Tabs */}
            <div className="flex flex-wrap items-center gap-1 rounded-full border border-slate-700/70 bg-[#080d17] p-1">
              {[
                { id: 'results' as const, label: '1. Vulnerability Arena' },
                { id: 'pr' as const, label: '2. Auto-Fix PR Diff' },
                { id: 'alerts' as const, label: '3. GitHub & Email Alerts' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 font-mono text-xs font-medium transition-all',
                    tab === item.id
                      ? 'bg-sky-400 text-slate-950 font-semibold shadow-[0_0_16px_rgba(56,189,248,0.4)]'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Window Body */}
          <div className="p-5 sm:p-7">
            {tab === 'results' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] tracking-widest uppercase text-slate-400">
                    MONOREPO OSV AUDIT RESULTS (5 PACKAGE.JSON FILES MERGED)
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-hand text-base font-semibold text-emerald-300">
                    <Flame className="h-3.5 w-3.5 text-amber-400" />
                    100% Same-Major Fix Found!
                  </span>
                </div>

                {/* Row #1 — Champion / Top Finding */}
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-sky-500/40 bg-[#101a2c] p-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-400 font-mono text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.35)]">
                      #1
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-headline text-base font-bold text-white">
                          mongoose
                        </span>
                        <span className="rounded-full bg-emerald-400/90 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-slate-950">
                          ★ AUTO-FIX PR
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">
                        Path: apps/server/package.json · GHSA-8332-j7wj-wjw4 + 7 OSV advisories
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 font-mono text-right">
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">INSTALLED</div>
                      <div className="text-sm font-bold text-rose-400">^8.9.0</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">FIXED IN</div>
                      <div className="text-sm font-bold text-sky-400">^8.24.7</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">SEVERITY</div>
                      <div className="text-sm font-bold text-orange-400">HIGH</div>
                    </div>
                  </div>
                </div>

                {/* Row #2 */}
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-700/70 bg-[#0e1626] p-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 font-mono text-sm font-bold text-slate-300">
                      #2
                    </div>
                    <div>
                      <div className="font-headline text-base font-bold text-white">
                        lodash
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">
                        Path: packages/sdk/package.json · CVE-2021-23337 Command Injection via template
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 font-mono text-right">
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">INSTALLED</div>
                      <div className="text-sm font-bold text-rose-400">4.17.15</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">FIXED IN</div>
                      <div className="text-sm font-bold text-sky-400">4.17.21</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">SEVERITY</div>
                      <div className="text-sm font-bold text-rose-400">CRITICAL</div>
                    </div>
                  </div>
                </div>

                {/* Row SAFE Baseline (dashed border matching Image 1) */}
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-dashed border-slate-700/80 bg-[#0a101c] p-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900 font-mono text-[11px] font-semibold text-slate-400">
                      SAFE
                    </div>
                    <div>
                      <div className="font-headline text-base font-semibold text-slate-300">
                        18 Verified Clean Dependencies
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">
                        express, cors, bonjour-service &amp; shared workspace packages verified with 0 known OSV advisories
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 font-mono text-right">
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">CLEAN RATIO</div>
                      <div className="text-sm font-semibold text-emerald-400">90.0%</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">OSV CACHE</div>
                      <div className="text-sm font-semibold text-slate-300">HYDRATED</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">LATENCY</div>
                      <div className="text-sm font-semibold text-slate-300">142ms</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'pr' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4 text-emerald-400" />
                    <span className="font-mono text-xs font-semibold text-white">
                      fix(security): upgrade 2 vulnerable npm dependencies
                    </span>
                  </div>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    branch: securedevops/security-fixes → main
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#080d17] font-mono text-xs leading-6">
                  <div className="border-b border-slate-800 px-4 py-2 text-slate-400">
                    apps/server/package.json &amp; packages/sdk/package.json
                  </div>
                  <div className="p-4 space-y-0.5">
                    <div className="text-slate-500">  &quot;dependencies&quot;: {'{'}</div>
                    <div className="bg-rose-500/15 px-2 text-rose-300">-   &quot;mongoose&quot;: &quot;^8.9.0&quot;,</div>
                    <div className="bg-emerald-500/15 px-2 text-emerald-300">+   &quot;mongoose&quot;: &quot;^8.24.7&quot;,</div>
                    <div className="bg-rose-500/15 px-2 text-rose-300">-   &quot;lodash&quot;: &quot;4.17.15&quot;,</div>
                    <div className="bg-emerald-500/15 px-2 text-emerald-300">+   &quot;lodash&quot;: &quot;4.17.21&quot;,</div>
                    <div className="text-slate-500">    &quot;express&quot;: &quot;^4.21.2&quot;</div>
                    <div className="text-slate-500">  {'}'}</div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'alerts' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-700/70 bg-[#0e1626] p-4">
                  <MessageSquareCode className="h-5 w-5 text-sky-400" />
                  <h4 className="mt-3 font-headline text-sm font-bold text-white">
                    Commit &amp; PR Comment
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Posts a live Markdown severity table directly onto the pushed commit or Pull Request with exact fix commands.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700/70 bg-[#0e1626] p-4">
                  <ShieldAlert className="h-5 w-5 text-amber-400" />
                  <h4 className="mt-3 font-headline text-sm font-bold text-white">
                    Auto-Closing Security Issue
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Opens and updates one tracked Security Alert Issue per repository — and automatically closes it once clean.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700/70 bg-[#0e1626] p-4">
                  <Mail className="h-5 w-5 text-emerald-400" />
                  <h4 className="mt-3 font-headline text-sm font-bold text-white">
                    HTML Email Report
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Delivers an instant color-coded vulnerability breakdown directly to the logged-in GitHub user&apos;s verified email.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Live Action Link */}
        <div className="mt-8 flex justify-center">
          <Link
            href="/scans/new"
            className="inline-flex items-center gap-2 font-mono text-xs text-sky-300 transition-colors hover:text-sky-200"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Run a real scan on your own GitHub repository right now</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
