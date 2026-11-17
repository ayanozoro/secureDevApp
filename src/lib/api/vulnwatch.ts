/**
 * Backend A client (VulnWatch). Paths are exactly the ones used by legacy/vulnwatch-public/app.js,
 * reached through the `/api/a/*` rewrite (-> backend `/api/*`).
 */
import { requestJson } from './http';
import { normalizeVulnwatchScan } from '../domain/normalize';
import type { GithubRepo, GithubUser, LogLine, ScanRun } from '../domain/types';

const BASE = '/api/a';

export interface VulnwatchStatus {
  smee?: { connected: boolean; message?: string };
}

export const vulnwatch = {
  status: () => requestJson<VulnwatchStatus>(`${BASE}/status`),

  async scans(): Promise<ScanRun[]> {
    const data = await requestJson<{ scans?: any[] }>(`${BASE}/scans`);
    return (data.scans ?? []).map((s) => normalizeVulnwatchScan(s));
  },

  async logs(): Promise<LogLine[]> {
    const data = await requestJson<{ logs?: any[] }>(`${BASE}/logs`);
    // The backend returns newest first (legacy UI reversed it before display).
    return (data.logs ?? [])
      .slice()
      .reverse()
      .map((l, i) => ({
        id: `a-log-${l.timestamp ?? i}-${i}`,
        type: String(l.type ?? 'info'),
        message: String(l.message ?? ''),
        timestamp: String(l.timestamp ?? new Date().toISOString()),
        source: 'vulnwatch' as const,
      }));
  },

  authStatus: () =>
    requestJson<{ authenticated: boolean; user?: GithubUser; smeeUrl?: string }>(`${BASE}/auth/status`),

  async repos(): Promise<GithubRepo[]> {
    const data = await requestJson<{ repos?: GithubRepo[] }>(`${BASE}/user/repos`);
    return data.repos ?? [];
  },

  checkWebhook: (repo: string) =>
    requestJson<{ installed: boolean; hookId?: number | string }>(
      `${BASE}/repos/check-webhook?repo=${encodeURIComponent(repo)}`,
    ),

  setupWebhook: (repo: string) =>
    requestJson<unknown>(`${BASE}/repos/setup-webhook`, { method: 'POST', body: JSON.stringify({ repo }) }),

  removeWebhook: (repo: string, hookId: number | string) =>
    requestJson<unknown>(`${BASE}/repos/webhook`, { method: 'DELETE', body: JSON.stringify({ repo, hookId }) }),

  saveToken: (token: string) =>
    requestJson<{ user: GithubUser }>(`${BASE}/auth/token`, { method: 'POST', body: JSON.stringify({ token }) }),

  logout: () => requestJson<unknown>(`${BASE}/auth/logout`, { method: 'POST' }),

  async scanRepo(input: { repo: string; branch: string; token?: string }): Promise<ScanRun> {
    const raw = await requestJson<any>(`${BASE}/scan-repo`, {
      method: 'POST',
      body: JSON.stringify({ repo: input.repo, branch: input.branch, token: input.token || undefined }),
    });
    return normalizeVulnwatchScan(raw, 'manual-repo');
  },

  async scanRaw(content: string): Promise<ScanRun> {
    const raw = await requestJson<any>(`${BASE}/scan-raw`, { method: 'POST', body: JSON.stringify({ content }) });
    return normalizeVulnwatchScan(raw, 'manual-raw');
  },
};
