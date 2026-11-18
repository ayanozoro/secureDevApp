'use client';

import React from 'react';
import { LandingNavbar } from './LandingNavbar';
import { HeroSection } from './HeroSection';
import { FieldNotesSection } from './FieldNotesSection';
import { LiveBenchmarkSection } from './LiveBenchmarkSection';
import { PipelineFeaturesSection } from './PipelineFeaturesSection';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100">
      <LandingNavbar />
      <main>
        <HeroSection />
        <FieldNotesSection />
        <LiveBenchmarkSection />
        <PipelineFeaturesSection />
      </main>
    </div>
  );
}
