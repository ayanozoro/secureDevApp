/**
 * Normalised domain model shared by both backends.
 * Fields marked optional are provided by only one source; the UI hides them when absent
 * instead of inventing values.
 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type Source = 'vulnwatch' | 'securedevops';
export type Trigger =
  | 'push'
  | 'pull_request'
  | 'manual-repo'
  | 'manual-raw'
  | 'simulated'
  | 'ping'
  | 'unknown';

export interface Finding {
  key: string;
  packageName: string;
  installedVersion: string;
  severity: Severity;
  osvId: string;
  aliases: string[];
  summary: string;
  details?: string;
  fixedVersion?: string;
  affectedVersions?: string;
  cvssScore?: number;
  cvssVector?: string;
  cwes?: string[];
  references?: string[];
  dependencyType?: 'direct' | 'transitive';
  isDev?: boolean;
  publishedAt?: string;
  modifiedAt?: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface Metrics {
  totalDependencies: number;
  directDependencies?: number;
  transitiveDependencies?: number;
  productionDependencies?: number;
  developmentDependencies?: number;
  vulnerableDependencies: number;
  totalFindings: number;
  severityCounts: SeverityCounts;
}

export interface PackageRow {
  name: string;
  declared: string;
  resolved: string;
  type: string;
  isVulnerable: boolean;
  vulnerabilityCount: number;
  highestSeverity: Severity | 'NONE';
}

export interface Project {
  path: string;
  success: boolean;
  error?: string;
  metrics: Metrics;
  findings: Finding[];
  packages?: PackageRow[];
  durationMs?: number;
}

export interface ScanRun {
  id: string;
  source: Source;
  trigger: Trigger;
  repo?: string;
  ref?: string;
  commitSha?: string;
  commitMessage?: string;
  author?: string;
  scannedAt: string;
  status: 'completed' | 'failed';
  error?: string;
  projects: Project[];
  capabilities: { packages: boolean; cvss: boolean; dependencyType: boolean };
}

export interface WebhookEvent {
  id: string;
  source: Source;
  event: string;
  repo: string;
  sha?: string;
  ref?: string;
  timestamp: string;
  findingsCount?: number;
  totalDependencies?: number;
  projectsCount?: number;
  message?: string;
  scanId?: string;
}

export interface LogLine {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  source: Source;
}

export interface AppNotification {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
  timestamp: string;
  href?: string;
}

export interface GithubUser {
  login: string;
  name?: string;
  avatar_url?: string;
}

export interface GithubRepo {
  full_name: string;
  private: boolean;
  default_branch: string;
}

export type LiveEvent =
  | { kind: 'smee_status'; connected: boolean; message?: string }
  | { kind: 'stream_status'; source: Source; connected: boolean }
  | { kind: 'webhook'; event: WebhookEvent }
  | { kind: 'scan_completed'; scan: ScanRun; event?: WebhookEvent }
  | { kind: 'scan_failed'; repo?: string; error: string }
  | { kind: 'log'; line: LogLine };

export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
