/**
 * GitHub Auto-Remediation Pull Request Service
 * Automatically creates/updates a Pull Request on the user's GitHub repository
 * upgrading vulnerable npm packages in package.json to their fixed versions.
 */

const store = require('./store');
const { resolveRepoWriteToken } = require('./githubReportService');

const FIX_BRANCH = 'securedevops/security-fixes';

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
 * Parse a semver string "x.y.z" into numeric tuple [major, minor, patch]
 */
function parseSemverTuple(ver) {
  if (!ver || typeof ver !== 'string') return null;
  const match = ver.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function compareSemver(a, b) {
  const ta = parseSemverTuple(a);
  const tb = parseSemverTuple(b);
  if (!ta && !tb) return 0;
  if (!ta) return -1;
  if (!tb) return 1;
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i];
  }
  return 0;
}

/**
 * Group vulnerabilities by packageName and compute the highest safe fixed version for each
 */
function computePackageUpgrades(vulnerabilities) {
  if (!Array.isArray(vulnerabilities) || vulnerabilities.length === 0) {
    return new Map();
  }

  const byPkg = new Map();

  for (const v of vulnerabilities) {
    const pkgName = String(v.packageName || '').trim();
    if (!pkgName) continue;

    const fixedRaw = String(v.fixedIn || '').trim();
    if (!fixedRaw || /no fix/i.test(fixedRaw)) continue;

    const candidates = fixedRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => parseSemverTuple(s) !== null);

    if (candidates.length === 0) continue;

    const currentResolved = String(v.resolvedVersion || v.installedVersion || '').replace(/^[\^~>=<\s]+/, '');
    const currentTuple = parseSemverTuple(currentResolved);

    // Keep only fixed versions strictly newer than currently installed version
    const newerCandidates = currentTuple
      ? candidates.filter((c) => compareSemver(c, currentResolved) > 0)
      : candidates;

    if (newerCandidates.length === 0) continue;

    newerCandidates.sort(compareSemver);

    // Prefer non-breaking same-major fix (e.g. 8.9.0 -> 8.24.7 instead of breaking 9.11.4);
    // otherwise choose the smallest newer major fix.
    let chosenForAdvisory = newerCandidates[0];
    if (currentTuple) {
      const sameMajor = newerCandidates.filter((c) => {
        const t = parseSemverTuple(c);
        return t && t[0] === currentTuple[0];
      });
      if (sameMajor.length > 0) {
        chosenForAdvisory = sameMajor[sameMajor.length - 1];
      }
    }

    const existing = byPkg.get(pkgName);
    const advisoryId = v.cve || v.ghsa || v.id || 'OSV';

    if (!existing) {
      byPkg.set(pkgName, {
        packageName: pkgName,
        targetVersion: chosenForAdvisory,
        advisories: new Set([advisoryId]),
        severities: new Set([String(v.severity || 'MEDIUM').toUpperCase()]),
      });
    } else {
      if (compareSemver(chosenForAdvisory, existing.targetVersion) > 0) {
        existing.targetVersion = chosenForAdvisory;
      }
      existing.advisories.add(advisoryId);
      existing.severities.add(String(v.severity || 'MEDIUM').toUpperCase());
    }
  }

  return byPkg;
}

/**
 * Format new version string preserving the user's original range prefix (^ or ~)
 */
function applyVersionPrefix(oldRange, newSemver) {
  const raw = String(oldRange || '').trim();
  if (raw.startsWith('^')) return `^${newSemver}`;
  if (raw.startsWith('~')) return `~${newSemver}`;
  if (raw.startsWith('>=')) return `>=${newSemver}`;
  return newSemver;
}

/**
 * Detect JSON indentation (2 or 4 spaces or tab) so git diff stays minimal and clean
 */
