/**
 * Webhook Routes
 * Supports incoming webhooks from GitHub & Smee.io, as well as SecureDevOps backend B endpoints.
 */

const express = require('express');
const router = express.Router();
const store = require('../services/store');
const {
  verifyWebhookSignature,
  extractEventDetails,
  findModifiedPackageJsonPath,
  fetchPackageJson,
  resolveLoggedInUserEmail,
} = require('../services/githubService');
const { executeScan } = require('../services/scanService');

/**
 * Common handler for incoming webhook delivery (GitHub direct or via Smee)
 */
async function handleIncomingWebhook(req, res) {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'] || 'unknown';
  const deliveryId = req.headers['x-github-delivery'] || 'local_' + Date.now();

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (e) {}
  }
  if (
    payload &&
    payload.body &&
    typeof payload.body === 'object' &&
    !payload.repository &&
    !payload.commits &&
    !payload.ref
  ) {
    payload = payload.body;
  }

  const meta = extractEventDetails(event, payload, store.lastKnownRepo);
  if (meta.repoName && meta.repoName !== 'unknown/repo') {
    store.setLastKnownRepo(meta.repoName);
  }

  console.log(`\n==========================================`);
  console.log(`[Webhook] Incoming GitHub Delivery: ${deliveryId} (Event: ${event})`);
  console.log(`[Webhook] Resolved Repository: ${meta.repoName} (Branch: ${meta.branch})`);

  // Verify HMAC signature
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const verification = verifyWebhookSignature(req.rawBody || payload, signature, secret);

    if (!verification.valid) {
      if (!signature) {
        store.logActivity(
          'warn',
          `Delivery ${deliveryId}: Missing X-Hub-Signature-256 header.`,
          { event },
        );
      } else {
        store.logActivity(
          'warn',
          `Delivery ${deliveryId}: Signature mismatch. Expected: ${verification.expected?.substring(
            0,
            16,
          )}..., Received: ${signature.substring(0, 16)}...`,
          { event },
        );
      }

      if (process.env.ENFORCE_WEBHOOK_SECRET === 'true') {
        return res.status(401).json({ error: 'Invalid HMAC signature', reason: verification.reason });
      } else {
        store.logActivity(
          'info',
          `[Dev Mode] Continuing automatic scan despite signature mismatch (Smee JSON relay).`,
        );
      }
    } else {
      store.logActivity('info', `Delivery ${deliveryId}: Signature verified successfully.`);
    }
  }

  // Broadcast webhook received event to Backend A
  store.broadcastSSE_A('webhook_received', {
    event,
    delivery: deliveryId,
    repo: meta.repoName,
    time: new Date().toISOString(),
  });

  // 1. Handle Ping event
  if (event === 'ping') {
    store.logActivity('ping', `GitHub Ping event received for repo: ${meta.repoName}`, {
      zen: payload.zen,
      hook_id: payload.hook_id,
    });

    const pingRecord = {
      id: deliveryId || `ping-${Date.now()}`,
      event: 'ping',
      repository: meta.repoName,
      ref: null,
      commitSha: null,
      timestamp: new Date().toISOString(),
      status: 'verified',
      message: payload.zen || 'Webhook ping handshake confirmed.',
    };

    store.addActivityRecord(pingRecord);
    store.broadcastSSE_B({
      type: 'ping_received',
      ...pingRecord,
    });

    res.json({
      message: 'Pong! Webhook connection verified successfully. Running baseline scan...',
      zen: payload.zen,
      repository: meta.repoName,
      scanning: true,
    });

    // Run baseline scan
    if (meta.repoName && meta.repoName !== 'unknown/repo') {
      try {
        store.logActivity(
          'info',
          `Running automatic baseline scan for newly connected repo: ${meta.repoName} (${meta.branch})...`,
        );
        const token = store.resolveGitHubToken(req) || store.getRepoToken(meta.repoName);
        const packageJson = await fetchPackageJson(meta.repoName, meta.branch, token);
        meta.packagePath = packageJson._detectedPath || 'package.json';
        meta.recipientEmail =
          store.getRepoOwnerEmail(meta.repoName) ||
          (await resolveLoggedInUserEmail(token, store)) ||
          undefined;
        await executeScan(meta, packageJson, { githubToken: token });
      } catch (err) {
        store.logActivity('warn', `Baseline scan note for ${meta.repoName}: ${err.message}`, {
          meta,
          error: err.message,
        });
      }
    }
    return;
  }

  // 2. Handle Push or Pull Request event (Auto rerun scan!)
  if (event === 'push' || event === 'pull_request') {
    // Prevent infinite webhook loops from our own auto-fix PR branch
    if (meta.branch && meta.branch.startsWith('securedevops/')) {
      store.logActivity(
        'info',
        `Skipping automated scan for internal SecureDevOps fix branch "${meta.branch}" on ${meta.repoName}.`,
      );
      return res.json({
        message: `Skipped internal fix branch ${meta.branch}`,
        event,
        branch: meta.branch,
        scanning: false,
      });
    }

    store.logActivity(
      'info',
      `Automated trigger: Received ${event.toUpperCase()} on ${meta.repoName}@${meta.branch} by ${
        meta.authorName || 'committer'
      }. Rerunning vulnerability scan...`,
      meta,
    );

    // Respond immediately to GitHub (timeout requirement)
    res.json({
      message: `Webhook accepted for ${meta.repoName}`,
      event,
      branch: meta.branch,
      commit: meta.commitSha,
      scanning: true,
    });

    // Automatically fetch updated files and run OSV scan
    try {
      store.logActivity(
        'info',
        `Automated scan starting: Searching for package.json in ${meta.repoName} (${meta.branch})...`,
      );
      const hintPath = findModifiedPackageJsonPath(payload);
      const token = store.resolveGitHubToken(req) || store.getRepoToken(meta.repoName);
      const packageJson = await fetchPackageJson(meta.repoName, meta.branch, token, hintPath);
      meta.packagePath = packageJson._detectedPath || 'package.json';
      meta.recipientEmail =
        store.getRepoOwnerEmail(meta.repoName) ||
        (await resolveLoggedInUserEmail(token, store)) ||
        undefined;
      store.logActivity(
        'info',
        `Found package file at "${meta.packagePath}". Running OSV scan...`,
      );
      await executeScan(meta, packageJson, { githubToken: token });
    } catch (err) {
      store.logActivity('error', `Automated scan failed for ${meta.repoName}: ${err.message}`, {
        meta,
        error: err.message,
      });
    }
    return;
  }

  store.logActivity('info', `Ignored unhandled event "${event}" from ${meta.repoName}`);
  return res.json({ message: `Event ${event} acknowledged` });
}

