/**
 * Backend wiring. Neither backend ships with this repo, so both are reached through
 * same-origin rewrites. That keeps session cookies first-party (GitHub OAuth, backend A)
 * and avoids hard-coded localhost URLs in the browser bundle.
 *
 *   /api/a/*  -> VULNWATCH_API_URL/api/*              (backend A: scans, auth, repos, logs, SSE)
 *   /api/b/*  -> SECUREDEVOPS_API_URL/api/webhooks/*  (backend B: activity, simulate, info, SSE)
 *   /auth/*   -> VULNWATCH_API_URL/auth/*             (GitHub OAuth start + callback)
 */
const A = (process.env.VULNWATCH_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const B = (process.env.SECUREDEVOPS_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compression buffers text/event-stream responses; the live streams must not be buffered.
  compress: false,
  async rewrites() {
    return [
      { source: '/api/a/:path*', destination: `${A}/api/:path*` },
      { source: '/api/b/:path*', destination: `${B}/api/webhooks/:path*` },
      { source: '/auth/:path*', destination: `${A}/auth/:path*` },
    ];
  },
};

module.exports = nextConfig;
