/**
 * GitHub Service
 * Manages GitHub OAuth, Webhook installation/verification, and repository file retrieval.
 */

const crypto = require('crypto');

/**
 * Verify GitHub Webhook signature (HMAC SHA-256)
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!secret) {
    return { valid: true, reason: 'no_secret_configured' };
  }
  if (!signature) {
    return { valid: false, reason: 'missing_signature_header' };
  }

  const rawStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(rawStr).digest('hex');

  let matches = false;
  try {
    const bufDigest = Buffer.from(digest);
    const bufSig = Buffer.from(signature);
    if (bufDigest.length === bufSig.length && crypto.timingSafeEqual(bufDigest, bufSig)) {
      matches = true;
    }
  } catch (err) {}

  // If not matched, test compact stringify if payload was an object (handles Smee re-serialization)
  if (!matches && typeof payload === 'object') {
    try {
      const compact = JSON.stringify(payload);
      const compactDigest = 'sha256=' + crypto.createHmac('sha256', secret).update(compact).digest('hex');
      const b1 = Buffer.from(compactDigest);
      const b2 = Buffer.from(signature);
      if (b1.length === b2.length && crypto.timingSafeEqual(b1, b2)) {
        matches = true;
      }
    } catch (e) {}
  }

  return {
    valid: matches,
    reason: matches ? 'verified' : 'signature_mismatch',
    expected: digest,
    received: signature,
  };
}

function makeHttpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function fetchJsonViaContentsApi(repoFullName, filePath, branch, token) {
  const encodedPath = filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const apiUrl = `https://api.github.com/repos/${repoFullName}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const apiHeaders = {
    'User-Agent': 'SecureDevOps-Scanner/1.0',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) apiHeaders['Authorization'] = `Bearer ${token}`;

  const apiRes = await fetch(apiUrl, { headers: apiHeaders });
  if (!apiRes.ok) return null;
  const fileData = await apiRes.json();
  if (fileData.encoding === 'base64' && fileData.content) {
    const decoded = Buffer.from(fileData.content, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    parsed._detectedPath = filePath;
    return parsed;
  }
  return null;
}

async function fetchJsonViaRaw(repoFullName, filePath, branch, token) {
  const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${encodeURIComponent(branch)}/${filePath}`;
  const headers = {
    'User-Agent': 'SecureDevOps-Scanner/1.0',
    Accept: 'application/json, text/plain',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const rawRes = await fetch(rawUrl, { headers });
  if (!rawRes.ok) return null;
  const text = await rawRes.text();
  const parsed = JSON.parse(text);
  parsed._detectedPath = filePath;
  return parsed;
}

function countDeclaredDeps(pkg) {
  if (!pkg || typeof pkg !== 'object') return 0;
  return (
    Object.keys(pkg.dependencies || {}).length +
    Object.keys(pkg.devDependencies || {}).length
  );
}

/**
 * Fetch package.json content from GitHub repository.
 * Uses GitHub Git Trees API to discover package.json at ANY path in the repo (works for both public & private repos and monorepos).
 */