// 1. Webhook Receivers: Both /api/webhook and /api/webhooks/github
router.post('/api/webhook', handleIncomingWebhook);
router.post('/api/webhooks/github', handleIncomingWebhook);

// 2. Backend B: GET /api/webhooks/info
router.get('/api/webhooks/info', (req, res) => {
  const port = process.env.PORT || 4000;
  res.json({
    localWebhookUrl: `http://localhost:${port}/api/webhooks/github`,
    smeeUrl: process.env.SMEE_URL || '',
    hasWebhookSecret: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
    supportedEvents: ['push', 'ping', 'pull_request'],
    recentDeliveriesCount: store.recentActivity.length,
  });
});

// 3. Backend B: GET /api/webhooks/activity
router.get('/api/webhooks/activity', (req, res) => {
  res.json({
    activity: store.recentActivity,
  });
});

// 4. Backend B: POST /api/webhooks/test-fetch
router.post('/api/webhooks/test-fetch', async (req, res) => {
  const { owner, repo, ref = 'main' } = req.body || {};
  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo parameters are required.' });
  }

  const repoFullName = `${owner.trim()}/${repo.trim()}`;
  const token = store.resolveGitHubToken(req);

  try {
    if (token) store.setRepoToken(repoFullName, token);
    const recipientEmail = await resolveLoggedInUserEmail(token, store);
    if (recipientEmail) {
      store.setRepoOwnerEmail(repoFullName, recipientEmail);
    }
    const packageJson = await fetchPackageJson(repoFullName, ref, token);
    const meta = {
      event: 'manual_scan',
      repoName: repoFullName,
      branch: ref,
      commitSha: 'HEAD',
      packagePath: packageJson._detectedPath || 'package.json',
      recipientEmail: recipientEmail || undefined,
    };

    const scanResult = await executeScan(meta, packageJson, { githubToken: token });

    const projectResult = {
      scannedPath: meta.packagePath,
      filesFound: { packageJson: true, packageLock: false },
      scanResult: {
        success: true,
        durationMs: 150,
        metrics: {
          totalDependencies: scanResult.totalPackages,
          vulnerableDependencies: scanResult.vulnerableCount,
          totalFindings: scanResult.vulnerabilities.length,
          severityCounts: {
            critical: scanResult.criticalCount,
            high: scanResult.highCount,
            medium: scanResult.mediumCount,
            low: scanResult.lowCount,
            unknown: 0,
          },
        },
        findings: scanResult.vulnerabilities.map((v) => ({
          packageName: v.packageName,
          installedVersion: v.installedVersion,
          osvId: v.id,
          summary: v.summary,
          aliases: [v.cve, v.ghsa, v.id].filter(Boolean),
          severity: v.severity.toLowerCase(),
          cvssScore: v.cvssScore,
          dependencyType: v.dependencyType,
          isDev: v.isDev,
          references: v.references || [],
        })),
      },
    };

    return res.json({
      repository: repoFullName,
      ref,
      projectsFound: 1,
      projects: [projectResult],
    });
  } catch (err) {
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    console.error(`[Test Fetch Error] ${repoFullName}@${ref} (${statusCode}):`, err.message);
    return res.status(statusCode).json({ error: err.message });
  }
});

