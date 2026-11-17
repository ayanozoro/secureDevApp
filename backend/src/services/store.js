/**
 * In-Memory & Persisted Email State + SSE Broadcast Manager
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '..', '.email-state.json');

class Store {
  constructor() {
    this.scansHistory = [];
    this.webhookLogs = [];
    this.recentActivity = [];
    this.inMemoryUserToken = null;
    this.userLogin = null;
    this.userEmail = null;
    this.repoEmails = {}; // { "owner/repo": "user@example.com" }
    this.repoTokens = new Map(); // in-memory only: "owner/repo" -> token
    this.tokenUserCache = new Map(); // token -> { login, email }
    this.lastKnownRepo = process.env.DEFAULT_REPO || 'ayanozoro/openMesh';

    // Set of active SSE response streams
    this.sseClientsA = new Set(); // Backend A (/api/events)
    this.sseClientsB = new Set(); // Backend B (/api/webhooks/events)

    this.smeeStatus = {
      connected: false,
      message: 'Initializing...',
      source: process.env.SMEE_URL || '',
    };

    this.loadPersistedState();
  }

  loadPersistedState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (data.userEmail) this.userEmail = data.userEmail;
        if (data.userLogin) this.userLogin = data.userLogin;
        if (data.repoEmails && typeof data.repoEmails === 'object') {
          this.repoEmails = data.repoEmails;
        }
      }
    } catch (err) {
      console.warn('[Store] Could not load persisted email state:', err.message);
    }
  }

  persistState() {
    try {
      const payload = {
        userLogin: this.userLogin,
        userEmail: this.userEmail,
        repoEmails: this.repoEmails,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Store] Could not persist email state:', err.message);
    }
  }

  // Helper to parse cookies from incoming headers
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

  // Resolve GitHub token
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
    if (token) {
      this.tokenUserCache.set(token, {
        login: login || null,
        email: email ? email.trim() : null,
      });
    }
    this.userLogin = login || null;
    this.userEmail = email ? email.trim() : null;
    this.persistState();
  }

  getCachedUserForToken(token) {
    if (!token) return null;
    return this.tokenUserCache.get(token) || null;
  }

  setUserEmail(email) {
    if (email && typeof email === 'string' && email.trim()) {
      this.userEmail = email.trim();
      this.persistState();
    }
  }

  setRepoOwnerEmail(repoFullName, email) {
    if (!repoFullName || !email || typeof email !== 'string' || !email.trim()) return;
    const key = repoFullName.trim().toLowerCase();
    this.repoEmails[key] = email.trim();
    this.persistState();
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

  clearUserToken(token = null) {
    if (token) {
      this.tokenUserCache.delete(token);
    } else if (this.inMemoryUserToken) {
      this.tokenUserCache.delete(this.inMemoryUserToken);
    }
    this.inMemoryUserToken = null;
    this.userLogin = null;
    this.userEmail = null;
    this.persistState();
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

  logActivity(type, message, details = {}) {
    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
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
    return logItem;
  }

  addScanRecord(record) {
    this.scansHistory.unshift(record);
    if (this.scansHistory.length > 100) this.scansHistory.pop();
  }

  addActivityRecord(record) {
    this.recentActivity.unshift(record);
    if (this.recentActivity.length > 100) this.recentActivity.pop();
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
