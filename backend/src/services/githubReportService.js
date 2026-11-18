/**
 * GitHub Repository Reporting Service
 * Posts formatted vulnerability scan reports directly to GitHub repositories:
 *  1. Commit Comments (on push / ping / manual repo scan)
 *  2. Pull Request Comments (create or update existing comment on PR)
 *  3. GitHub Security Alert Issues (create/update when vulnerabilities exist, auto-close when fixed)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const PR_COMMENT_MARKER = '<!-- securedevops-scan-report -->';
const ISSUE_MARKER = '<!-- securedevops-security-issue -->';
const SEVERITY_ORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const SEVERITY_EMOJI = {
  CRITICAL: '🔴 CRITICAL',
  HIGH: '🟠 HIGH',
  MEDIUM: '🟡 MEDIUM',
  LOW: '🔵 LOW',
  UNKNOWN: '⚪ UNKNOWN',
};

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'SecureDevOps-Scanner/1.0',
    'Content-Type': 'application/json',
  };
}

/**
 * Generate a short-lived GitHub App JWT (fallback when no user OAuth token is in memory)
 */
function generateGitHubAppJwt() {
  const appId = (process.env.GITHUB_APP_ID || '').trim();
  if (!appId) return null;

  let privateKey = null;
  const envKeyContent = (process.env.GITHUB_APP_PRIVATE_KEY_CONTENT || '').trim();
  const keyPathSetting = (process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY || './github-key.pem').trim();

  if (envKeyContent) {
    privateKey = envKeyContent.replace(/\\n/g, '\n');
  } else if (keyPathSetting.includes('-----BEGIN')) {
    privateKey = keyPathSetting.replace(/\\n/g, '\n');
  } else if (keyPathSetting) {
    const resolvedPath = path.isAbsolute(keyPathSetting)
      ? keyPathSetting
      : path.join(__dirname, '..', '..', keyPathSetting);
    if (fs.existsSync(resolvedPath)) {
      privateKey = fs.readFileSync(resolvedPath, 'utf8');
    }
  }

  if (!privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

/**
 * Obtain a GitHub App Installation Access Token for owner/repo
 */
async function getAppInstallationToken(repoFullName, installationId = null) {
  try {
    const jwt = generateGitHubAppJwt();
    if (!jwt) return null;

    let instId = installationId;
    if (!instId) {
      const instRes = await fetch(`https://api.github.com/repos/${repoFullName}/installation`, {
        headers: ghHeaders(jwt),
      });
      if (!instRes.ok) return null;
      const instData = await instRes.json();
      instId = instData.id;
    }
    if (!instId) return null;

    const tokRes = await fetch(
      `https://api.github.com/app/installations/${instId}/access_tokens`,
      {
        method: 'POST',
        headers: ghHeaders(jwt),
        body: JSON.stringify({}),
      },
    );
    if (!tokRes.ok) return null;
    const tokData = await tokRes.json();
    return tokData.token || null;
  } catch {
    return null;
  }
}

/**
 * Resolve best GitHub token for posting back to a repository
 */
async function resolveRepoWriteToken(scanRecord, tokenOverride = null) {
  if (tokenOverride) return tokenOverride;
  if (scanRecord && scanRecord.githubToken) return scanRecord.githubToken;
  if (scanRecord && scanRecord.repoName) {
    const repoToken = store.getRepoToken(scanRecord.repoName);
    if (repoToken) return repoToken;
    const binding = await store.getRepoBinding(scanRecord.repoName);
    if (binding && binding.token) return binding.token;
  }
  if (store.inMemoryUserToken) return store.inMemoryUserToken;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  // Fallback to GitHub App Installation Token
  if (scanRecord && scanRecord.repoName && scanRecord.repoName.includes('/')) {
    return await getAppInstallationToken(scanRecord.repoName, scanRecord.installationId);
  }
  return null;
}

/**
 * Fetch latest commit SHA for a branch when scanRecord doesn't carry a 40-char SHA
 */
async function resolveFullCommitSha(repoFullName, scanRecord, token) {
  const candidate = scanRecord.fullCommitSha || scanRecord.commitSha || '';
  if (/^[a-f0-9]{40}$/i.test(candidate)) {
    return candidate;
  }

  const branch = scanRecord.branch || 'main';
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoFullName}/commits/${encodeURIComponent(branch)}`,
      { headers: ghHeaders(token) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.sha && /^[a-f0-9]{40}$/i.test(data.sha) ? data.sha : null;
  } catch {
    return null;
  }
}

function escapeMdCell(str) {
  return String(str ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildFixCell(vuln) {
  const pkg = String(vuln.packageName || '').trim();
  const fixed = String(vuln.fixedIn || '').split(',')[0].trim();
  if (
    fixed &&
    !/no fix/i.test(fixed) &&
    /^[@A-Za-z0-9_./-]+$/.test(pkg) &&
    /^[A-Za-z0-9._+-]+$/.test(fixed)
  ) {
    return `\`npm i ${pkg}@${fixed}\``;
  }
  return fixed && !/no fix/i.test(fixed) ? escapeMdCell(fixed) : '_No fix published yet_';
}

