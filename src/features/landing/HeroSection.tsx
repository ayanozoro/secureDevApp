'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronRight,
  Database,
  GitPullRequest,
  Pencil,
  ShieldCheck,
  Sparkles,
  Webhook,
} from 'lucide-react';

const HERO_CHIPS = [
  { icon: Webhook, label: 'Real-Time Webhooks', color: 'text-sky-400' },
  { icon: ShieldCheck, label: 'Google OSV Hydration', color: 'text-indigo-400' },
  { icon: GitPullRequest, label: 'Auto-Fix Pull Requests', color: 'text-amber-400' },
  { icon: Database, label: 'MongoDB Audit Ledger', color: 'text-emerald-400' },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-slate-800/70 bg-[#080d16]">
      {/* Blueprint Crosshair Grid Background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 18% 15%, rgba(6, 182, 212, 0.16), transparent 42%),
            radial-gradient(circle at 82% 22%, rgba(99, 102, 241, 0.14), transparent 40%),
            linear-gradient(rgba(56, 189, 248, 0.065) 1px, transparent 1px),
            linear-gradient(90deg, rgba(56, 189, 248, 0.065) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 56px 56px, 56px 56px',
        }}
      />

      {/* Subtle Glowing Vertical Blueprint Beam */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[33%] top-20 hidden h-72 w-px bg-gradient-to-b from-transparent via-sky-400/70 to-transparent shadow-[0_0_24px_4px_rgba(56,189,248,0.45)] lg:block"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:px-8">
        {/* Left Tilted Rubber Stamp */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-4 top-16 hidden -rotate-6 rounded border border-dashed border-rose-400/50 bg-rose-500/5 px-3 py-1.5 text-center font-mono text-[10px] tracking-widest text-rose-300/80 xl:block"
        >
          <div className="font-semibold">NO UNPATCHED CVES</div>
          <div className="text-[9px] text-rose-300/70">GUARANTEED WEBHOOK AUDIT</div>
        </div>

        {/* Right Tilted Rubber Stamp */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-4 top-24 hidden rotate-6 rounded border border-dashed border-violet-400/50 bg-violet-500/5 px-3 py-1.5 text-center font-mono text-[10px] tracking-widest text-violet-300/80 xl:block"
        >
          <div className="font-semibold">OSV.DEV ENGINE</div>
          <div className="text-[9px] text-violet-300/70">AUTO-FIX PULL REQUESTS</div>
        </div>

        {/* Center Hero Column */}
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          {/* Chapter Pill + Handwritten Tag */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-[#0d1626]/90 px-4 py-1.5 font-mono text-[11px] tracking-widest text-sky-300 shadow-[0_0_25px_rgba(56,189,248,0.12)]">
              <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              <span>CHAPTER 01 // AUTOMATED DEVSECOPS</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
            <span className="font-hand text-xl font-semibold text-amber-300 -rotate-2">
              ★ Push-to-Patch in seconds!
            </span>
          </div>

          {/* Main Display Title */}
          <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-[64px] lg:leading-[1.08]">
            Automated, Zero-Trust
            <br />
            Dependency Security for
            <span className="relative mt-1 block font-hand text-5xl font-bold tracking-normal text-sky-400 sm:text-7xl lg:text-[78px] lg:leading-[1.02]">
              GitHub Repositories
              {/* Hand-drawn cyan brush underline */}
              <svg
                aria-hidden
                viewBox="0 0 420 20"
                fill="none"
                className="mx-auto -mt-1 w-64 sm:w-96"
              >
                <path
                  d="M6 13C95 4 285 3 414 11"
                  stroke="#38BDF8"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d="M42 17C145 12 290 12 384 15"
                  stroke="#0EA5E9"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeOpacity="0.65"
                />
              </svg>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            The automated vulnerability intelligence platform built for real engineering teams.
            Connect any GitHub repo via OAuth, scan every monorepo push against Google OSV,
            and auto-generate non-breaking fix Pull Requests with live email &amp; issue alerts.
          </p>

          {/* Handwritten Green Pencil Note */}
          <p className="mt-4 inline-flex items-center gap-2 font-hand text-xl font-medium text-emerald-400 sm:text-2xl">
            <Pencil className="h-4 w-4 text-amber-300" />
            <span>Built for continuous supply-chain defense with zero synthetic fluff.</span>
          </p>

          {/* CTA Buttons */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 rounded-xl bg-sky-400 px-6 py-3.5 font-mono text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.4)] transition-all hover:-translate-y-0.5 hover:bg-sky-300 hover:shadow-[0_0_40px_rgba(56,189,248,0.55)]"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#live-demo"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-[#0d1422]/90 px-6 py-3.5 font-mono text-sm font-medium text-slate-200 transition-all hover:-translate-y-0.5 hover:border-sky-400/50 hover:text-white"
            >
              <span>Explore Live Scanner</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </a>
          </div>

          {/* 4 Bottom Feature Chips */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {HERO_CHIPS.map((chip) => (
              <div
                key={chip.label}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700/70 bg-[#0d1422]/85 px-3.5 py-2 font-mono text-xs text-slate-200 shadow-sm"
              >
                <chip.icon className={`h-3.5 w-3.5 ${chip.color}`} />
                <span>{chip.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
