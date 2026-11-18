'use client';

import React, { useState } from 'react';
import { Bookmark, FileCode2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface FieldNote {
  id: string;
  tag: string;
  stamp: string;
  stampTone: 'danger' | 'safe' | 'cyan';
  cardStyle: string;
  activeRing: string;
  title: string;
  blurb: string;
  breakdownTitle: string;
  breakdownDesc: string;
  fileName: string;
  badgeText: string;
  codeLines: { text: string; tone?: 'comment' | 'key' | 'string' | 'normal' }[];
}

const NOTES: FieldNote[] = [
  {
    id: 'problem',
    tag: 'THE PROBLEM',
    stamp: 'CVE DETECTED',
    stampTone: 'danger',
    cardStyle: 'bg-[#361c0f]/90 border-amber-700/70 hover:border-amber-500/80 -rotate-1',
    activeRing: 'ring-2 ring-amber-400/70 shadow-[0_12px_35px_rgba(245,158,11,0.18)]',
    title: '1. The Silent Drift Trap',
    blurb: 'Why 90% of vulnerable npm dependencies slip past manual PR reviews into production.',
    breakdownTitle: '1. The Silent Drift Trap',
    breakdownDesc:
      'Teams ship features daily while transitive and direct dependencies quietly age. Without automated webhook inspection on every push, critical prototype-pollution and SSRF CVEs stay hidden across monorepo subfolders.',
    fileName: 'vulnerable_drift.json',
    badgeText: '⚠ SILENT EXPOSURE',
    codeLines: [
      { text: '// ❌ Unmonitored monorepo package.json:', tone: 'comment' },
      { text: '{', tone: 'normal' },
      { text: '  "dependencies": {', tone: 'key' },
      { text: '    "lodash": "^4.17.15",   // CVE-2021-23337 (CRITICAL)', tone: 'string' },
      { text: '    "mongoose": "^8.9.0",   // GHSA-8332-j7wj-wjw4 (HIGH)', tone: 'string' },
      { text: '    "axios": "0.21.1"       // CVE-2021-3749 (HIGH)', tone: 'string' },
      { text: '  }', tone: 'normal' },
      { text: '}', tone: 'normal' },
    ],
  },
  {
    id: 'architecture',
    tag: 'THE SECUREDEVOPS ARCHITECTURE',
    stamp: '100% AUTOMATED',
    stampTone: 'safe',
    cardStyle: 'bg-[#0d2233]/90 border-sky-500/60 hover:border-sky-400 rotate-1',
    activeRing: 'ring-2 ring-sky-400/80 shadow-[0_12px_35px_rgba(56,189,248,0.22)]',
    title: '2. The Push-to-Patch Pipeline',
    blurb: 'GitHub Webhooks + full-repo Git Trees discovery + live Google OSV advisory hydration.',
    breakdownTitle: '2. The Push-to-Patch Pipeline',
    breakdownDesc:
      'SecureDevOps auto-installs an HMAC-signed GitHub webhook on your selected repository. On every push or PR, it discovers every package.json via GitHub Git Trees, queries OSV.dev, hydrates exact fixed versions, and opens a non-breaking upgrade PR.',
    fileName: 'webhook_pipeline.js',
    badgeText: '★ PRODUCTION STANDARD',
    codeLines: [
      { text: '// ✅ SecureDevOps Automated Pipeline:', tone: 'comment' },
      { text: 'const pkg = await fetchPackageJson(repo, branch, token);', tone: 'normal' },
      { text: 'const scan = await scanPackageJson(pkg); // OSV Batch + Hydrate', tone: 'normal' },
      { text: 'await Promise.all([', tone: 'key' },
      { text: '  postScanReportToGitHub(scan, token),   // Commit/PR + Issue', tone: 'string' },
      { text: '  createSecurityFixPR(scan, token),      // Same-major PR', tone: 'string' },
      { text: '  sendScanCompleteEmail(scan),           // Logged-in user', tone: 'string' },
      { text: ']);', tone: 'key' },
    ],
  },
  {
    id: 'remediation',
    tag: 'CLOSED-LOOP REMEDIATION',
    stamp: 'AUDIT-READY',
    stampTone: 'cyan',
    cardStyle: 'bg-[#102422]/90 border-emerald-500/50 hover:border-emerald-400 -rotate-1',
    activeRing: 'ring-2 ring-emerald-400/75 shadow-[0_12px_35px_rgba(16,185,129,0.2)]',
    title: '3. Zero-Noise Audit Ledger',
    blurb: 'Auto-closing GitHub Issues, per-user MongoDB history & real-time SSE streams.',
    breakdownTitle: '3. Zero-Noise Audit Ledger',
    breakdownDesc:
      'Every scan run, PR link, and alert is persisted in MongoDB per GitHub user. Existing PR comments and Security Alert Issues update in place without spam — and when your fix PR merges clean, the security issue auto-closes itself.',
    fileName: 'closed_loop_sync.js',
    badgeText: '★ ZERO ALERT FATIGUE',
    codeLines: [
      { text: '// ✅ Self-Healing Issue & MongoDB Ledger:', tone: 'comment' },
      { text: 'await Scan.findOneAndUpdate({ id: scan.id }, { $set: scan });', tone: 'normal' },
      { text: 'if (scan.vulnerableCount === 0 && openSecurityIssue) {', tone: 'key' },
      { text: '  await commentOnIssue("✅ All Clear — 0 vulnerabilities!");', tone: 'string' },
      { text: '  await closeGitHubIssue(openSecurityIssue.number);', tone: 'string' },
      { text: '}', tone: 'key' },
    ],
  },
];

function stampClasses(tone: FieldNote['stampTone']) {
  if (tone === 'danger') return 'border-rose-400/70 text-rose-300 bg-rose-500/10';
  if (tone === 'safe') return 'border-emerald-400/70 text-emerald-300 bg-emerald-500/10';
  return 'border-sky-400/70 text-sky-300 bg-sky-500/10';
}

export function FieldNotesSection() {
  const [activeId, setActiveId] = useState<string>('architecture');
  const active = NOTES.find((n) => n.id === activeId) ?? NOTES[1];

  return (
    <section id="sketchbook" className="relative bg-[#080c14] py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-[#0d1422] px-4 py-1.5 font-mono text-[11px] tracking-widest text-sky-300">
            <Bookmark className="h-3.5 w-3.5 text-sky-400" />
            <span>CHAPTER 02 // ARCHITECT&apos;S LAB SKETCHBOOK</span>
            <span className="font-hand text-base font-semibold tracking-normal text-amber-300">
              ★ Field Notes
            </span>
          </div>

          <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Inside the Engineer&apos;s{' '}
            <span className="font-hand text-4xl font-bold text-sky-400 sm:text-6xl">
              Field Notes
            </span>
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">
            Before merging a single line of production code, here is how SecureDevOps solves the two
            biggest dilemmas in supply-chain security:{' '}
            <strong className="text-slate-200">Silent Dependency Drift</strong> and{' '}
            <strong className="text-slate-200">Manual Patch Fatigue</strong>.
          </p>

          {/* Hand-drawn cyan swoosh */}
          <svg
            aria-hidden
            viewBox="0 0 220 14"
            fill="none"
            className="mx-auto mt-3 w-44"
          >
            <path
              d="M4 9C65 3 155 4 216 8"
              stroke="#38BDF8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Spiral-Bound Architect's Notebook */}
        <div className="relative mt-14 rounded-2xl border border-slate-700/70 bg-[#0b111d] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8 lg:pl-14">
          {/* Left Spiral Binder Rings */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-2.5 top-12 hidden flex-col gap-12 lg:flex"
          >
            {[0, 1, 2, 3, 4].map((ring) => (
              <div key={ring} className="flex items-center">
                <div className="h-3.5 w-8 rounded-full border border-slate-500/70 bg-gradient-to-r from-slate-700 via-slate-400 to-slate-700 shadow" />
                <div className="-ml-1.5 h-4 w-4 rounded-full bg-[#060910] border border-slate-700/80" />
              </div>
            ))}
          </div>

          {/* Top-right Paperclip SVG */}
          <svg
            aria-hidden
            viewBox="0 0 36 72"
            fill="none"
            className="pointer-events-none absolute -top-5 right-10 hidden h-16 w-8 text-slate-400/80 sm:block"
          >
            <path
              d="M12 24V54C12 60.6 17.4 66 24 66C30.6 66 34 60.6 34 54V16C34 8.3 27.7 2 20 2C12.3 2 6 8.3 6 16V48C6 52.4 9.6 56 14 56C18.4 56 22 52.4 22 48V20"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </svg>

          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.25fr] lg:items-start">
            {/* Left Column: Interactive Sticky Notes */}
            <div>
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-widest uppercase text-slate-400">
                  TAP A STICKY NOTE TO INSPECT:
                </span>
                <span className="inline-flex items-center gap-1 font-hand text-base text-sky-400">
                  <Sparkles className="h-3 w-3" /> Interactive
                </span>
              </div>

              <div className="space-y-5">
                {NOTES.map((note) => {
                  const isActive = note.id === active.id;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setActiveId(note.id)}
                      className={cn(
                        'relative block w-full rounded-xl border p-5 text-left transition-all duration-200',
                        note.cardStyle,
                        isActive ? note.activeRing : 'opacity-85 hover:opacity-100 hover:rotate-0',
                      )}
                    >
                      {/* Masking Tape Strip */}
                      <span
                        aria-hidden
                        className="absolute -top-2.5 left-10 h-5 w-16 rounded-sm bg-amber-200/20 backdrop-blur-[1px] border border-amber-100/10"
                      />

                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 font-mono text-[10px] tracking-wider uppercase text-slate-200">
                          {note.tag}
                        </span>
                        <span
                          className={cn(
                            'rounded border border-dashed px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase -rotate-2',
                            stampClasses(note.stampTone),
                          )}
                        >
                          {note.stamp}
                        </span>
                      </div>

                      <div className="mt-3 font-hand text-2xl font-bold text-white sm:text-[26px]">
                        {note.title}
                      </div>
                      <p className="mt-1 font-hand text-lg leading-snug text-slate-200/90">
                        {note.blurb}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Blueprint Breakdown Panel */}
            <div className="rounded-xl border border-slate-700/70 bg-[#0d1423] p-6 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[11px] tracking-widest uppercase text-sky-400">
                    {'// BLUEPRINT BREAKDOWN'}
                  </div>
                  <h3 className="mt-2 font-hand text-3xl font-bold text-white sm:text-4xl">
                    {active.breakdownTitle}
                  </h3>
                </div>
                <span
                  className={cn(
                    'rounded border border-dashed px-3 py-1 font-mono text-[11px] font-semibold tracking-wider uppercase -rotate-2',
                    stampClasses(active.stampTone),
                  )}
                >
                  {active.stamp}
                </span>
              </div>

              <div className="my-5 h-px bg-slate-700/60" />

              <p className="text-sm leading-relaxed text-slate-300">
                {active.breakdownDesc}
              </p>

              {/* Code Window */}
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-700/70 bg-[#080d17]">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
                  <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                    <FileCode2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>{active.fileName}</span>
                  </div>
                  <span className="font-mono text-[10px] font-semibold tracking-wider text-amber-300">
                    {active.badgeText}
                  </span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 sm:text-[13px]">
                  {active.codeLines.map((line, i) => (
                    <div
                      key={i}
                      className={cn(
                        line.tone === 'comment' && 'text-emerald-400/90',
                        line.tone === 'key' && 'text-sky-300',
                        line.tone === 'string' && 'text-amber-200',
                        (!line.tone || line.tone === 'normal') && 'text-slate-200',
                      )}
                    >
                      {line.text}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