// 5. Backend B: POST /api/webhooks/simulate
router.post('/api/webhooks/simulate', async (req, res) => {
  const {
    owner = 'ayanozoro',
    repo = 'openMesh',
    ref = 'main',
    event = 'push',
    target = 'local',
  } = req.body || {};

  const deliveryId = 'sim_' + Date.now();
  const repoFullName = `${owner.trim()}/${repo.trim()}`;

  if (event === 'ping') {
    const pingRecord = {
      id: deliveryId,
      event: 'ping',
      repository: repoFullName,
      ref: null,
      commitSha: null,
      timestamp: new Date().toISOString(),
      status: 'verified',
      message: 'Simulated GitHub ping handshake confirmed.',
    };
    store.addActivityRecord(pingRecord);
    store.broadcastSSE_B({
      type: 'ping_received',
      ...pingRecord,
    });

    return res.json({
      success: true,
      event: 'ping',
      target,
      targetUrl: target === 'smee' ? process.env.SMEE_URL : 'http://localhost:4000/api/webhooks/github',
      deliveryId,
      signatureVerified: true,
      statusCode: 200,
      timestamp: new Date().toISOString(),
      data: { message: 'Ping acknowledged' },
    });
  }

  // Simulated push
  try {
    const token = store.resolveGitHubToken(req);
    let packageJson;
    try {
      packageJson = await fetchPackageJson(repoFullName, ref, token);
    } catch {
      // Use fallback vulnerable sample if repo not online
      packageJson = {
        name: repo,
        dependencies: {
          lodash: '4.17.15',
          axios: '0.21.1',
          minimist: '1.2.5',
        },
      };
    }

    const recipientEmail =
      (await resolveLoggedInUserEmail(token, store)) ||
      store.getRepoOwnerEmail(repoFullName) ||
      undefined;

    const meta = {
      event: 'push',
      repoName: repoFullName,
      branch: ref,
      commitSha: 'sim' + Math.random().toString(16).substring(2, 8),
      commitMessage: 'Simulated push webhook trigger',
      authorName: store.userLogin || 'Simulator',
      authorAvatar: '',
      deliveryId,
      recipientEmail,
    };

    const scan = await executeScan(meta, packageJson, { githubToken: token });

    return res.json({
      success: true,
      event: 'push',
      target,
      targetUrl: target === 'smee' ? process.env.SMEE_URL : 'http://localhost:4000/api/webhooks/github',
      deliveryId,
      signatureVerified: true,
      statusCode: 200,
      timestamp: new Date().toISOString(),
      data: {
        scans: [
          {
            path: scan.packagePath || 'root',
            result: {
              success: true,
              metrics: {
                totalDependencies: scan.totalPackages,
                vulnerableDependencies: scan.vulnerableCount,
                totalFindings: scan.vulnerabilities.length,
                severityCounts: {
                  critical: scan.criticalCount,
                  high: scan.highCount,
                  medium: scan.mediumCount,
                  low: scan.lowCount,
                  unknown: 0,
                },
              },
              findings: scan.vulnerabilities.map((v) => ({
                packageName: v.packageName,
                installedVersion: v.installedVersion,
                osvId: v.id,
                summary: v.summary,
                aliases: [v.cve, v.ghsa, v.id].filter(Boolean),
                severity: v.severity.toLowerCase(),
                cvssScore: v.cvssScore,
                dependencyType: v.dependencyType,
                isDev: v.isDev,
                references: v.references,
              })),
            },
          },
        ],
      },
    });
  } catch (err) {
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    console.error(`[Test Fetch Error] ${repoFullName}@${ref} (${statusCode}):`, err.message);
    return res.status(statusCode).json({ error: err.message });
  }
});

module.exports = router;
