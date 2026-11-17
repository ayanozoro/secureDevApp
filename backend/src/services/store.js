/**
 * Unified Persistence Store (MongoDB + In-Memory Fallback + SSE Broadcast Manager)
 */

const { isDbConnected } = require('../db/connection');
const { User, Repository, Scan, Activity, Log } = require('../db/models');

class Store {
  constructor() {
    // Fast in-memory caches (also act as fallback if DB is temporarily offline)
    this.scansHistory = [];
    this.webhookLogs = [];
    this.recentActivity = [];
    this.inMemoryUserToken = null;
    this.userLogin = null;
    this.userEmail = null;
    this.repoEmails = {}; // { "owner/repo": "user@example.com" }
    this.repoTokens = new Map(); // "owner/repo" -> token
    this.repoOwners = new Map(); // "owner/repo" -> login
    this.tokenUserCache = new Map(); // token -> { login, email }
    this.lastKnownRepo = process.env.DEFAULT_REPO || '';

    // Active SSE response streams
    this.sseClientsA = new Set(); // Backend A (/api/events)
    this.sseClientsB = new Set(); // Backend B (/api/webhooks/events)

    this.smeeStatus = {
      connected: false,
      message: 'Initializing...',
      source: process.env.SMEE_URL || '',
    };
  }

