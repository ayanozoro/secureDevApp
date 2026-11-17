/**
 * Scan Endpoints (VulnWatch backend A contract)
 */

const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { fetchPackageJson, resolveLoggedInUserEmail } = require('../services/githubService');
const { executeScan } = require('../services/scanService');
const { isEmailConfigured, sendScanCompleteEmail } = require('../services/emailService');
const { createSecurityFixPR } = require('../services/githubFixPrService');

/**
 * 1. Get Scans History
 * GET /api/scans
 */
router.get('/api/scans', (req, res) => {
  res.json({
    total: store.scansHistory.length,
    scans: store.scansHistory,
  });
});

/**
 * 2. Get Single Scan Details
 * GET /api/scans/:id
 */
router.get('/api/scans/:id', (req, res) => {
  const scan = store.scansHistory.find((s) => s.id === req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  res.json(scan);
});

/**
 * 2b. Create or Update Auto-Fix Pull Request for a Scan
 * POST /api/scans/:id/create-pr
 */
router.post('/api/scans/:id/create-pr', async (req, res) => {
  const scan = store.scansHistory.find((s) => s.id === req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });

  const token = store.resolveGitHubToken(req);
  const result = await createSecurityFixPR(scan, token);
  if (!result.created) {
    return res.status(result.error ? 500 : 400).json(result);
  }
  return res.json(result);
});

/**
 * 3. Get Webhook Logs
 * GET /api/logs
 */
router.get('/api/logs', (req, res) => {
  res.json({
    total: store.webhookLogs.length,
    logs: store.webhookLogs,
  });
});

/**
 * 4. Get Status
 * GET /api/status
 */
router.get('/api/status', (req, res) => {
  res.json({
    serverTime: new Date().toISOString(),
    port: process.env.PORT || 4000,
    smee: store.smeeStatus,
    webhookSecretConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    githubAppConfigured: Boolean(process.env.GITHUB_APP_ID),
    githubAppId: process.env.GITHUB_APP_ID || null,
    emailConfigured: isEmailConfigured(),
    totalScans: store.scansHistory.length,
    activeSSEClients: store.sseClientsA.size + store.sseClientsB.size,
  });
});

/**
 * 4b. Send a Test Scan Completion Email
 * POST /api/email/test
 * Body: { to?: "recipient@example.com" }
 */
router.post('/api/email/test', async (req, res) => {
  const { to } = req.body || {};
  const sampleScan = store.scansHistory[0] || {
    id: 'test_scan_' + Date.now(),
    event: 'manual_scan',
    repoName: process.env.DEFAULT_REPO || 'ayanozoro/openMesh',
    branch: 'main',
    commitSha: 'TEST001',
    commitMessage: 'Test email notification from SecureDevOps',
    scannedAt: new Date().toISOString(),
    totalPackages: 5,
    vulnerableCount: 1,
    cleanCount: 4,
    criticalCount: 1,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    vulnerabilities: [
      {
        id: 'GHSA-35jh-r3h4-6jhm',
        cve: 'CVE-2021-23337',
        packageName: 'lodash',
        installedVersion: '4.17.15',
        severity: 'CRITICAL',
        summary: 'Prototype pollution in lodash (test alert)',
        fixedIn: '4.17.21',
      },
    ],
  };

  const token = store.resolveGitHubToken(req);
  const loggedInEmail = await resolveLoggedInUserEmail(token, store);
  const result = await sendScanCompleteEmail(sampleScan, to || loggedInEmail || null);
  if (!result.sent) {
    return res.status(500).json(result);
  }
  return res.json(result);
});

/**
 * 5. On-Demand Manual Scan of a Repository
 * POST /api/scan-repo
 * Body: { repo: "owner/repo", branch: "main", token?: "ghp_..." }
 */
router.post('/api/scan-repo', async (req, res) => {
  const { repo, branch = 'main', token } = req.body;
  if (!repo || !repo.includes('/')) {
    return res.status(400).json({ error: 'Please provide a valid repository in format "owner/repo"' });
  }

  const cleanRepo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  const cleanBranch = (branch || 'main').trim();

  const useToken = token || store.resolveGitHubToken(req);
  if (useToken) {
    store.setRepoToken(cleanRepo, useToken);
  }
  const recipientEmail = await resolveLoggedInUserEmail(useToken, store);
  if (recipientEmail) {
    store.setRepoOwnerEmail(cleanRepo, recipientEmail);
  }

  const meta = {
    event: 'manual_scan',
    repoName: cleanRepo,
    repoUrl: `https://github.com/${cleanRepo}`,
    isPrivate: false,
    branch: cleanBranch,
    commitSha: 'HEAD',
    commitMessage: 'Manual on-demand scan triggered via UI',
    authorName: store.userLogin || 'Dashboard User',
    authorAvatar: '',
    recipientEmail: recipientEmail || undefined,
  };

  try {
    const packageJson = await fetchPackageJson(cleanRepo, cleanBranch, useToken);
    const result = await executeScan(meta, packageJson, { githubToken: useToken });
    return res.json(result);
  } catch (err) {
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    console.error(`[Scan Repo Error] ${cleanRepo}@${cleanBranch} (${statusCode}):`, err.message);
    store.logActivity('error', `Manual scan failed for ${cleanRepo} (${cleanBranch}): ${err.message}`, {
      repo: cleanRepo,
      branch: cleanBranch,
      statusCode,
    });
    return res.status(statusCode).json({ error: err.message });
  }
});

/**
 * 6. On-Demand Manual Scan of Raw package.json Content
 * POST /api/scan-raw
 * Body: { content: "{ ... }", name?: "my-package" }
 */
router.post('/api/scan-raw', async (req, res) => {
  const { content, name = 'custom-package.json' } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'package.json content is required' });
  }

  let parsed;
  try {
    parsed = typeof content === 'object' ? content : JSON.parse(content);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON format: ' + err.message });
  }

  const token = store.resolveGitHubToken(req);
  const recipientEmail = await resolveLoggedInUserEmail(token, store);

  const meta = {
    event: 'raw_scan',
    repoName: parsed.name || name,
    repoUrl: '#',
    isPrivate: false,
    branch: 'local',
    commitSha: 'N/A',
    commitMessage: 'Raw package.json scan',
    authorName: store.userLogin || 'Dashboard User',
    authorAvatar: '',
    recipientEmail: recipientEmail || undefined,
  };

  try {
    const result = await executeScan(meta, parsed);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
