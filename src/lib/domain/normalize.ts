import type {
  Finding,
  Metrics,
  PackageRow,
  Project,
  ScanRun,
  SeverityCounts,
  Trigger,
  WebhookEvent,
} from './types';
import { normalizeSeverity, SEVERITY_RANK } from './severity';

type Raw = any;

const emptyCounts = (): SeverityCounts => ({ critical: 0, high: 0, medium: 0, low: 0, unknown: 0 });

export function findingKey(f: { packageName: string; installedVersion: string; osvId: string }): string {
  return `${f.packageName}@${f.installedVersion}#${f.osvId}`;
}

/* ------------------------------------------------------------------ */
/* Backend A (VulnWatch)                                               */
/* ------------------------------------------------------------------ */

function parseFixedIn(fixedIn: unknown): string | undefined {
  if (typeof fixedIn !== 'string') return undefined;
  const t = fixedIn.trim();
  if (!t || /no fix/i.test(t)) return undefined;
  return t.split(',')[0].trim() || undefined;
}

function triggerFromVulnwatch(raw: Raw): Trigger {
  const e = String(raw?.event ?? '').toLowerCase();
  if (e === 'push') return 'push';
  if (e === 'pull_request') return 'pull_request';
  if (e === 'ping') return 'ping';
  if (e.includes('raw')) return 'manual-raw';
  if (e) return 'manual-repo';
  return raw?.repoName && !/custom/i.test(raw.repoName) ? 'manual-repo' : 'manual-raw';
}

export function normalizeVulnwatchScan(raw: Raw, triggerOverride?: Trigger): ScanRun {
  const vulns: Raw[] = Array.isArray(raw?.vulnerabilities) ? raw.vulnerabilities : [];
  const pkgs: Raw[] = Array.isArray(raw?.packages) ? raw.packages : [];
  const pkgByName = new Map<string, Raw>(pkgs.map((p) => [p.name, p]));

  const findings: Finding[] = vulns.map((v) => {
    const aliases = Array.from(new Set([v.cve, v.ghsa, v.id].filter(Boolean).map(String)));
    const pkg = pkgByName.get(v.packageName);
    const base = {
      packageName: String(v.packageName ?? ''),
      installedVersion: String(v.installedVersion ?? ''),
      osvId: String(v.id ?? v.cve ?? v.ghsa ?? ''),
    };
    return {
      key: findingKey(base),
      ...base,
      severity: normalizeSeverity(v.severity),
      aliases,
      summary: String(v.summary ?? ''),
      fixedVersion: parseFixedIn(v.fixedIn),
      // Backend A scans package.json only, so every listed dependency is a declared (direct) one.
      dependencyType: 'direct' as const,
      isDev: pkg ? /dev/i.test(String(pkg.type ?? '')) : undefined,
    };
  });

  const packages: PackageRow[] = pkgs.map((p) => ({
    name: String(p.name ?? ''),
    declared: String(p.rawVersion ?? ''),
    resolved: String(p.version ?? ''),
    type: String(p.type ?? ''),
    isVulnerable: Boolean(p.isVulnerable),
    vulnerabilityCount: Number(p.vulnerabilityCount ?? 0),
    highestSeverity: p.highestSeverity && p.highestSeverity !== 'NONE' ? normalizeSeverity(p.highestSeverity) : 'NONE',
  }));

  const counts: SeverityCounts = {
    critical: Number(raw?.criticalCount ?? 0),
    high: Number(raw?.highCount ?? 0),
    medium: Number(raw?.mediumCount ?? 0),
    low: Number(raw?.lowCount ?? 0),
    unknown: findings.filter((f) => f.severity === 'UNKNOWN').length,
  };

  const total = Number(raw?.totalPackages ?? pkgs.length);
  const metrics: Metrics = {
    totalDependencies: total,
    directDependencies: total,
    vulnerableDependencies: Number(raw?.vulnerableCount ?? 0),
    totalFindings: findings.length,
    severityCounts: counts,
  };

  const failed = Boolean(raw?.error);
  const scannedAt = String(raw?.scannedAt ?? new Date().toISOString());
  const repo = raw?.repoName ? String(raw.repoName) : undefined;

  return {
    id: String(raw?.id ?? `vw-${scannedAt}-${repo ?? 'custom'}`),
    source: 'vulnwatch',
    trigger: triggerOverride ?? triggerFromVulnwatch(raw),
    repo,
    ref: raw?.branch ? String(raw.branch) : undefined,
    commitSha: raw?.commitSha ? String(raw.commitSha) : undefined,
    commitMessage: raw?.commitMessage ? String(raw.commitMessage) : undefined,
    author: raw?.authorName ? String(raw.authorName) : undefined,
    scannedAt,
    status: failed ? 'failed' : 'completed',
    error: failed ? String(raw.error) : undefined,
    projects: [
      {
        path: String(raw?.packagePath ?? raw?._detectedPath ?? ''),
        success: !failed,
        error: failed ? String(raw.error) : undefined,
        metrics,
        findings,
        packages: pkgs.length ? packages : undefined,
      },
    ],
    capabilities: { packages: pkgs.length > 0, cvss: false, dependencyType: true },
  };
}

