/**
 * Authentication Routes (GitHub OAuth & Personal Access Token)
 */

const express = require('express');
const router = express.Router();
const store = require('../services/store');
const {
  exchangeOAuthCode,
  getAuthenticatedUser,
  getAuthenticatedUserEmail,
} = require('../services/githubService');

/**
 * 1. Initiate GitHub OAuth Flow
 * GET /auth/github
 */
router.get('/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('GITHUB_CLIENT_ID is not configured in .env');
  }

  const host = req.headers['x-forwarded-host'] || req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const redirectUri = `${protocol}://${host}/auth/github/callback`;
  const scopes = 'repo,admin:repo_hook,read:user,user:email';

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&scope=${encodeURIComponent(scopes)}`;

  console.log(`[OAuth] Redirecting user to GitHub authorization: ${authUrl}`);
  res.redirect(authUrl);
});

/**
 * 2. GitHub OAuth Callback
 * GET /auth/github/callback
 */
router.get('/auth/github/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const targetBase = `${protocol}://${host}`;

  if (error) {
    store.logActivity(
      'warn',
      `GitHub authorization was cancelled or failed: ${error_description || error}`,
    );
    return res.redirect(
      `${targetBase}/settings?auth=failed&error=${encodeURIComponent(
        error_description || error,
      )}`,
    );
  }

  if (!code) {
    return res.status(400).send('Authorization code is missing from GitHub callback.');
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = `${targetBase}/auth/github/callback`;

  try {
    const token = await exchangeOAuthCode(code, clientId, clientSecret, redirectUri);
    store.setUserToken(token);

    // Set cookie valid for 30 days
    res.setHeader(
      'Set-Cookie',
      `gh_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    );

    // Fetch user details & primary email for scan notifications
    try {
      const user = await getAuthenticatedUser(token);
      const email = await getAuthenticatedUserEmail(token, user);
      store.setAuthenticatedUser(token, { login: user.login, email });

      if (email) {
        store.logActivity(
          'info',
          `GitHub authorization successful! Logged in as @${user.login} (${email}) — scan reports will be emailed here.`,
        );
      } else {
        store.logActivity(
          'warn',
          `Logged in as @${user.login}, but GitHub did not return an email address. Enable "Email addresses: Read-only" in GitHub App permissions so scan reports can be emailed to you.`,
        );
      }
    } catch (e) {
      store.logActivity('info', 'GitHub authorization successful with user token.');
    }

    // Redirect to Webhook Repositories tab
    res.redirect(`${targetBase}/webhooks?tab=repos&auth=success`);
  } catch (err) {
    console.error('[OAuth] Token exchange error:', err);
    store.logActivity('error', `GitHub token exchange failed: ${err.message}`);
    res.redirect(
      `${targetBase}/settings?auth=error&message=${encodeURIComponent(err.message)}`,
    );
  }
});

/**
 * 3. Get GitHub Authentication Status & Profile
 * GET /api/auth/status
 */
router.get('/api/auth/status', async (req, res) => {
  const token = store.resolveGitHubToken(req);
  const hasOAuth = Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
  const webhookSecretConfigured = Boolean(process.env.GITHUB_WEBHOOK_SECRET);

  if (!token) {
    return res.json({
      authenticated: false,
      hasOAuth,
      webhookSecretConfigured,
    });
  }

  try {
    const user = await getAuthenticatedUser(token);
    const cached = store.getCachedUserForToken(token);
    let email = cached && cached.login === user.login ? cached.email : null;
    if (!email) {
      email = await getAuthenticatedUserEmail(token, user);
    }
    store.setAuthenticatedUser(token, { login: user.login, email });

    return res.json({
      authenticated: true,
      hasOAuth,
      user: {
        login: user.login,
        name: user.name || user.login,
        email: email || undefined,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        public_repos: user.public_repos,
        total_private_repos: user.total_private_repos || 0,
      },
      webhookSecretConfigured,
    });
  } catch (err) {
    return res.json({
      authenticated: false,
      hasOAuth,
      error: err.message,
      webhookSecretConfigured,
    });
  }
});

/**
 * 4. Link Personal Access Token (PAT)
 * POST /api/auth/token
 */
router.post('/api/auth/token', async (req, res) => {
  const { token } = req.body;
  if (!token || !token.trim()) {
    return res.status(400).json({ error: 'GitHub token cannot be empty.' });
  }

  const cleanToken = token.trim();
  try {
    const user = await getAuthenticatedUser(cleanToken);
    store.setUserToken(cleanToken);
    const email = await getAuthenticatedUserEmail(cleanToken, user);
    store.setAuthenticatedUser(cleanToken, { login: user.login, email });

    res.setHeader(
      'Set-Cookie',
      `gh_token=${cleanToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    );
    store.logActivity(
      'info',
      `Personal Access Token linked for @${user.login}${email ? ` (${email})` : ' (no email scope found)'}`,
    );

    return res.json({
      success: true,
      user: {
        login: user.login,
        name: user.name || user.login,
        email: email || undefined,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: `Invalid GitHub token: ${err.message}` });
  }
});

/**
 * 5. Logout / Disconnect GitHub
 * POST /api/auth/logout
 */
router.post('/api/auth/logout', (req, res) => {
  const token = store.resolveGitHubToken(req);
  store.clearUserToken(token);
  res.setHeader(
    'Set-Cookie',
    'gh_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  );
  store.logActivity('info', 'GitHub account disconnected from session.');
  res.json({ success: true });
});

module.exports = router;
