/**
 * Backend B client (SecureDevOps). Paths are exactly the ones used by legacy/frontend-original,
 * reached through the `/api/b/*` rewrite (-> backend `/api/webhooks/*`).
 */
import { requestJson } from './http';
import {
  normalizeSecuredevopsActivity,
  normalizeSecuredevopsProjects,
  scanFromSecuredevopsProjects,
} from '../domain/normalize';
import type { ScanRun, WebhookEvent } from '../domain/types';

const BASE = '/api/b';

export interface WebhookInfo {
  smeeUrl: string;
  localWebhookUrl: string;
  hasWebhookSecret: boolean;
}

export interface SimulationResult {
  success: boolean;
  event: string;
  target: string;
  targetUrl: string;
  deliveryId: string;
  signatureVerified: boolean;
  statusCode: number;
  data: any;
  timestamp: string;
  error?: any;
}

export const securedevops = {
  info: () => requestJson<WebhookInfo>(`${BASE}/info`),

  async activity(): Promise<{ events: WebhookEvent[]; scans: ScanRun[] }> {
    const data = await requestJson<{ activity?: any[] }>(`${BASE}/activity`);
    const events: WebhookEvent[] = [];
    const scans: ScanRun[] = [];
    for (const item of data.activity ?? []) {
      const n = normalizeSecuredevopsActivity(item);
      events.push(n.event);
      if (n.scan) scans.push(n.scan);
    }
    return { events, scans };
  },

  /** On-demand fetch + scan of owner/repo@ref (package.json + lockfile, monorepo aware). */
  async fetchScan(owner: string, repo: string, ref: string): Promise<ScanRun> {
    const data = await requestJson<{ projects?: any[] }>(`${BASE}/test-fetch`, {
      method: 'POST',
      body: JSON.stringify({ owner: owner.trim(), repo: repo.trim(), ref: ref.trim() }),
    });
    const projects = normalizeSecuredevopsProjects(data.projects ?? []);
    return scanFromSecuredevopsProjects(projects, {
      id: `b-fetch-${owner}-${repo}-${Date.now()}`,
      repo: `${owner.trim()}/${repo.trim()}`,
      ref: ref.trim(),
      trigger: 'manual-repo',
    });
  },

  async simulate(input: {
    owner: string;
    repo: string;
    ref: string;
    event: 'push' | 'ping';
    target: 'local' | 'smee';
  }): Promise<SimulationResult> {
    const res = await fetch(`${BASE}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: input.owner.trim(),
        repo: input.repo.trim(),
        ref: input.ref.trim(),
        event: input.event,
        target: input.target,
      }),
      cache: 'no-store',
    });
    // The legacy tester shows the body even for non-2xx simulation results.
    const data = (await res.json().catch(() => null)) as SimulationResult | null;
    if (!data) throw new Error(`Simulation failed (status ${res.status})`);
    return data;
  },

  /** Convert a simulation result carrying `data.scans` into a scan. */
  scanFromSimulation(result: SimulationResult, repoFullName: string, ref: string): ScanRun | undefined {
    const scans = result?.data?.scans;
    if (!Array.isArray(scans)) return undefined;
    const projects = normalizeSecuredevopsProjects(scans.map((s: any) => ({ scannedPath: s.path, scanResult: s.result })));
    return scanFromSecuredevopsProjects(projects, {
      id: `sim-${result.deliveryId}`,
      repo: repoFullName,
      ref,
      trigger: 'simulated',
      scannedAt: result.timestamp,
    });
  },
};
