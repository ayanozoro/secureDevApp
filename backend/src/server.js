/**
 * SecureDevOps Unified Backend Server
 * Serves both Backend A (VulnWatch) and Backend B (SecureDevOps) API contracts,
 * handles GitHub OAuth authentication, repository selection, webhook auto-installation,
 * Smee relay, and Google OSV vulnerability scanning.
 */

const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const store = require('./services/store');
const SmeeListener = require('./services/smeeClient');
const { isEmailConfigured } = require('./services/emailService');

// Import Route Handlers
const authRoutes = require('./routes/authRoutes');
const repoRoutes = require('./routes/repoRoutes');
const scanRoutes = require('./routes/scanRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const sseRoutes = require('./routes/sseRoutes');

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);
const VULNWATCH_PORT = parseInt(process.env.VULNWATCH_PORT || '3001', 10);
const SMEE_URL = process.env.SMEE_URL || '';

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Capture raw body for HMAC verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
    limit: '10mb',
  }),
);
app.use(express.urlencoded({ extended: true }));

// Request logger for development
app.use((req, res, next) => {
  if (!req.url.includes('/events')) {
    console.log(`[${req.method}] ${req.url}`);
  }
  next();
});

// Mount Routes
app.use(sseRoutes);
app.use(authRoutes);
app.use(repoRoutes);
app.use(scanRoutes);
app.use(webhookRoutes);

// Health check root
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SecureDevOps Unified Backend',
    ports: { primary: PORT, vulnwatch: VULNWATCH_PORT },
    smeeConnected: store.smeeStatus.connected,
    uptime: process.uptime(),
  });
});

// Start Primary Server (PORT 4000)
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  SecureDevOps Unified Backend is running!             `);
  console.log(`  Primary Port:     http://localhost:${PORT}          `);
  console.log(`  Webhook Endpoint: http://localhost:${PORT}/api/webhook`);
  console.log(`  GitHub App ID:    ${process.env.GITHUB_APP_ID || 'N/A'}`);
  console.log(`  Smee Channel:     ${SMEE_URL || 'Not configured'}   `);
  console.log(`  Email Alerts:     ${isEmailConfigured() ? `Configured (${process.env.SMTP_USER || process.env.smtp_user})` : 'Not configured'}`);
  console.log(`=======================================================`);

  // Start Smee Listener
  if (SMEE_URL) {
    const smee = new SmeeListener({
      source: SMEE_URL,
      onStatusChange: (status) => {
        store.updateSmeeStatus(status);
      },
      onMessage: async ({ headers, body }) => {
        console.log('[Smee] Relaying incoming delivery...');
        try {
          // Send internal POST to webhook handler
          await fetch(`http://localhost:${PORT}/api/webhook`, {
            method: 'POST',
            headers: {
              ...headers,
              'content-type': 'application/json',
            },
            body: typeof body === 'string' ? body : JSON.stringify(body),
          });
        } catch (err) {
          console.error('[Smee] Relay delivery error:', err.message);
        }
      },
    });

    smee.start();
  }
});

// Optional: Also listen on VULNWATCH_PORT (3001) for out-of-the-box compatibility
// with default Next.js rewrites
if (VULNWATCH_PORT && VULNWATCH_PORT !== PORT) {
  try {
    const secondaryServer = app.listen(VULNWATCH_PORT, () => {
      console.log(`  Secondary Port:   http://localhost:${VULNWATCH_PORT} (VulnWatch backend A)`);
      console.log(`=======================================================`);
    });

    secondaryServer.on('error', (err) => {
      console.warn(`[Warning] Could not bind secondary port ${VULNWATCH_PORT}: ${err.message}. Primary port ${PORT} remains active.`);
    });
  } catch (err) {
    console.warn(`[Warning] Could not start secondary listener: ${err.message}`);
  }
}

module.exports = { app, server };