/**
 * Build a clean GitHub-Flavored Markdown vulnerability report
 */
function buildMarkdownReport(scan, marker = PR_COMMENT_MARKER) {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const scanUrl = `${frontendUrl}/scans/${encodeURIComponent(scan.id)}`;
  const repoName = scan.repoName || 'Repository';
  const branch = scan.branch || 'main';
  const shortSha = (scan.fullCommitSha || scan.commitSha || 'HEAD').substring(0, 7);
  const trigger = scan.event || 'scan';
  const pkgPath = scan.packagePath || 'package.json';

  const totalPackages = Number(scan.totalPackages || 0);
  const vulnerableCount = Number(scan.vulnerableCount || 0);
  const criticalCount = Number(scan.criticalCount || 0);
  const highCount = Number(scan.highCount || 0);
  const mediumCount = Number(scan.mediumCount || 0);
  const lowCount = Number(scan.lowCount || 0);

  const vulns = Array.isArray(scan.vulnerabilities) ? scan.vulnerabilities.slice() : [];
  vulns.sort(
    (a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0),
  );

  const hasVulns = vulnerableCount > 0 || vulns.length > 0;
  const heading = hasVulns
    ? `## 🚨 SecureDevOps Vulnerability Scan Report`
    : `## ✅ SecureDevOps Security Scan — All Clear`;

  const lines = [
    marker,
    heading,
    '',
    `**Repository:** \`${repoName}\` · **Branch:** \`${branch}\` · **Commit:** \`${shortSha}\` · **Trigger:** \`${trigger}\` · **File:** \`${pkgPath}\``,
    '',
    `| Total Packages | Vulnerable Packages | 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low |`,
    `|:---:|:---:|:---:|:---:|:---:|:---:|`,
    `| **${totalPackages}** | **${vulnerableCount}** | **${criticalCount}** | **${highCount}** | **${mediumCount}** | **${lowCount}** |`,
    '',
  ];

  if (hasVulns && vulns.length > 0) {
    lines.push(`### Detected Vulnerabilities (${vulns.length})`);
    lines.push('');
    lines.push(`| Package | Installed | Severity | Advisory | Summary | Recommended Fix |`);
    lines.push(`|---|---|---|---|---|---|`);

    for (const v of vulns.slice(0, 25)) {
      const sev = (v.severity || 'UNKNOWN').toUpperCase();
      const sevLabel = SEVERITY_EMOJI[sev] || sev;
      const advisory = v.cve || v.ghsa || v.id || 'OSV';
      const summary = escapeMdCell(v.summary).slice(0, 110);
      lines.push(
        `| \`${escapeMdCell(v.packageName)}\` | \`${escapeMdCell(v.installedVersion)}\` | ${sevLabel} | \`${escapeMdCell(advisory)}\` | ${summary} | ${buildFixCell(v)} |`,
      );
    }

    if (vulns.length > 25) {
      lines.push('');
      lines.push(`_Showing top 25 of ${vulns.length} total findings._`);
    }
  } else {
    lines.push(`All **${totalPackages}** scanned dependencies passed with zero known OSV vulnerabilities.`);
  }

  lines.push('');
  lines.push(`---`);
  lines.push(`🔍 [View Full Scan Report in SecureDevOps Dashboard](${scanUrl}) · Scan ID: \`${scan.id}\``);

  return lines.join('\n');
}

/**
 * 1. Post Comment on a specific GitHub Commit
 */
async function postCommitComment(repoFullName, commitSha, body, token) {
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/commits/${commitSha}/comments`,
    {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ body }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Commit comment failed (${res.status}): ${err.message || res.statusText}`);
  }

  const data = await res.json();
  return { id: data.id, url: data.html_url };
}

/**
 * 2. Create or Update Comment on a GitHub Pull Request
 */
