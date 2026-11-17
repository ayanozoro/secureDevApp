/**
 * The two backends publish different SSE dialects. Each connector translates its dialect into
 * the single `LiveEvent` union so the rest of the app never sees the difference.
 */
import {
  normalizeSecuredevopsPush,
  normalizeVulnwatchScan,
} from '../domain/normalize';
import type { LiveEvent, LogLine, WebhookEvent } from '../domain/types';

type Handler = (e: LiveEvent) => void;

function parse(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** Backend A: `/api/a/events` with named events. */
export function connectVulnwatchEvents(onEvent: Handler): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  const es = new EventSource('/api/a/events');
  es.onopen = () => onEvent({ kind: 'stream_status', source: 'vulnwatch', connected: true });
  es.onerror = () => onEvent({ kind: 'stream_status', source: 'vulnwatch', connected: false });

  es.addEventListener('connected', () => onEvent({ kind: 'stream_status', source: 'vulnwatch', connected: true }));
  es.addEventListener('smee_status', (e) => {
    const d = parse((e as MessageEvent).data);
    if (d) onEvent({ kind: 'smee_status', connected: Boolean(d.connected), message: d.message });
  });
  es.addEventListener('webhook_received', (e) => {
    const d = parse((e as MessageEvent).data);
    if (!d) return;
    const event: WebhookEvent = {
      id: `a-hook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: 'vulnwatch',
      event: String(d.event ?? 'unknown'),
      repo: String(d.repo ?? ''),
      timestamp: new Date().toISOString(),
    };
    onEvent({ kind: 'webhook', event });
  });
  es.addEventListener('scan_completed', (e) => {
    const d = parse((e as MessageEvent).data);
    if (!d) return;
    const scan = normalizeVulnwatchScan(d);
    const event: WebhookEvent | undefined =
      scan.trigger === 'push' || scan.trigger === 'pull_request'
        ? {
            id: `a-scan-${scan.id}`,
            source: 'vulnwatch',
            event: scan.trigger,
            repo: scan.repo ?? '',
            sha: scan.commitSha,
            ref: scan.ref,
            timestamp: scan.scannedAt,
            findingsCount: scan.projects[0]?.metrics.totalFindings,
            totalDependencies: scan.projects[0]?.metrics.totalDependencies,
            scanId: scan.id,
          }
        : undefined;
    onEvent({ kind: 'scan_completed', scan, event });
  });
  es.addEventListener('scan_failed', (e) => {
    const d = parse((e as MessageEvent).data);
    if (d) onEvent({ kind: 'scan_failed', repo: d.repoName, error: String(d.error ?? 'Scan failed') });
  });
  es.addEventListener('activity_log', (e) => {
    const d = parse((e as MessageEvent).data);
    if (!d) return;
    const line: LogLine = {
      id: `a-live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: String(d.type ?? 'info'),
      message: String(d.message ?? ''),
      timestamp: String(d.timestamp ?? new Date().toISOString()),
      source: 'vulnwatch',
    };
    onEvent({ kind: 'log', line });
  });

  return () => es.close();
}

/** Backend B: `/api/b/events` with default `message` events carrying `data.type`. */
export function connectSecuredevopsEvents(onEvent: Handler): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  const es = new EventSource('/api/b/events');
  es.onopen = () => onEvent({ kind: 'stream_status', source: 'securedevops', connected: true });
  es.onerror = () => onEvent({ kind: 'stream_status', source: 'securedevops', connected: false });
  es.onmessage = (e) => {
    const d = parse(e.data);
    if (!d) return;
    if (d.type === 'push_scan_completed') {
      const { event, scan } = normalizeSecuredevopsPush(d);
      if (scan) onEvent({ kind: 'scan_completed', scan, event });
      else onEvent({ kind: 'webhook', event });
    } else if (d.type === 'ping_received') {
      const event: WebhookEvent = {
        id: `b-ping-${Date.now()}`,
        source: 'securedevops',
        event: 'ping',
        repo: String(d.repository ?? ''),
        timestamp: new Date().toISOString(),
        message: d.message ? String(d.message) : undefined,
      };
      onEvent({ kind: 'webhook', event });
    }
  };
  return () => es.close();
}
