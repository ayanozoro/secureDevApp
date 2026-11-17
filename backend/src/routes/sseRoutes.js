/**
 * Server-Sent Events (SSE) Routes
 */

const express = require('express');
const router = express.Router();
const store = require('../services/store');

/**
 * 1. Backend A SSE Stream: GET /api/events
 * Named events: connected, smee_status, webhook_received, scan_completed, scan_failed, activity_log
 */
router.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  store.registerClientA(res);

  // Keepalive interval
  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    store.removeClientA(res);
  });
});

/**
 * 2. Backend B SSE Stream: GET /api/webhooks/events
 * Message events carrying { type: 'push_scan_completed' | 'ping_received' }
 */
router.get('/api/webhooks/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  store.registerClientB(res);

  // Keepalive interval
  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    store.removeClientB(res);
  });
});

module.exports = router;