  // Parse cookies from incoming request headers
  parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
      rc.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        const key = parts.shift().trim();
        if (key) list[key] = decodeURIComponent(parts.join('='));
      });
    }
    return list;
  }

  // Resolve GitHub token from header, cookie, memory, or .env
  resolveGitHubToken(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    const cookies = this.parseCookies(req);
    if (cookies.gh_token) return cookies.gh_token;
    if (this.inMemoryUserToken) return this.inMemoryUserToken;
    return process.env.GITHUB_TOKEN || null;
  }

  setUserToken(token) {
    this.inMemoryUserToken = token;
  }

  setAuthenticatedUser(token, { login, email }) {
    const cleanLogin = login ? String(login).trim().toLowerCase() : null;
    const cleanEmail = email ? String(email).trim() : null;
    if (token) {
      this.tokenUserCache.set(token, { login: cleanLogin, email: cleanEmail });
    }
    this.userLogin = cleanLogin;
    this.userEmail = cleanEmail;
  }

  /**
   * Persist logged-in GitHub user profile + email + token in MongoDB
   */
  async upsertUser(token, userProfile, email = null) {
    const rawLogin = userProfile && userProfile.login ? String(userProfile.login).trim() : null;
    const login = rawLogin ? rawLogin.toLowerCase() : null;
    const cleanEmail = email ? String(email).trim() : null;

    this.setAuthenticatedUser(token, { login, email: cleanEmail });

    if (!isDbConnected() || !login) return null;

    try {
      const update = {
        login,
        displayLogin: rawLogin,
        name: userProfile.name || rawLogin,
        avatarUrl: userProfile.avatar_url || '',
        htmlUrl: userProfile.html_url || '',
        publicRepos: Number(userProfile.public_repos || 0),
        privateRepos: Number(userProfile.total_private_repos || 0),
        lastLoginAt: new Date(),
      };
      if (userProfile.id) update.githubId = userProfile.id;
      if (cleanEmail) update.email = cleanEmail;
      if (token) update.accessToken = token;

      return await User.findOneAndUpdate(
        { login },
        { $set: update },
        { upsert: true, returnDocument: 'after' },
      ).lean();
    } catch (err) {
      console.error('[Store] Failed to upsert user in MongoDB:', err.message);
      return null;
    }
  }

  /**
   * Resolve currently authenticated user's login & email from request token
   */
  async resolveRequestUser(req) {
    const token = this.resolveGitHubToken(req);
    if (!token) {
      return { login: null, email: null, token: null };
    }

    const cached = this.tokenUserCache.get(token);
    if (cached && cached.login) {
      return { login: cached.login, email: cached.email, token };
    }

    if (isDbConnected()) {
      try {
        const doc = await User.findOne({ accessToken: token }).lean();
        if (doc && doc.login) {
          this.tokenUserCache.set(token, { login: doc.login, email: doc.email || null });
          return { login: doc.login, email: doc.email || null, token };
        }
      } catch {}
    }

    return { login: this.userLogin || null, email: this.userEmail || null, token };
  }

  getCachedUserForToken(token) {
    if (!token) return null;
    return this.tokenUserCache.get(token) || null;
  }

  setUserEmail(email) {
    if (email && typeof email === 'string' && email.trim()) {
      this.userEmail = email.trim();
    }
  }

  setRepoOwnerEmail(repoFullName, email) {
    if (!repoFullName || !email || typeof email !== 'string' || !email.trim()) return;
    const key = repoFullName.trim().toLowerCase();
    this.repoEmails[key] = email.trim();
  }

  getRepoOwnerEmail(repoFullName) {
    if (!repoFullName) return null;
    const key = repoFullName.trim().toLowerCase();
    return this.repoEmails[key] || null;
  }

  setRepoToken(repoFullName, token) {
    if (!repoFullName || !token) return;
    this.repoTokens.set(repoFullName.trim().toLowerCase(), token);
  }

  getRepoToken(repoFullName) {
    if (!repoFullName) return null;
    return this.repoTokens.get(repoFullName.trim().toLowerCase()) || null;
  }

  /**
   * Save repository -> user/webhook binding in MongoDB & memory
   */
  async saveRepoBinding(repoFullName, info = {}) {
    if (!repoFullName || !repoFullName.includes('/')) return null;
    const key = repoFullName.trim().toLowerCase();

    if (info.userEmail) this.repoEmails[key] = info.userEmail.trim();
    if (info.token) this.repoTokens.set(key, info.token);
    if (info.userLogin) this.repoOwners.set(key, info.userLogin.trim().toLowerCase());

    if (!isDbConnected()) return null;

    try {
      const update = {
        fullName: key,
        displayName: repoFullName.trim(),
      };
      if (info.userLogin) update.userLogin = info.userLogin.trim().toLowerCase();
      if (info.userEmail) update.userEmail = info.userEmail.trim();
      if (info.hookId !== undefined) update.hookId = info.hookId;
      if (info.webhookActive !== undefined) update.webhookActive = Boolean(info.webhookActive);
      if (info.defaultBranch) update.defaultBranch = info.defaultBranch;
      if (info.lastScannedAt) update.lastScannedAt = info.lastScannedAt;

      return await Repository.findOneAndUpdate(
        { fullName: key },
        { $set: update },
        { upsert: true, returnDocument: 'after' },
      ).lean();
    } catch (err) {
      console.error('[Store] Failed to save repo binding:', err.message);
      return null;
    }
  }

  /**
   * Look up repo owner's login, email, and GitHub token (memory -> MongoDB)
   * Enables webhook-triggered scans, emails, comments, issues & PRs to work even after server restarts!
   */
  async getRepoBinding(repoFullName) {
    if (!repoFullName || !repoFullName.includes('/')) return null;
    const key = repoFullName.trim().toLowerCase();

    let userLogin = this.repoOwners.get(key) || null;
    let userEmail = this.repoEmails[key] || null;
    let token = this.repoTokens.get(key) || null;
    let hookId = null;
    let webhookActive = false;

    if (isDbConnected()) {
      try {
        const repoDoc = await Repository.findOne({ fullName: key }).lean();
        if (repoDoc) {
          userLogin = userLogin || repoDoc.userLogin || null;
          userEmail = userEmail || repoDoc.userEmail || null;
          hookId = repoDoc.hookId || null;
          webhookActive = Boolean(repoDoc.webhookActive);

          if (userLogin) {
            const userDoc = await User.findOne({ login: userLogin }).lean();
            if (userDoc) {
              userEmail = userEmail || userDoc.email || null;
              token = token || userDoc.accessToken || null;
            }
          }
        }
      } catch (err) {
        console.warn('[Store] Failed to read repo binding from MongoDB:', err.message);
      }
    }

    if (userLogin) this.repoOwners.set(key, userLogin);
    if (userEmail) this.repoEmails[key] = userEmail;
    if (token) this.repoTokens.set(key, token);

    return { userLogin, userEmail, token, hookId, webhookActive };
  }

  async removeRepoWebhook(repoFullName) {
    if (!repoFullName) return;
    const key = repoFullName.trim().toLowerCase();
    if (!isDbConnected()) return;
    try {
      await Repository.updateOne(
        { fullName: key },
        { $set: { webhookActive: false, hookId: null } },
      );
    } catch {}
  }

  clearUserToken(token = null) {
    if (token) {
      this.tokenUserCache.delete(token);
    } else if (this.inMemoryUserToken) {
      this.tokenUserCache.delete(this.inMemoryUserToken);
    }
    this.inMemoryUserToken = null;
    this.userLogin = null;
    this.userEmail = null;
  }

  setLastKnownRepo(repo) {
    if (repo && repo !== 'unknown/repo') {
      this.lastKnownRepo = repo;
    }
  }

  updateSmeeStatus(status) {
    this.smeeStatus = { ...this.smeeStatus, ...status };
    this.broadcastSSE_A('smee_status', this.smeeStatus);
  }

  logActivity(type, message, details = {}, userLogin = null) {
    const resolvedLogin =
      userLogin ||
      (details && details.userLogin) ||
      (details && details.meta && details.meta.userLogin) ||
      this.userLogin ||
      null;

    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      userLogin: resolvedLogin ? String(resolvedLogin).toLowerCase() : null,
      type, // 'info', 'warn', 'error', 'scan', 'ping'
      message,
      details,
      timestamp: new Date().toISOString(),
      source: 'vulnwatch',
    };

    this.webhookLogs.unshift(logItem);
    if (this.webhookLogs.length > 200) this.webhookLogs.pop();

    this.broadcastSSE_A('activity_log', logItem);
    console.log(`[Activity] [${type.toUpperCase()}] ${message}`);

    if (isDbConnected()) {
      Log.create(logItem).catch((err) => {
        console.warn('[Store] Failed to persist log in MongoDB:', err.message);
      });
    }

    return logItem;
  }

  addScanRecord(record) {
    const cleanRecord = {
      ...record,
      userLogin: record.userLogin ? String(record.userLogin).toLowerCase() : null,
    };

    this.scansHistory.unshift(cleanRecord);
    if (this.scansHistory.length > 100) this.scansHistory.pop();

    if (isDbConnected()) {
      Scan.findOneAndUpdate(
        { id: cleanRecord.id },
        { $set: cleanRecord },
        { upsert: true, returnDocument: 'after' },
      ).catch((err) => {
        console.error('[Store] Failed to persist scan in MongoDB:', err.message);
      });

      if (cleanRecord.repoName && cleanRecord.repoName.includes('/')) {
        Repository.updateOne(
          { fullName: cleanRecord.repoName.trim().toLowerCase() },
          {
            $set: {
              displayName: cleanRecord.repoName.trim(),
              lastScannedAt: new Date(),
              ...(cleanRecord.userLogin ? { userLogin: cleanRecord.userLogin } : {}),
            },
          },
          { upsert: true },
        ).catch(() => {});
      }
    }
  }

  async updateScanRecord(scanId, patch) {
    const idx = this.scansHistory.findIndex((s) => s.id === scanId);
    if (idx !== -1) {
      this.scansHistory[idx] = { ...this.scansHistory[idx], ...patch };
    }

    if (isDbConnected()) {
      try {
        await Scan.updateOne({ id: scanId }, { $set: patch });
      } catch (err) {
        console.warn('[Store] Failed to update scan record:', err.message);
      }
    }
  }

  async getScans(userLogin = null, limit = 100) {
    const normalized = userLogin ? String(userLogin).trim().toLowerCase() : null;

    if (isDbConnected()) {
      try {
        const filter = normalized
          ? { $or: [{ userLogin: normalized }, { userLogin: null }] }
          : { userLogin: null };

        const docs = await Scan.find(filter)
          .sort({ scannedAt: -1 })
          .limit(limit)
          .select('-_id -__v')
          .lean();
        return docs;
      } catch (err) {
        console.warn('[Store] Failed to query scans from MongoDB:', err.message);
      }
    }

    if (!normalized) {
      return this.scansHistory.filter((s) => !s.userLogin).slice(0, limit);
    }
    return this.scansHistory
      .filter((s) => s.userLogin === normalized || !s.userLogin)
      .slice(0, limit);
  }

  async getScanById(scanId) {
    const local = this.scansHistory.find((s) => s.id === scanId);
    if (local) return local;

    if (isDbConnected()) {
      try {
        const doc = await Scan.findOne({ id: scanId }).select('-_id -__v').lean();
        if (doc) return doc;
      } catch (err) {
        console.warn('[Store] Failed to fetch scan by ID from MongoDB:', err.message);
      }
    }
    return null;
  }

  async getTotalScansCount(userLogin = null) {
    if (isDbConnected()) {
      try {
        const normalized = userLogin ? String(userLogin).trim().toLowerCase() : null;
        const filter = normalized ? { $or: [{ userLogin: normalized }, { userLogin: null }] } : {};
        return await Scan.countDocuments(filter);
      } catch {}
    }
    return this.scansHistory.length;
  }

  addActivityRecord(record) {
    const cleanRecord = {
      ...record,
      userLogin: record.userLogin ? String(record.userLogin).toLowerCase() : null,
    };

    this.recentActivity.unshift(cleanRecord);
    if (this.recentActivity.length > 100) this.recentActivity.pop();

    if (isDbConnected()) {
      Activity.findOneAndUpdate(
        { id: cleanRecord.id },
        { $set: cleanRecord },
        { upsert: true, returnDocument: 'after' },
      ).catch((err) => {
        console.warn('[Store] Failed to persist activity in MongoDB:', err.message);
      });
    }
  }

  async getActivities(userLogin = null, limit = 100) {
    const normalized = userLogin ? String(userLogin).trim().toLowerCase() : null;

    if (isDbConnected()) {
      try {
        const filter = normalized
          ? { $or: [{ userLogin: normalized }, { userLogin: null }] }
          : { userLogin: null };

        return await Activity.find(filter)
          .sort({ timestamp: -1 })
          .limit(limit)
          .select('-_id -__v')
          .lean();
      } catch (err) {
        console.warn('[Store] Failed to query activities from MongoDB:', err.message);
      }
    }

    if (!normalized) {
      return this.recentActivity.filter((a) => !a.userLogin).slice(0, limit);
    }
    return this.recentActivity
      .filter((a) => a.userLogin === normalized || !a.userLogin)
      .slice(0, limit);
  }

  async getLogs(userLogin = null, limit = 150) {
    const normalized = userLogin ? String(userLogin).trim().toLowerCase() : null;

    if (isDbConnected()) {
      try {
        const filter = normalized
          ? { $or: [{ userLogin: normalized }, { userLogin: null }] }
          : { userLogin: null };

        return await Log.find(filter)
          .sort({ timestamp: -1 })
          .limit(limit)
          .select('-_id -__v')
          .lean();
      } catch (err) {
        console.warn('[Store] Failed to query logs from MongoDB:', err.message);
      }
    }

    if (!normalized) {
      return this.webhookLogs.filter((l) => !l.userLogin).slice(0, limit);
    }
    return this.webhookLogs
      .filter((l) => l.userLogin === normalized || !l.userLogin)
      .slice(0, limit);
  }

  // Register Backend A SSE client (/api/events)
  registerClientA(res) {
    this.sseClientsA.add(res);
    res.write(
      `event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`,
    );
    res.write(`event: smee_status\ndata: ${JSON.stringify(this.smeeStatus)}\n\n`);
  }

  removeClientA(res) {
    this.sseClientsA.delete(res);
  }

  // Register Backend B SSE client (/api/webhooks/events)
  registerClientB(res) {
    this.sseClientsB.add(res);
  }

  removeClientB(res) {
    this.sseClientsB.delete(res);
  }

  // Broadcast to Backend A SSE (/api/events)
  broadcastSSE_A(eventName, data) {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClientsA) {
      try {
        client.write(message);
      } catch (err) {
        this.sseClientsA.delete(client);
      }
    }
  }

  // Broadcast to Backend B SSE (/api/webhooks/events)
  broadcastSSE_B(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClientsB) {
      try {
        client.write(message);
      } catch (err) {
        this.sseClientsB.delete(client);
      }
    }
  }
}

module.exports = new Store();