/* ------------------------------------------------------------------ */
/* Backend B (SecureDevOps)                                            */
/* ------------------------------------------------------------------ */

function normalizeBFinding(f: Raw): Finding {
  const base = {
    packageName: String(f?.packageName ?? ''),
    installedVersion: String(f?.installedVersion ?? ''),
    osvId: String(f?.osvId ?? ''),
  };
  return {
    key: findingKey(base),
    ...base,
    severity: normalizeSeverity(f?.severity),
    aliases: Array.isArray(f?.aliases) ? f.aliases.map(String) : [],
    summary: String(f?.summary ?? ''),
    details: f?.details ? String(f.details) : undefined,
    fixedVersion: f?.fixedVersion ? String(f.fixedVersion) : undefined,
    affectedVersions: f?.affectedVersions ? String(f.affectedVersions) : undefined,
    cvssScore: typeof f?.cvssScore === 'number' ? f.cvssScore : undefined,
    cvssVector: f?.cvssVector ? String(f.cvssVector) : undefined,
    cwes: Array.isArray(f?.cwes) ? f.cwes.map(String) : undefined,
    references: Array.isArray(f?.references) ? f.references.map(String) : undefined,
    dependencyType: f?.dependencyType === 'transitive' ? 'transitive' : f?.dependencyType === 'direct' ? 'direct' : undefined,
    isDev: typeof f?.isDev === 'boolean' ? f.isDev : undefined,
    publishedAt: f?.publishedAt ? String(f.publishedAt) : undefined,
    modifiedAt: f?.modifiedAt ? String(f.modifiedAt) : undefined,
  };
}

function normalizeBMetrics(m: Raw, findings: Finding[]): Metrics {
  const sc = m?.severityCounts ?? {};
  return {
    totalDependencies: Number(m?.totalDependencies ?? 0),
    directDependencies: m?.directDependencies != null ? Number(m.directDependencies) : undefined,
    transitiveDependencies: m?.transitiveDependencies != null ? Number(m.transitiveDependencies) : undefined,
    productionDependencies: m?.productionDependencies != null ? Number(m.productionDependencies) : undefined,
    developmentDependencies: m?.developmentDependencies != null ? Number(m.developmentDependencies) : undefined,
    vulnerableDependencies: Number(m?.vulnerableDependencies ?? 0),
    totalFindings: Number(m?.totalFindings ?? findings.length),
    severityCounts: {
      critical: Number(sc.critical ?? 0),
      high: Number(sc.high ?? 0),
      medium: Number(sc.medium ?? 0),
      low: Number(sc.low ?? 0),
      unknown: Number(sc.unknown ?? 0),
    },
  };
}

/** `projects` as returned by test-fetch: [{scannedPath, scanResult}]. */
export function normalizeSecuredevopsProjects(projects: Raw[]): Project[] {
  return (projects ?? []).map((p) => {
    const res = p?.scanResult;
    const findings = Array.isArray(res?.findings) ? res.findings.map(normalizeBFinding) : [];
    return {
      path: String(p?.scannedPath ?? p?.path ?? ''),
      success: res ? res.success !== false : false,
      error: res ? undefined : 'No scan result returned for this project',
      metrics: normalizeBMetrics(res?.metrics, findings),
      findings,
      durationMs: typeof res?.durationMs === 'number' ? res.durationMs : undefined,
    };
  });
}

/** `scans` as embedded in webhook activity and push events: [{path, result}]. */
export function normalizeSecuredevopsScans(scans: Raw[]): Project[] {
  return normalizeSecuredevopsProjects(
    (scans ?? []).map((s) => ({ scannedPath: s?.path, scanResult: s?.result })),
  );
}

const B_CAPS = { packages: false, cvss: true, dependencyType: true };

export function scanFromSecuredevopsProjects(
  projects: Project[],
  meta: { id: string; repo?: string; ref?: string; trigger: Trigger; commitSha?: string; scannedAt?: string },
): ScanRun {
  return {
    id: meta.id,
    source: 'securedevops',
    trigger: meta.trigger,
    repo: meta.repo,
    ref: meta.ref,
    commitSha: meta.commitSha,
    scannedAt: meta.scannedAt ?? new Date().toISOString(),
    status: projects.some((p) => p.success) || projects.length === 0 ? 'completed' : 'failed',
    projects,
    capabilities: B_CAPS,
  };
}