async function fetchPackageJson(repoFullName, ref = 'main', token = null, hintPath = null) {
  const branchesToTry = [ref, 'main', 'master'].filter((v, i, a) => v && a.indexOf(v) === i);

  // 1. If a specific modified package.json hintPath is provided, try it directly first
  if (hintPath) {
    for (const b of branchesToTry) {
      try {
        const direct =
          (await fetchJsonViaContentsApi(repoFullName, hintPath, b, token)) ||
          (await fetchJsonViaRaw(repoFullName, hintPath, b, token));
        if (direct) {
          console.log(`[GitHub Service] Found hinted package.json at "${hintPath}" on branch "${b}" in ${repoFullName}`);
          return direct;
        }
      } catch {}
    }
  }

  // 2. Discover ALL package.json files anywhere in the repo via GitHub Git Trees API
  const apiHeaders = {
    'User-Agent': 'SecureDevOps-Scanner/1.0',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) apiHeaders['Authorization'] = `Bearer ${token}`;

  let treeBranch = null;
  let treeData = null;
  let rateLimited = false;
  let accessDenied = false;

  for (const b of branchesToTry) {
    try {
      const treeUrl = `https://api.github.com/repos/${repoFullName}/git/trees/${encodeURIComponent(b)}?recursive=1`;
      const res = await fetch(treeUrl, { headers: apiHeaders });

      if (res.ok) {
        treeData = await res.json();
        treeBranch = b;
        break;
      }

      if (res.status === 403) {
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          rateLimited = true;
          break;
        }
        accessDenied = true;
      } else if (res.status === 401) {
        accessDenied = true;
      }
    } catch {}
  }

  if (treeData && Array.isArray(treeData.tree)) {
    const pkgPaths = treeData.tree
      .filter((item) => {
        if (item.type !== 'blob' || !item.path) return false;
        const p = item.path.toLowerCase();
        if (p !== 'package.json' && !p.endsWith('/package.json')) return false;
        if (
          p.includes('node_modules/') ||
          p.includes('.next/') ||
          p.includes('/dist/') ||
          p.includes('/build/') ||
          p.startsWith('legacy/')
        ) {
          return false;
        }
        return true;
      })
      .map((item) => item.path)
      .sort((a, b) => {
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        if (depthA !== depthB) return depthA - depthB;
        return a.localeCompare(b);
      });

    if (pkgPaths.length === 0) {
      throw makeHttpError(
        `No package.json found anywhere in "${repoFullName}" (branch: ${treeBranch}). Only Node.js/npm repositories with a package.json can be scanned.`,
        404,
      );
    }

    // Fetch up to 6 discovered package.json files in parallel
    const fetched = (
      await Promise.all(
        pkgPaths.slice(0, 6).map(async (p) => {
          try {
            return await fetchJsonViaContentsApi(repoFullName, p, treeBranch, token);
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);

    if (fetched.length === 1) {
      console.log(`[GitHub Service] Found package.json at "${fetched[0]._detectedPath}" on branch "${treeBranch}" in ${repoFullName}`);
      return fetched[0];
    }

    if (fetched.length > 1) {
      const withDeps = fetched.filter((p) => countDeclaredDeps(p) > 0);
      if (withDeps.length === 1) {
        console.log(`[GitHub Service] Found package.json with dependencies at "${withDeps[0]._detectedPath}" in ${repoFullName}`);
        return withDeps[0];
      }
      if (withDeps.length > 1) {
        // Merge dependencies across monorepo packages so nothing is missed
        const mergedDeps = {};
        const mergedDevDeps = {};
        for (const p of withDeps) {
          Object.assign(mergedDeps, p.dependencies || {});
          Object.assign(mergedDevDeps, p.devDependencies || {});
        }
        const pathsLabel = withDeps.map((p) => p._detectedPath).join(', ');
        console.log(`[GitHub Service] Merged ${withDeps.length} package.json files (${pathsLabel}) in ${repoFullName}`);
        return {
          name: withDeps[0].name || repoFullName.split('/')[1],
          dependencies: mergedDeps,
          devDependencies: mergedDevDeps,
          _detectedPath: pathsLabel,
        };
      }
      return fetched[0];
    }
  }

  // 3. Fallback to raw.githubusercontent.com (e.g. if unauthenticated GitHub API rate limit hit)
  if (rateLimited || !token) {
    const fallbackPaths = [
      'package.json',
      'backend/package.json',
      'frontend/package.json',
      'server/package.json',
      'client/package.json',
      'apps/server/package.json',
      'apps/web/package.json',
    ];
    for (const filePath of fallbackPaths) {
      for (const b of branchesToTry) {
        try {
          const parsed = await fetchJsonViaRaw(repoFullName, filePath, b, token);
          if (parsed) {
            console.log(`[GitHub Service] Found package.json via raw fallback at "${filePath}" on branch "${b}" in ${repoFullName}`);
            return parsed;
          }
        } catch {}
      }
    }
  }

  if (accessDenied) {
    throw makeHttpError(
      `Access denied to "${repoFullName}". Please reconnect GitHub in Settings or provide a token with repository read access.`,
      403,
    );
  }

  throw makeHttpError(
    `Repository "${repoFullName}" (branch "${ref}") was not found, is private without access, or contains no package.json.`,
    404,
  );
}

/**
 * Check if the webhook payload indicates any package.json was modified
 */
function isPackageJsonModified(payload) {
  const actual = payload && payload.body && typeof payload.body === 'object' && !payload.commits ? payload.body : payload;
  if (Array.isArray(actual.commits)) {
    for (const commit of actual.commits) {
      const modified = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])];
      if (modified.some((file) => file.toLowerCase().endsWith('package.json'))) {
        return true;
      }
    }
  }

  if (actual.pull_request) {
    return true;
  }

  return false;
}

