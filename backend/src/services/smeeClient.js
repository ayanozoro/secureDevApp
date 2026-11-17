/**
 * Smee.io Client Service
 * Connects to the Smee.io webhook delivery channel and forwards payloads
 * to the internal webhook handler.
 */

const https = require('https');
const { URL } = require('url');

class SmeeListener {
  constructor(options = {}) {
    this.source = options.source || process.env.SMEE_URL;
    this.onMessage = options.onMessage || null;
    this.onStatusChange = options.onStatusChange || null;
    this.isConnected = false;
    this.client = null;
    this.req = null;
    this.reconnectTimer = null;
  }

  start() {
    if (!this.source) {
      console.warn('[Smee] No SMEE_URL configured. Smee listener skipped.');
      this.updateStatus(false, 'No SMEE_URL configured');
      return;
    }

    console.log(`[Smee] Connecting to delivery channel: ${this.source}`);

    // Try smee-client package first
    try {
      const SmeeClient = require('smee-client');
      // Pass a dummy target or custom onMessage if supported
      const smee = new SmeeClient({
        source: this.source,
        target: `http://localhost:${process.env.PORT || 4000}/api/webhook`,
        logger: {
          info: (msg) => {
            console.log(`[Smee] ${msg}`);
            if (msg.includes('Connected')) this.updateStatus(true, 'Connected via SmeeClient');
          },
          error: (msg) => {
            console.error(`[Smee Error] ${msg}`);
            this.updateStatus(false, msg);
          },
        },
      });

      this.client = smee.start();
      this.updateStatus(true, 'Connected to Smee.io');
      return;
    } catch (err) {
      console.log('[Smee] smee-client package not available or failed. Using built-in SSE fallback...');
    }

    // Built-in Native SSE Streamer fallback
    this.connectNativeSSE();
  }

  updateStatus(connected, message = '') {
    this.isConnected = connected;
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange({
        connected,
        source: this.source,
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  connectNativeSSE() {
    if (!this.source) return;

    try {
      const url = new URL(this.source);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          'User-Agent': 'SecureDevOps-Smee-Client/1.0',
        },
      };

      this.req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          console.error(`[Smee] Connection failed with status: ${res.statusCode}`);
          this.updateStatus(false, `HTTP error ${res.statusCode}`);
          this.scheduleReconnect();
          return;
        }

        console.log('[Smee] Successfully connected to Smee.io channel stream (SSE)!');
        this.updateStatus(true, 'Connected (Native SSE)');

        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep trailing incomplete line

          let eventName = 'message';
          let dataLines = [];

          for (const line of lines) {
            if (line.startsWith(':')) {
              continue; // Keepalive ping
            } else if (line.startsWith('event:')) {
              eventName = line.replace('event:', '').trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.replace('data:', '').trim());
            } else if (line === '') {
              if (dataLines.length > 0) {
                const rawData = dataLines.join('\n');
                this.handleSmeeEvent(eventName, rawData);
                dataLines = [];
                eventName = 'message';
              }
            }
          }
        });

        res.on('end', () => {
          console.warn('[Smee] Stream ended by server. Reconnecting in 5s...');
          this.updateStatus(false, 'Disconnected');
          this.scheduleReconnect();
        });

        res.on('error', (err) => {
          console.error(`[Smee Stream Error]: ${err.message}`);
          this.updateStatus(false, err.message);
          this.scheduleReconnect();
        });
      });

      this.req.on('error', (err) => {
        console.error(`[Smee Request Error]: ${err.message}`);
        this.updateStatus(false, err.message);
        this.scheduleReconnect();
      });

      this.req.end();
    } catch (err) {
      console.error(`[Smee Init Error]: ${err.message}`);
      this.updateStatus(false, err.message);
      this.scheduleReconnect();
    }
  }

  handleSmeeEvent(eventName, rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (typeof this.onMessage === 'function') {
        const headers = parsed['x-github-event'] ? parsed : parsed.headers || {};
        const body = parsed.body || parsed;
        this.onMessage({ headers, body });
      }
    } catch (err) {
      console.error('[Smee] Failed to parse event payload:', err.message);
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[Smee] Reconnecting...');
      this.connectNativeSSE();
    }, 5000);
  }
}

module.exports = SmeeListener;
