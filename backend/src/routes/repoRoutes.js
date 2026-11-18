/**
 * Repository and Webhook Management Routes
 */

const express = require('express');
const router = express.Router();
const store = require('../services/store');
const {
  getUserRepositories,
  checkRepoWebhook,
  createRepoWebhook,
  deleteRepoWebhook,
  resolveLoggedInUserEmail,
} = require('../services/githubService');

/**
 * 1. Fetch List of User's Accessible Repositories
 * GET /api/user/repos
 */
router.get('/api/user/repos', async (req, res) => {
  const token = store.resolveGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not authorized with GitHub. Please sign in.' });
  }

  try {
    const repos = await getUserRepositories(token);
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Check Webhook on a Specific Repository
 * GET /api/repos/check-webhook?repo=owner/repo
 */
router.get('/api/repos/check-webhook', async (req, res) => {
  const token = store.resolveGitHubToken(req);
  const repo = req.query.repo;
  const smeeUrl = (process.env.WEBHOOK_PUBLIC_URL || process.env.SMEE_URL || '').trim();

  if (!repo) {
    return res.status(400).json({ error: 'Repository name required (?repo=owner/repo)' });
  }
  if (!token) {
    return res.status(401).json({ error: 'Not authorized with GitHub.' });
  }

  try {
    const status = await checkRepoWebhook(repo, token, smeeUrl);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Setup Webhook on Repository
 * POST /api/repos/setup-webhook
 * Body: { repo: "owner/repo" }
 */
router.post('/api/repos/setup-webhook', async (req, res) => {
  const token = store.resolveGitHubToken(req);
  const { repo } = req.body;
  const smeeUrl = (process.env.WEBHOOK_PUBLIC_URL || process.env.SMEE_URL || '').trim();
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';

  if (!repo || !repo.includes('/')) {
    return res.status(400).json({ error: 'Valid repository in format "owner/repo" is required.' });
  }
  if (!token) {
    return res.status(401).json({ error: 'Please authorize with GitHub first.' });
  }
  if (!smeeUrl) {
    return res.status(500).json({ error: 'SMEE_URL is not configured in .env' });
  }

  try {
    store.logActivity('info', `Attempting automated webhook installation on ${repo}...`);
    const result = await createRepoWebhook(repo, token, smeeUrl, secret);

    const reqUser = await store.resolveRequestUser(req);
    const ownerEmail = (await resolveLoggedInUserEmail(token, store)) || reqUser.email;
    const ownerLogin = reqUser.login || store.userLogin;
    await store.saveRepoBinding(repo, {
      userLogin: ownerLogin,
      userEmail: ownerEmail,
      hookId: result.hookId,
      webhookActive: true,
      token,
    });

    store.setLastKnownRepo(repo);
    store.logActivity(
      'info',
      `Automated webhook configured for ${repo}: ${result.status} (Hook ID: ${result.hookId || 'N/A'})${ownerEmail ? ` · Alerts -> ${ownerEmail}` : ''}`,
      {
        repo,
        hookId: result.hookId,
        smeeUrl,
        ownerEmail: ownerEmail || undefined,
      },
      ownerLogin,
    );

    res.json({
      success: true,
      repo,
      status: result.status,
      message: result.message,
      hookId: result.hookId,
    });
  } catch (err) {
    store.logActivity('error', `Automated webhook setup failed for ${repo}: ${err.message}`, {
      repo,
      error: err.message,
    });
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Remove Webhook from Repository
 * DELETE /api/repos/webhook
 * Body: { repo: "owner/repo", hookId: 12345 }
 */
router.delete('/api/repos/webhook', async (req, res) => {
  const token = store.resolveGitHubToken(req);
  const { repo, hookId } = req.body;

  if (!repo || !hookId) {
    return res.status(400).json({ error: 'repo and hookId are required.' });
  }
  if (!token) {
    return res.status(401).json({ error: 'Please authorize with GitHub first.' });
  }

  try {
    await deleteRepoWebhook(repo, hookId, token);
    await store.removeRepoWebhook(repo);
    store.logActivity('info', `Webhook (ID: ${hookId}) deleted from ${repo}`);
    res.json({ success: true, message: `Webhook removed from ${repo}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