async function upsertPullRequestComment(repoFullName, pullNumber, body, token) {
  // Look for an existing SecureDevOps comment on this PR
  let existingCommentId = null;
  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/issues/${pullNumber}/comments?per_page=50`,
      { headers: ghHeaders(token) },
    );
    if (listRes.ok) {
      const comments = await listRes.json();
      if (Array.isArray(comments)) {
        const match = comments.find(
          (c) => typeof c.body === 'string' && c.body.includes(PR_COMMENT_MARKER),
        );
        if (match) existingCommentId = match.id;
      }
    }
  } catch {}

  if (existingCommentId) {
    const patchRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/issues/comments/${existingCommentId}`,
      {
        method: 'PATCH',
        headers: ghHeaders(token),
        body: JSON.stringify({ body }),
      },
    );
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      throw new Error(`PR comment update failed (${patchRes.status}): ${err.message || patchRes.statusText}`);
    }
    const updated = await patchRes.json();
    return { action: 'updated', id: updated.id, url: updated.html_url };
  }

  const postRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/issues/${pullNumber}/comments`,
    {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ body }),
    },
  );
  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}));
    throw new Error(`PR comment failed (${postRes.status}): ${err.message || postRes.statusText}`);
  }
  const created = await postRes.json();
  return { action: 'created', id: created.id, url: created.html_url };
}

/**
 * 3. Create, Update, or Auto-Close GitHub Security Alert Issue
 */
async function syncSecurityIssue(repoFullName, scanRecord, token) {
  const vulns = Array.isArray(scanRecord.vulnerabilities) ? scanRecord.vulnerabilities : [];
  const hasVulns = Number(scanRecord.vulnerableCount || 0) > 0 || vulns.length > 0;
  const criticalCount = Number(scanRecord.criticalCount || 0);
  const highCount = Number(scanRecord.highCount || 0);
  const shortSha = (scanRecord.fullCommitSha || scanRecord.commitSha || 'HEAD').substring(0, 7);

  // Check existing open issues for our tracked security alert issue
  let existingIssue = null;
  const listRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/issues?state=open&per_page=50`,
    { headers: ghHeaders(token) },
  );
  if (listRes.ok) {
    const issues = await listRes.json();
    if (Array.isArray(issues)) {
      existingIssue = issues.find(
        (i) =>
          !i.pull_request &&
          ((typeof i.body === 'string' && i.body.includes(ISSUE_MARKER)) ||
            (typeof i.title === 'string' && i.title.startsWith('[SecureDevOps] Security Alert'))),
      );
    }
  }

  if (hasVulns) {
    const title = `[SecureDevOps] Security Alert: ${vulns.length} vulnerabilities in ${repoFullName} (${criticalCount} Critical, ${highCount} High)`;
    const body = buildMarkdownReport(scanRecord, ISSUE_MARKER);

    if (existingIssue) {
      // Update issue title & body with latest scan
      const patchRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/issues/${existingIssue.number}`,
        {
          method: 'PATCH',
          headers: ghHeaders(token),
          body: JSON.stringify({ title, body }),
        },
      );
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error(`Issue update failed (${patchRes.status}): ${err.message || patchRes.statusText}`);
      }

      // Add a fresh comment referencing this commit so GitHub sends a notification
      await fetch(
        `https://api.github.com/repos/${repoFullName}/issues/${existingIssue.number}/comments`,
        {
          method: 'POST',
          headers: ghHeaders(token),
          body: JSON.stringify({
            body: `🔄 **Scan Rerun (\`${shortSha}\` on \`${scanRecord.branch || 'main'}\`)**: Found **${vulns.length}** vulnerabilities (${criticalCount} Critical, ${highCount} High). Issue description has been updated with the latest findings.`,
          }),
        },
      ).catch(() => {});

      const updated = await patchRes.json();
      return { action: 'updated', number: updated.number, url: updated.html_url };
    }

    // Create new security alert issue
    const createRes = await fetch(`https://api.github.com/repos/${repoFullName}/issues`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ title, body }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(`Issue creation failed (${createRes.status}): ${err.message || createRes.statusText}`);
    }
    const created = await createRes.json();
    return { action: 'created', number: created.number, url: created.html_url };
  }

  // Clean scan: auto-close any previously open SecureDevOps alert issue
  if (existingIssue) {
    await fetch(
      `https://api.github.com/repos/${repoFullName}/issues/${existingIssue.number}/comments`,
      {
        method: 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({
          body: `✅ **All Clear (\`${shortSha}\` on \`${scanRecord.branch || 'main'}\`)**: All **${scanRecord.totalPackages || 0}** scanned packages passed with 0 vulnerabilities. Automatically closing this issue.`,
        }),
      },
    ).catch(() => {});

    const closeRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/issues/${existingIssue.number}`,
      {
        method: 'PATCH',
        headers: ghHeaders(token),
        body: JSON.stringify({ state: 'closed' }),
      },
    );
    if (closeRes.ok) {
      const closed = await closeRes.json();
      return { action: 'closed', number: closed.number, url: closed.html_url };
    }
  }

  return { action: 'none_needed' };
}

/**
 * Main Entry Point: Post Commit/PR Comment + Sync GitHub Issue after a scan completes
 */
async function postScanReportToGitHub(scanRecord, tokenOverride = null) {
  if (!scanRecord || !scanRecord.repoName || !scanRecord.repoName.includes('/')) {
    return { posted: false, reason: 'not_a_github_repo' };
  }

  if (scanRecord.event === 'raw_scan' || scanRecord.repoUrl === '#') {
    return { posted: false, reason: 'raw_scan_skipped' };
  }

  const repoFullName = scanRecord.repoName.trim();
  const token = await resolveRepoWriteToken(scanRecord, tokenOverride);
  if (!token) {
    const msg = `GitHub repo report skipped for ${repoFullName}: No GitHub auth token available. Sign in with GitHub to post comments & issues.`;
    console.warn(`[GitHub Report] ${msg}`);
    store.logActivity('warn', msg, { scanId: scanRecord.id, repo: repoFullName });
    return { posted: false, reason: 'no_token' };
  }

  const results = {
    repo: repoFullName,
    comment: null,
    issue: null,
    errors: [],
  };

  const commentBody = buildMarkdownReport(scanRecord, PR_COMMENT_MARKER);

  // Part A: PR Comment (on pull_request) OR Commit Comment (on push / ping / manual_scan)
  try {
    if (scanRecord.event === 'pull_request' && scanRecord.pullNumber) {
      results.comment = await upsertPullRequestComment(
        repoFullName,
        scanRecord.pullNumber,
        commentBody,
        token,
      );
      store.logActivity(
        'info',
        `GitHub PR #${scanRecord.pullNumber} comment ${results.comment.action} on ${repoFullName} (${results.comment.url})`,
        { scanId: scanRecord.id, ...results.comment },
      );
    } else {
      const fullSha = await resolveFullCommitSha(repoFullName, scanRecord, token);
      if (fullSha) {
        results.comment = await postCommitComment(repoFullName, fullSha, commentBody, token);
        store.logActivity(
          'info',
          `GitHub commit comment posted on ${repoFullName}@${fullSha.substring(0, 7)} (${results.comment.url})`,
          { scanId: scanRecord.id, ...results.comment },
        );
      } else {
        store.logActivity(
          'warn',
          `Skipped GitHub commit comment on ${repoFullName}: Could not resolve a 40-char commit SHA.`,
          { scanId: scanRecord.id },
        );
      }
    }
  } catch (err) {
    console.error(`[GitHub Report] Comment error on ${repoFullName}:`, err.message);
    results.errors.push(err.message);
    store.logActivity('warn', `GitHub comment failed on ${repoFullName}: ${err.message}`, {
      scanId: scanRecord.id,
      repo: repoFullName,
    });
  }

  // Part B: GitHub Issue (create / update on vulnerabilities, auto-close on clean scan)
  try {
    results.issue = await syncSecurityIssue(repoFullName, scanRecord, token);
    if (results.issue && results.issue.url) {
      store.logActivity(
        'info',
        `GitHub Issue #${results.issue.number} ${results.issue.action} on ${repoFullName} (${results.issue.url})`,
        { scanId: scanRecord.id, ...results.issue },
      );
    }
  } catch (err) {
    console.error(`[GitHub Report] Issue error on ${repoFullName}:`, err.message);
    results.errors.push(err.message);
    store.logActivity('warn', `GitHub issue sync failed on ${repoFullName}: ${err.message}`, {
      scanId: scanRecord.id,
      repo: repoFullName,
    });
  }

  return {
    posted: Boolean(results.comment || (results.issue && results.issue.url)),
    ...results,
  };
}

module.exports = {
  resolveRepoWriteToken,
  buildMarkdownReport,
  postCommitComment,
  upsertPullRequestComment,
  syncSecurityIssue,
  postScanReportToGitHub,
};