export function normalizeSecuredevopsActivity(item: Raw): { event: WebhookEvent; scan?: ScanRun } {
  const isPush = item?.event === 'push';
  const scans: Raw[] | undefined = Array.isArray(item?.scans) ? item.scans : undefined;
  const id = String(item?.id ?? `b-${item?.timestamp}-${item?.repository}`);
  const event: WebhookEvent = {
    id,
    source: 'securedevops',
    event: String(item?.event ?? 'unknown'),
    repo: String(item?.repository ?? ''),
    sha: item?.commitSha ? String(item.commitSha) : undefined,
    ref: item?.ref ? String(item.ref) : undefined,
    timestamp: String(item?.timestamp ?? new Date().toISOString()),
    findingsCount: typeof item?.findingsCount === 'number' ? item.findingsCount : undefined,
    totalDependencies: typeof item?.totalDependencies === 'number' ? item.totalDependencies : undefined,
    projectsCount: typeof item?.scannedProjectsCount === 'number' ? item.scannedProjectsCount : undefined,
    message: item?.message ? String(item.message) : undefined,
    scanId: isPush && scans ? id : undefined,
  };
  if (!isPush || !scans) return { event };
  const scan = scanFromSecuredevopsProjects(normalizeSecuredevopsScans(scans), {
    id,
    repo: event.repo,
    ref: event.ref ?? undefined,
    trigger: 'push',
    commitSha: event.sha,
    scannedAt: event.timestamp,
  });
  return { event, scan };
}

/** SSE `push_scan_completed` payload. */
export function normalizeSecuredevopsPush(data: Raw): { event: WebhookEvent; scan?: ScanRun } {
  const ts = new Date().toISOString();
  const id = `live-b-${data?.repository}-${data?.commitSha ?? ts}`;
  return normalizeSecuredevopsActivity({
    id,
    event: 'push',
    repository: data?.repository,
    commitSha: data?.commitSha,
    ref: data?.ref,
    timestamp: ts,
    findingsCount: data?.findingsCount,
    scannedProjectsCount: data?.scannedProjectsCount,
    scans: data?.scans,
  });
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export function aggregateMetrics(projects: Project[]): Metrics {
  const out: Metrics = {
    totalDependencies: 0,
    vulnerableDependencies: 0,
    totalFindings: 0,
    severityCounts: emptyCounts(),
  };
  for (const p of projects) {
    out.totalDependencies += p.metrics.totalDependencies;
    out.vulnerableDependencies += p.metrics.vulnerableDependencies;
    out.totalFindings += p.metrics.totalFindings;
    (Object.keys(out.severityCounts) as (keyof SeverityCounts)[]).forEach((k) => {
      out.severityCounts[k] += p.metrics.severityCounts[k];
    });
  }
  return out;
}

export function highestSeverity(counts: SeverityCounts): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' | 'NONE' {
  if (counts.critical) return 'CRITICAL';
  if (counts.high) return 'HIGH';
  if (counts.medium) return 'MEDIUM';
  if (counts.low) return 'LOW';
  if (counts.unknown) return 'UNKNOWN';
  return 'NONE';
}

const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SAFE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

/**
 * Upgrade command for a finding. Returns undefined unless the package name and version
 * are plain npm tokens, so hostile values from a scanned package.json can never be
 * turned into a command string (backend A built these into inline onclick handlers).
 */
export function fixCommand(f: Pick<Finding, 'packageName' | 'fixedVersion'>): string | undefined {
  if (!f.fixedVersion) return undefined;
  if (!NPM_NAME.test(f.packageName) || !SAFE_VERSION.test(f.fixedVersion)) return undefined;
  return `npm i ${f.packageName}@${f.fixedVersion}`;
}

const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

export function advisoryLinks(f: Finding): { label: string; url: string }[] {
  const ids = Array.from(new Set([f.osvId, ...f.aliases])).filter((i) => i && SAFE_ID.test(i));
  const out: { label: string; url: string }[] = [];
  for (const id of ids) {
    if (/^CVE-/i.test(id)) out.push({ label: `nvd.nist.gov/${id}`, url: `https://nvd.nist.gov/vuln/detail/${id}` });
    else if (/^GHSA-/i.test(id)) out.push({ label: `github.com/advisories/${id}`, url: `https://github.com/advisories/${id}` });
  }
  const primary = ids[0];
  if (primary) out.push({ label: `osv.dev/${primary}`, url: `https://osv.dev/vulnerability/${primary}` });
  return out;
}

export function safeExternalUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function compareSeverity(a: Finding, b: Finding): number {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
}

/** SARIF 2.1.0 export built entirely client-side from normalised findings. */
export function toSarif(scan: ScanRun, projects: Project[]) {
  const level = (s: Finding['severity']) => (s === 'CRITICAL' || s === 'HIGH' ? 'error' : s === 'MEDIUM' ? 'warning' : 'note');
  const results = projects.flatMap((p) =>
    p.findings.map((f) => ({
      ruleId: f.osvId || f.aliases[0] || 'unknown',
      level: level(f.severity),
      message: { text: `${f.packageName}@${f.installedVersion}: ${f.summary}${f.fixedVersion ? ` (fixed in ${f.fixedVersion})` : ''}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: `${p.path ? `${p.path.replace(/\/$/, '')}/` : ''}package.json` },
          },
        },
      ],
      properties: { severity: f.severity, cvssScore: f.cvssScore, aliases: f.aliases },
    })),
  );
  const ruleIds = Array.from(new Set(results.map((r) => r.ruleId)));
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'SecureDevOps (OSV)', rules: ruleIds.map((id) => ({ id })) } },
        results,
      },
    ],
  };
}