/**
 * Find the specific package.json file path from modified commit files
 */
function findModifiedPackageJsonPath(payload) {
  const actual = payload && payload.body && typeof payload.body === 'object' && !payload.commits ? payload.body : payload;
  if (Array.isArray(actual.commits)) {
    for (const commit of actual.commits) {
      const files = [...(commit.added || []), ...(commit.modified || [])];
      const match = files.find((f) => f.toLowerCase().endsWith('package.json'));
      if (match) return match;
    }
  }
  return null;
}

/**
 * Extract human-readable commit / event info from webhook payload
 */
function extractEventDetails(eventName, payload, fallbackRepo = null) {
  const actual =
    payload && payload.body && typeof payload.body === 'object' && !payload.repository && !payload.commits
      ? payload.body
      : payload;

  let repoName = 'unknown/repo';
  let repoUrl = '#';
  let isPrivate = false;

  if (actual.repository) {
    repoName = actual.repository.full_name || actual.repository.name || 'unknown/repo';
    repoUrl = actual.repository.html_url || `https://github.com/${repoName}`;
    isPrivate = Boolean(actual.repository.private);
  } else if (Array.isArray(actual.repositories) && actual.repositories.length > 0) {
    repoName = actual.repositories[0].full_name || actual.repositories[0].name;
    repoUrl = `https://github.com/${repoName}`;
  } else if (Array.isArray(actual.repositories_added) && actual.repositories_added.length > 0) {
    repoName = actual.repositories_added[0].full_name || actual.repositories_added[0].name;
    repoUrl = `https://github.com/${repoName}`;
  } else if (actual.hook && actual.hook.repository) {
    repoName = actual.hook.repository.full_name;
    repoUrl = actual.hook.repository.html_url || `https://github.com/${repoName}`;
  }

  if (repoName === 'unknown/repo' && fallbackRepo) {
    repoName = fallbackRepo;
    repoUrl = `https://github.com/${fallbackRepo}`;
  }

  let branch = (actual.repository && actual.repository.default_branch) || 'main';
  let commitSha = '';
  let fullCommitSha = '';
  let pullNumber = null;
  let installationId = (actual.installation && actual.installation.id) || null;
  let commitMessage = '';
  let authorName = '';
  let authorEmail = '';
  let authorAvatar = '';

  if (eventName === 'push') {
    branch = (actual.ref || '').replace('refs/heads/', '') || branch;
    const headCommit = actual.head_commit || (actual.commits && actual.commits[actual.commits.length - 1]);
    fullCommitSha = (headCommit && headCommit.id) || actual.after || '';
    if (fullCommitSha && /^0+$/.test(fullCommitSha)) fullCommitSha = '';
    if (headCommit) {
      commitSha = (headCommit.id || '').substring(0, 7);
      commitMessage = headCommit.message || 'Git push update';
      authorName = headCommit.author ? headCommit.author.name || headCommit.author.username : 'GitHub User';
      authorEmail = (headCommit.author && headCommit.author.email) || '';
    } else if (fullCommitSha) {
      commitSha = fullCommitSha.substring(0, 7);
    }
    if (!authorEmail && actual.pusher && actual.pusher.email) {
      authorEmail = actual.pusher.email;
    }
    if (actual.sender) {
      authorAvatar = actual.sender.avatar_url;
      if (!authorName) authorName = actual.sender.login;
    }
  } else if (eventName === 'pull_request') {
    const pr = actual.pull_request;
    branch = pr ? pr.head.ref : 'pr-branch';
    fullCommitSha = (pr && pr.head && pr.head.sha) || '';
    commitSha = fullCommitSha ? fullCommitSha.substring(0, 7) : '';
    pullNumber = actual.number || (pr && pr.number) || null;
    commitMessage = pr ? pr.title : 'Pull Request';
    authorName = pr && pr.user ? pr.user.login : 'PR Author';
    authorEmail = (pr && pr.user && pr.user.email) || '';
    authorAvatar = pr && pr.user ? pr.user.avatar_url : '';
  } else if (eventName === 'ping') {
    commitSha = 'PING';
    commitMessage = `Connected Webhook (${actual.zen || 'Baseline Scan'})`;
    authorName = actual.sender ? actual.sender.login : 'GitHub';
    authorEmail = (actual.sender && actual.sender.email) || '';
    authorAvatar = actual.sender ? actual.sender.avatar_url : '';
  }

  return {
    event: eventName,
    repoName,
    repoUrl,
    isPrivate,
    branch,
    commitSha,
    fullCommitSha,
    pullNumber,
    installationId,
    commitMessage,
    authorName,
    authorEmail,
    authorAvatar,
  };
}

