/**
 * Email Notification Service
 * Sends formatted HTML & plain-text vulnerability scan reports via SMTP (Gmail / custom SMTP)
 * whenever a scan completes.
 */

const nodemailer = require('nodemailer');
const store = require('./store');

let cachedTransporter = null;

function getSmtpConfig() {
  const user = (process.env.SMTP_USER || process.env.smtp_user || '').trim();
  const rawPass = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.smtp_password || '').trim();
  // Gmail App Passwords are often pasted with spaces (e.g. "xxxx xxxx xxxx xxxx")
  const pass = rawPass.replace(/\s+/g, '');
  const host = (process.env.SMTP_HOST || process.env.smtp_host || 'smtp.gmail.com').trim();
  const port = parseInt(process.env.SMTP_PORT || process.env.smtp_port || '465', 10);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

  return { user, pass, host, port, secure };
}

function isEmailConfigured() {
  const { user, pass } = getSmtpConfig();
  return Boolean(user && pass);
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const { user, pass, host, port, secure } = getSmtpConfig();
  if (!user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return cachedTransporter;
}

function isValidDeliverableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
  // Ignore GitHub noreply addresses that bounce
  if (trimmed.toLowerCase().endsWith('@users.noreply.github.com')) return false;
  return true;
}

function resolveRecipientEmail(scanRecord) {
  // 1. Logged-in GitHub user's email attached directly to this scan
  if (scanRecord && isValidDeliverableEmail(scanRecord.recipientEmail)) {
    return scanRecord.recipientEmail.trim();
  }

  // 2. Logged-in GitHub user's email who installed the webhook / scanned this repository
  const repoOwnerEmail = scanRecord && scanRecord.repoName ? store.getRepoOwnerEmail(scanRecord.repoName) : null;
  if (isValidDeliverableEmail(repoOwnerEmail)) {
    return repoOwnerEmail.trim();
  }

  // 3. Currently logged-in GitHub user's email
  if (isValidDeliverableEmail(store.userEmail)) {
    return store.userEmail.trim();
  }

  // 4. Fallback: valid commit author / pusher email from webhook payload
  if (scanRecord && isValidDeliverableEmail(scanRecord.authorEmail)) {
    return scanRecord.authorEmail.trim();
  }

  // 5. Optional explicit override in .env (only if configured)
  const explicitTo = (process.env.ALERT_EMAIL_TO || process.env.NOTIFY_EMAIL || process.env.smtp_to || '').trim();
  if (explicitTo) return explicitTo;

  return null;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SEVERITY_ORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const SEVERITY_COLORS = {
  CRITICAL: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  HIGH: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  MEDIUM: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  LOW: { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' },
  UNKNOWN: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
};

function buildEmailContent(scan) {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const scanUrl = `${frontendUrl}/scans/${encodeURIComponent(scan.id)}`;
  const repoName = scan.repoName || 'Repository';
  const branch = scan.branch || 'main';
  const commitSha = scan.commitSha || 'HEAD';
  const trigger = scan.event || 'scan';
  const totalPackages = Number(scan.totalPackages || 0);
  const vulnerableCount = Number(scan.vulnerableCount || 0);
  const criticalCount = Number(scan.criticalCount || 0);
  const highCount = Number(scan.highCount || 0);
  const mediumCount = Number(scan.mediumCount || 0);
  const lowCount = Number(scan.lowCount || 0);
  const vulns = Array.isArray(scan.vulnerabilities) ? scan.vulnerabilities.slice() : [];

  vulns.sort(
    (a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0),
  );

  const hasVulns = vulnerableCount > 0 || vulns.length > 0;
  const subject = hasVulns
    ? `[SecureDevOps] Security Alert: ${vulns.length} vulnerabilities in ${repoName} (${criticalCount} Critical, ${highCount} High)`
    : `[SecureDevOps] Clean Scan: ${repoName} (${totalPackages} packages checked)`;

  // Plain-text version
  const textLines = [
    `SecureDevOps Vulnerability Scan Report`,
    `======================================`,
    `Repository:  ${repoName}`,
    `Branch:      ${branch}`,
    `Commit:      ${commitSha}`,
    `Trigger:     ${trigger}`,
    `Scanned At:  ${scan.scannedAt || new Date().toISOString()}`,
    ``,
    `Summary:`,
    `- Total Packages:      ${totalPackages}`,
    `- Vulnerable Packages: ${vulnerableCount}`,
    `- Total Findings:      ${vulns.length}`,
    `- Critical: ${criticalCount} | High: ${highCount} | Medium: ${mediumCount} | Low: ${lowCount}`,
    ``,
  ];

  if (vulns.length > 0) {
    textLines.push(`Top Findings:`);
    for (const v of vulns.slice(0, 20)) {
      const advisory = v.cve || v.ghsa || v.id || 'OSV';
      textLines.push(
        `- [${v.severity}] ${v.packageName}@${v.installedVersion} (${advisory}): ${v.summary} | Fix: ${v.fixedIn || 'N/A'}`,
      );
    }
    if (vulns.length > 20) {
      textLines.push(`... and ${vulns.length - 20} more findings.`);
    }
    textLines.push(``);
  } else {
    textLines.push(`No known vulnerabilities were found in this scan.`);
    textLines.push(``);
  }

  textLines.push(`View full report: ${scanUrl}`);

  // HTML version
  const bannerColor = hasVulns ? '#dc2626' : '#059669';
  const bannerTitle = hasVulns
    ? `Vulnerabilities Detected (${vulns.length} finding${vulns.length === 1 ? '' : 's'})`
    : 'All Clear — No Vulnerabilities Found';

  const rowsHtml = vulns
    .slice(0, 25)
    .map((v) => {
      const sev = (v.severity || 'UNKNOWN').toUpperCase();
      const colors = SEVERITY_COLORS[sev] || SEVERITY_COLORS.UNKNOWN;
      const advisory = v.cve || v.ghsa || v.id || 'OSV';
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:13px;color:#0f172a;">
            <strong>${escapeHtml(v.packageName)}</strong><br/>
            <span style="color:#64748b;font-size:12px;">${escapeHtml(v.installedVersion)}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
            <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;background:${colors.bg};color:${colors.text};border:1px solid ${colors.border};">
              ${escapeHtml(sev)}
            </span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;color:#334155;">
            ${escapeHtml(advisory)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">
            ${escapeHtml(v.summary)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;color:#0f766e;">
            ${escapeHtml(v.fixedIn || 'No fix yet')}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
</head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <div style="background:#0f172a;padding:20px 24px;color:#ffffff;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#38bdf8;font-weight:700;">SecureDevOps · OSV Vulnerability Intel</div>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;">${escapeHtml(repoName)}</h1>
    </div>

    <div style="background:${bannerColor};color:#ffffff;padding:12px 24px;font-size:14px;font-weight:600;">
      ${escapeHtml(bannerTitle)}
    </div>

    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
        <tr>
          <td style="padding:4px 0;color:#64748b;width:120px;">Repository</td>
          <td style="padding:4px 0;font-family:monospace;font-weight:600;">${escapeHtml(repoName)}</td>
          <td style="padding:4px 0;color:#64748b;width:110px;">Branch</td>
          <td style="padding:4px 0;font-family:monospace;">${escapeHtml(branch)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Commit</td>
          <td style="padding:4px 0;font-family:monospace;">${escapeHtml(commitSha)}</td>
          <td style="padding:4px 0;color:#64748b;">Trigger</td>
          <td style="padding:4px 0;font-family:monospace;">${escapeHtml(trigger)}</td>
        </tr>
        ${
          scan.commitMessage
            ? `<tr>
                <td style="padding:4px 0;color:#64748b;">Message</td>
                <td colspan="3" style="padding:4px 0;">${escapeHtml(scan.commitMessage)}</td>
              </tr>`
            : ''
        }
      </table>

      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin:0 -8px 24px;">
        <tr>
          <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#0f172a;">${totalPackages}</div>
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Packages</div>
          </td>
          <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#b91c1c;">${criticalCount}</div>
            <div style="font-size:11px;color:#991b1b;text-transform:uppercase;">Critical</div>
          </td>
          <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#c2410c;">${highCount}</div>
            <div style="font-size:11px;color:#9a3412;text-transform:uppercase;">High</div>
          </td>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#b45309;">${mediumCount}</div>
            <div style="font-size:11px;color:#92400e;text-transform:uppercase;">Medium</div>
          </td>
          <td style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#0369a1;">${lowCount}</div>
            <div style="font-size:11px;color:#075985;text-transform:uppercase;">Low</div>
          </td>
        </tr>
      </table>

      ${
        vulns.length > 0
          ? `
        <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;">Detected Vulnerabilities</h2>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;font-size:11px;text-transform:uppercase;color:#475569;">
              <th style="padding:10px 12px;">Package</th>
              <th style="padding:10px 12px;">Severity</th>
              <th style="padding:10px 12px;">Advisory</th>
              <th style="padding:10px 12px;">Summary</th>
              <th style="padding:10px 12px;">Fixed In</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        ${
          vulns.length > 25
            ? `<p style="font-size:12px;color:#64748b;margin-top:8px;">Showing top 25 of ${vulns.length} findings. Open the dashboard to view all.</p>`
            : ''
        }
      `
          : `
        <div style="padding:16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;font-size:14px;">
          All <strong>${totalPackages}</strong> scanned packages passed without known OSV vulnerabilities.
        </div>
      `
      }

      <div style="margin-top:24px;text-align:center;">
        <a href="${escapeHtml(scanUrl)}" style="display:inline-block;padding:10px 20px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
          View Full Scan Report
        </a>
      </div>
    </div>

    <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
      Sent automatically by SecureDevOps Scanner · Scan ID: ${escapeHtml(scan.id)}
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text: textLines.join('\n'), html };
}

/**
 * Send scan completion email report
 */
async function sendScanCompleteEmail(scanRecord, recipientOverride = null) {
  if (!isEmailConfigured()) {
    console.warn('[Email] SMTP credentials (smtp_user / smtp_password) not configured. Skipping email.');
    return { sent: false, reason: 'not_configured' };
  }

  const to = recipientOverride || resolveRecipientEmail(scanRecord);
  if (!to) {
    const msg =
      'Scan report email skipped: No GitHub user email found. Log in with GitHub (and ensure "Email addresses: Read-only" is enabled on your GitHub App) to receive scan emails.';
    console.warn(`[Email] ${msg}`);
    store.logActivity('warn', msg, { scanId: scanRecord.id });
    return { sent: false, reason: 'no_github_user_email' };
  }

  const transporter = getTransporter();
  const { user: fromUser } = getSmtpConfig();
  const { subject, text, html } = buildEmailContent(scanRecord);

  try {
    const info = await transporter.sendMail({
      from: `"SecureDevOps Scanner" <${fromUser}>`,
      to,
      subject,
      text,
      html,
    });

    store.logActivity('info', `Scan report email sent to ${to} (Message ID: ${info.messageId})`, {
      scanId: scanRecord.id,
      to,
      messageId: info.messageId,
    });

    return { sent: true, to, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Failed to send scan notification email:', err.message);
    store.logActivity('warn', `Failed to send scan report email to ${to}: ${err.message}`, {
      scanId: scanRecord.id,
      to,
      error: err.message,
    });
    return { sent: false, to, error: err.message };
  }
}

module.exports = {
  isEmailConfigured,
  resolveRecipientEmail,
  sendScanCompleteEmail,
  buildEmailContent,
};