function detectJsonIndent(text) {
  const match = text.match(/^[ \t]+(?=")/m);
  return match ? match[0] : 2;
}

function buildFixPrBody(scanRecord, appliedChanges) {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const scanUrl = `${frontendUrl}/scans/${encodeURIComponent(scanRecord.id)}`;

  const lines = [
    `## 🛡️ SecureDevOps Automated Security Upgrades`,
    '',
    `This Pull Request automatically upgrades **${appliedChanges.length}** vulnerable npm ${appliedChanges.length === 1 ? 'dependency' : 'dependencies'} detected by OSV vulnerability scanning on \`${scanRecord.repoName}\` (\`${scanRecord.branch || 'main'}\`).`,
    '',
    `| File | Package | Current | Updated | Advisories Fixed |`,
    `|---|---|---|---|---|`,
  ];

  for (const ch of appliedChanges) {
    const advs = ch.advisories.slice(0, 4).map((a) => `\`${a}\``).join(', ');
    lines.push(
      `| \`${ch.filePath}\` | \`${ch.packageName}\` | \`${ch.oldVersion}\` | **\`${ch.newVersion}\`** | ${advs} |`,
    );
  }

  lines.push('');
  lines.push(`### Next Steps`);
  lines.push(`1. Review the version bumps in the **Files changed** tab.`);
  lines.push(`2. Run your test suite / regenerate \`package-lock.json\` (\`npm install\`) if needed.`);
  lines.push(`3. Merge this PR to resolve the reported vulnerabilities.`);
  lines.push('');
  lines.push(`---`);
  lines.push(`🔍 [View Full Vulnerability Report](${scanUrl}) · Scan ID: \`${scanRecord.id}\``);

  return lines.join('\n');
}

/**
 * Create or update an auto-fix Pull Request on the GitHub repository
 */
async function createSecurityFixPR(scanRecord, tokenOverride = null) {
  if (!scanRecord || !scanRecord.repoName || !scanRecord.repoName.includes('/')) {
    return { created: false, reason: 'not_a_github_repo' };
  }

  if (scanRecord.event === 'raw_scan' || scanRecord.repoUrl === '#') {
    return { created: false, reason: 'raw_scan_skipped' };
  }

  const baseBranch = (scanRecord.branch || 'main').trim();
  // Prevent infinite loop: never generate a fix PR from our own fix branch
  if (baseBranch === FIX_BRANCH || baseBranch.startsWith('securedevops/')) {
    return { created: false, reason: 'skipped_fix_branch' };
  }

  const upgrades = computePackageUpgrades(scanRecord.vulnerabilities);
  if (upgrades.size === 0) {
    return { created: false, reason: 'no_fixable_packages' };
  }

  const repoFullName = scanRecord.repoName.trim();
  const [owner] = repoFullName.split('/');
  const token = await resolveRepoWriteToken(scanRecord, tokenOverride);
  if (!token) {
    store.logActivity(
      'warn',
      `Auto-fix PR skipped for ${repoFullName}: No GitHub token available.`,
      { scanId: scanRecord.id, repo: repoFullName },
    );
    return { created: false, reason: 'no_token' };
  }

  try {
    // 1. Get base branch HEAD SHA
    const refRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
      { headers: ghHeaders(token) },
    );
    if (!refRes.ok) {
      const err = await refRes.json().catch(() => ({}));
      throw new Error(`Could not resolve base branch "${baseBranch}" (${refRes.status}): ${err.message || refRes.statusText}`);
    }
    const refData = await refRes.json();
    const baseSha = refData.object && refData.object.sha;
    if (!baseSha) {
      throw new Error(`Base branch "${baseBranch}" has no commit SHA.`);
    }

    // 2. Create or force-reset the fix branch from baseSha so there are never merge conflicts
    const checkFixBranchRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/ref/heads/${encodeURIComponent(FIX_BRANCH)}`,
      { headers: ghHeaders(token) },
    );

    if (checkFixBranchRes.ok) {
      const resetRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/git/refs/heads/${encodeURIComponent(FIX_BRANCH)}`,
        {
          method: 'PATCH',
          headers: ghHeaders(token),
          body: JSON.stringify({ sha: baseSha, force: true }),
        },
      );
      if (!resetRes.ok) {
        const err = await resetRes.json().catch(() => ({}));
        throw new Error(`Could not update branch "${FIX_BRANCH}" (${resetRes.status}): ${err.message || resetRes.statusText}`);
      }
    } else {
      const createBranchRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
        method: 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({
          ref: `refs/heads/${FIX_BRANCH}`,
          sha: baseSha,
        }),
      });
      if (!createBranchRes.ok) {
        const err = await createBranchRes.json().catch(() => ({}));
        throw new Error(`Could not create branch "${FIX_BRANCH}" (${createBranchRes.status}): ${err.message || createBranchRes.statusText}`);
      }
    }

    // 3. Update every affected package.json file on the fix branch
    const targetPaths = String(scanRecord.packagePath || 'package.json')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const appliedChanges = [];

    for (const filePath of targetPaths) {
      const encodedPath = filePath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');

      const fileRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/contents/${encodedPath}?ref=${encodeURIComponent(FIX_BRANCH)}`,
        { headers: ghHeaders(token) },
      );
      if (!fileRes.ok) continue;

      const fileData = await fileRes.json();
      if (fileData.encoding !== 'base64' || !fileData.content || !fileData.sha) continue;

      const rawText = Buffer.from(fileData.content, 'base64').toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        continue;
      }

      const fileChanges = [];
      for (const section of ['dependencies', 'devDependencies']) {
        if (!parsed[section] || typeof parsed[section] !== 'object') continue;
        for (const [pkgName, upgrade] of upgrades.entries()) {
          if (Object.prototype.hasOwnProperty.call(parsed[section], pkgName)) {
            const oldVersion = parsed[section][pkgName];
            const newVersion = applyVersionPrefix(oldVersion, upgrade.targetVersion);
            if (oldVersion !== newVersion) {
              parsed[section][pkgName] = newVersion;
              fileChanges.push({
                filePath,
                section,
                packageName: pkgName,
                oldVersion,
                newVersion,
                advisories: Array.from(upgrade.advisories),
              });
            }
          }
        }
      }

      if (fileChanges.length === 0) continue;

      const indent = detectJsonIndent(rawText);
      const trailingNewline = rawText.endsWith('\n') ? '\n' : '';
      const updatedText = JSON.stringify(parsed, null, indent) + trailingNewline;

      const commitMsg = `fix(security): upgrade ${fileChanges.map((c) => `${c.packageName}@${c.newVersion}`).join(', ')} in ${filePath}`;
      const putRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/contents/${encodedPath}`,
        {
          method: 'PUT',
          headers: ghHeaders(token),
          body: JSON.stringify({
            message: commitMsg,
            content: Buffer.from(updatedText, 'utf8').toString('base64'),
            sha: fileData.sha,
            branch: FIX_BRANCH,
          }),
        },
      );

      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(`Failed to commit "${filePath}" (${putRes.status}): ${err.message || putRes.statusText}`);
      }

      appliedChanges.push(...fileChanges);
    }

    if (appliedChanges.length === 0) {
      return { created: false, reason: 'no_changes_needed' };
    }

    // 4. Create or Update the Pull Request
    const uniquePkgCount = new Set(appliedChanges.map((c) => c.packageName)).size;
    const prTitle = `fix(security): upgrade ${uniquePkgCount} vulnerable npm ${uniquePkgCount === 1 ? 'dependency' : 'dependencies'}`;
    const prBody = buildFixPrBody(scanRecord, appliedChanges);

    const existingPrRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${FIX_BRANCH}`)}&base=${encodeURIComponent(baseBranch)}`,
      { headers: ghHeaders(token) },
    );

    let existingPr = null;
    if (existingPrRes.ok) {
      const prs = await existingPrRes.json();
      if (Array.isArray(prs) && prs.length > 0) existingPr = prs[0];
    }

    if (existingPr) {
      const patchRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/pulls/${existingPr.number}`,
        {
          method: 'PATCH',
          headers: ghHeaders(token),
          body: JSON.stringify({ title: prTitle, body: prBody }),
        },
      );
      const updated = patchRes.ok ? await patchRes.json() : existingPr;
      store.logActivity(
        'info',
        `Auto-fix Pull Request #${updated.number} updated on ${repoFullName} (${updated.html_url}) — upgraded ${uniquePkgCount} package(s).`,
        { scanId: scanRecord.id, prNumber: updated.number, url: updated.html_url, changes: appliedChanges },
      );
      return {
        created: true,
        action: 'updated',
        prNumber: updated.number,
        url: updated.html_url,
        branch: FIX_BRANCH,
        changes: appliedChanges,
      };
    }

    const createPrRes = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({
        title: prTitle,
        head: FIX_BRANCH,
        base: baseBranch,
        body: prBody,
      }),
    });

    if (!createPrRes.ok) {
      const err = await createPrRes.json().catch(() => ({}));
      throw new Error(`Failed to open Pull Request (${createPrRes.status}): ${err.message || createPrRes.statusText}`);
    }

    const pr = await createPrRes.json();
    store.logActivity(
      'info',
      `Auto-fix Pull Request #${pr.number} opened on ${repoFullName} (${pr.html_url}) — upgraded ${uniquePkgCount} package(s)!`,
      { scanId: scanRecord.id, prNumber: pr.number, url: pr.html_url, changes: appliedChanges },
    );

    return {
      created: true,
      action: 'created',
      prNumber: pr.number,
      url: pr.html_url,
      branch: FIX_BRANCH,
      changes: appliedChanges,
    };
  } catch (err) {
    console.error(`[GitHub Fix PR] Failed for ${repoFullName}:`, err.message);
    store.logActivity('warn', `Auto-fix PR failed for ${repoFullName}: ${err.message}`, {
      scanId: scanRecord.id,
      repo: repoFullName,
    });
    return { created: false, error: err.message };
  }
}

module.exports = {
  FIX_BRANCH,
  computePackageUpgrades,
  applyVersionPrefix,
  createSecurityFixPR,
};
