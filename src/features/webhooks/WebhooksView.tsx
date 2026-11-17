'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, FlaskConical, GitBranch, Radio, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendNotice } from '@/components/layout/BackendNotice';
import { Chip } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { SkeletonRows } from '@/components/ui/States';
import { useScan } from '@/lib/state/ScanProvider';
import { ActivityFeed } from './ActivityFeed';
import { LogStream } from './LogStream';
import { RepoManager } from './RepoManager';
import { WebhookTester } from './WebhookTester';
import { SetupGuide } from './SetupGuide';

type TabId = 'activity' | 'logs' | 'repos' | 'test' | 'guide';
const TAB_IDS: TabId[] = ['activity', 'logs', 'repos', 'test', 'guide'];

export function WebhooksView() {
  const { state } = useScan();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = TAB_IDS.includes(raw as TabId) ? (raw as TabId) : 'activity';
  const live = state.conn.streamA || state.conn.streamB;

  return (
    <>
      <PageHeader
        eyebrow="Webhooks"
        title="Webhook center"
        description="Live push and ping deliveries, raw logs, repository hooks, a delivery simulator and the manual setup guide."
        actions={
          live ? (
            <Chip tone="cyan" beacon>
              Live stream connected
            </Chip>
          ) : (
            <Chip>Stream offline</Chip>
          )
        }
      />
      <BackendNotice />
      <Tabs<TabId>
        label="Webhook sections"
        value={tab}
        onChange={(t) => router.replace(t === 'activity' ? '/webhooks' : `/webhooks?tab=${t}`, { scroll: false })}
        className="mb-4"
        items={[
          { id: 'activity', label: 'Activity', icon: <Radio className="h-3.5 w-3.5" />, count: state.events.length },
          { id: 'logs', label: 'Logs', icon: <ScrollText className="h-3.5 w-3.5" /> },
          { id: 'repos', label: 'Repositories', icon: <GitBranch className="h-3.5 w-3.5" /> },
          { id: 'test', label: 'Test', icon: <FlaskConical className="h-3.5 w-3.5" /> },
          { id: 'guide', label: 'Setup guide', icon: <BookOpen className="h-3.5 w-3.5" /> },
        ]}
      />
      <div className="panel overflow-hidden" role="tabpanel">
        {tab === 'activity' && (!state.loaded ? <SkeletonRows rows={5} /> : <ActivityFeed events={state.events} scans={state.scans} />)}
        {tab === 'logs' && <div className="p-4"><LogStream /></div>}
        {tab === 'repos' && <RepoManager />}
        {tab === 'test' && <WebhookTester />}
        {tab === 'guide' && <SetupGuide />}
      </div>
    </>
  );
}