/**
 * Exchange temporary OAuth code for GitHub user access token
 */
async function exchangeOAuthCode(code, clientId, clientSecret, redirectUri) {
  const bodyData = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  };
  if (redirectUri) bodyData.redirect_uri = redirectUri;

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'SecureDevOps-Scanner/1.0',
    },
    body: JSON.stringify(bodyData),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data.access_token;
}

/**
 * Fetch authenticated GitHub user profile
 */
async function getAuthenticatedUser(token) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SecureDevOps-Scanner/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Fetch repositories accessible to the user
 */
async function getUserRepositories(token) {
  const res = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'SecureDevOps-Scanner/1.0',
      },
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch repos: ${res.statusText}`);
  }

  const repos = await res.json();
  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    private: Boolean(r.private),
    html_url: r.html_url,
    default_branch: r.default_branch || 'main',
    permissions: r.permissions || { admin: false, push: false, pull: true },
    canAdmin: Boolean(r.permissions && r.permissions.admin),
  }));
}

/**
 * Check if the webhook is already installed on a repository
 */
async function checkRepoWebhook(repoFullName, token, targetUrl) {
  const res = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SecureDevOps-Scanner/1.0',
    },
  });

  if (!res.ok) {
    if (res.status === 404 || res.status === 403) {
      return { installed: false, error: 'insufficient_permissions' };
    }
    return { installed: false, error: res.statusText };
  }

  const hooks = await res.json();
  const normalizedTarget = (targetUrl || '').trim().replace(/\/$/, '');
  const existing = hooks.find((h) => {
    const hookUrl = (h.config && h.config.url ? h.config.url : '').trim().replace(/\/$/, '');
    return hookUrl === normalizedTarget;
  });

  return {
    installed: Boolean(existing),
    hookId: existing ? existing.id : null,
    active: existing ? existing.active : false,
    events: existing ? existing.events : [],
  };
}

/**
 * Automatically create a webhook on a GitHub repository
 */
async function createRepoWebhook(repoFullName, token, targetUrl, secret) {
  if (!targetUrl) {
    throw new Error('Target Webhook Delivery URL (SMEE_URL) is not configured.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'SecureDevOps-Scanner/1.0',
  };

  // 1. Check if already exists
  const statusCheck = await checkRepoWebhook(repoFullName, token, targetUrl);
  if (statusCheck.installed) {
    return {
      status: 'already_exists',
      message: `Webhook is already configured and active on ${repoFullName}`,
      hookId: statusCheck.hookId,
    };
  }

  // 2. Create the webhook
  const body = {
    name: 'web',
    active: true,
    events: ['push', 'pull_request', 'ping'],
    config: {
      url: targetUrl,
      content_type: 'json',
      secret: secret || '',
      insecure_ssl: '0',
    },
  };

  const createRes = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    const reason = errData.message || `GitHub API error ${createRes.status}`;
    if (createRes.status === 404 || createRes.status === 403) {
      throw new Error(
        `Permission denied: You need Admin rights on "${repoFullName}" or the "admin:repo_hook" OAuth scope to create webhooks. (${reason})`,
      );
    }
    throw new Error(reason);
  }

  const hook = await createRes.json();
  return {
    status: 'created',
    message: `Webhook installed successfully! GitHub sent an initial ping event.`,
    hookId: hook.id,
    hook,
  };
}

/**
 * Delete a repository webhook
 */
async function deleteRepoWebhook(repoFullName, hookId, token) {
  const res = await fetch(`https://api.github.com/repos/${repoFullName}/hooks/${hookId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SecureDevOps-Scanner/1.0',
    },
  });

  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to delete hook: ${res.statusText}`);
  }

  return { success: true };
}

/**
 * Fetch primary verified email of the authenticated GitHub user
 */
async function getAuthenticatedUserEmail(token, userProfile = null) {
  if (
    userProfile &&
    userProfile.email &&
    !userProfile.email.toLowerCase().endsWith('@users.noreply.github.com')
  ) {
    return userProfile.email;
  }

  try {
    const res = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'SecureDevOps-Scanner/1.0',
      },
    });
    if (!res.ok) {
      console.warn(
        `[GitHub Service] GET /user/emails returned ${res.status} ${res.statusText}. ` +
          `Make sure your GitHub App has "Account permissions -> Email addresses: Read-only" (or OAuth scope "user:email") enabled.`,
      );
      return null;
    }
    const emails = await res.json();
    if (!Array.isArray(emails)) return null;

    const valid = emails.filter(
      (e) => e.email && !e.email.toLowerCase().endsWith('@users.noreply.github.com'),
    );
    const primary =
      valid.find((e) => e.primary && e.verified) ||
      valid.find((e) => e.verified) ||
      valid[0];
    return primary ? primary.email : null;
  } catch (err) {
    console.warn(`[GitHub Service] Could not fetch user emails: ${err.message}`);
    return null;
  }
}

/**
 * Resolve and cache the logged-in GitHub user's email from a token
 */
async function resolveLoggedInUserEmail(token, store) {
  if (!token) return store.userEmail || null;

  const cached = store.getCachedUserForToken(token);
  if (cached && cached.email) {
    store.setAuthenticatedUser(token, cached);
    return cached.email;
  }

  try {
    const user = await getAuthenticatedUser(token);
    const email = await getAuthenticatedUserEmail(token, user);
    store.setAuthenticatedUser(token, { login: user.login, email });
    return email;
  } catch {
    return store.userEmail || null;
  }
}

module.exports = {
  verifyWebhookSignature,
  fetchPackageJson,
  isPackageJsonModified,
  findModifiedPackageJsonPath,
  extractEventDetails,
  exchangeOAuthCode,
  getAuthenticatedUser,
  getAuthenticatedUserEmail,
  resolveLoggedInUserEmail,
  getUserRepositories,
  checkRepoWebhook,
  createRepoWebhook,
  deleteRepoWebhook,
};
