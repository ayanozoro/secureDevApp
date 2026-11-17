/**
 * Unified Scan Execution Service
 * Handles scanning, storing history, and dispatching real-time SSE events
 * formatted for both VulnWatch and SecureDevOps frontends.
 */

const store = require('./store');
const { scanPackageJson } = require('./osvScanner');
const { sendScanCompleteEmail } = require('./emailService');
const { postScanReportToGitHub } = require('./githubReportService');
const { createSecurityFixPR } = require('./githubFixPrService');

async function executeScan(meta, packageJson, options = {}) {
  const scanId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  store.logActivity(
    'scan',
    `Starting vulnerability scan for ${meta.repoName} (${meta.branch || 'main'})`,
    { scanId, meta },
  );

  try {
    const scanResult = await scanPackageJson(packageJson);

    const fullRecord = {
      id: scanId,
      ...meta,
      ...scanResult,
      packagePath: meta.packagePath || packageJson._detectedPath || 'package.json',
      status: 'completed',
      scannedAt: new Date().toISOString(),
    };

    store.addScanRecord(fullRecord);

    store.logActivity(
      'scan',
      `Scan complete for ${meta.repoName}: Found ${fullRecord.vulnerableCount} vulnerable packages (${fullRecord.criticalCount} Critical, ${fullRecord.highCount} High)`,
      {
        scanId,
        total: fullRecord.totalPackages,
        vulnerable: fullRecord.vulnerableCount,
        critical: fullRecord.criticalCount,
        high: fullRecord.highCount,
      },
    );

    // Broadcast on Backend A stream (/api/events)
    store.broadcastSSE_A('scan_completed', fullRecord);

    // Prepare Backend B push record
    const pushRecord = {
      id: meta.deliveryId || `push-${Date.now()}`,
      event: 'push',
      repository: meta.repoName,
      commitSha: (meta.commitSha || 'head').substring(0, 7),
      fullCommitSha: meta.commitSha || 'HEAD',
      ref: meta.branch ? (meta.branch.startsWith('refs/') ? meta.branch : `refs/heads/${meta.branch}`) : 'refs/heads/main',
      timestamp: new Date().toISOString(),
      status: 'completed',
      totalDependencies: scanResult.totalPackages,
      findingsCount: scanResult.vulnerabilities.length,
      vulnerabilities: Array.from(new Set(scanResult.vulnerabilities.map((v) => v.packageName))),
      scannedProjectsCount: 1,
      scans: [
        {
          path: meta.packagePath || 'root',
          result: {
            success: true,
            durationMs: 120,
            metrics: {
              totalDependencies: scanResult.totalPackages,
              vulnerableDependencies: scanResult.vulnerableCount,
              totalFindings: scanResult.vulnerabilities.length,
              severityCounts: {
                critical: scanResult.criticalCount,
                high: scanResult.highCount,
                medium: scanResult.mediumCount,
                low: scanResult.lowCount,
                unknown: 0,
              },
            },
            findings: scanResult.vulnerabilities.map((v) => ({
              packageName: v.packageName,
              installedVersion: v.installedVersion,
              osvId: v.id,
              summary: v.summary,
              aliases: [v.cve, v.ghsa, v.id].filter(Boolean),
              severity: v.severity.toLowerCase(),
              cvssScore: v.cvssScore,
              dependencyType: v.dependencyType,
              isDev: v.isDev,
              references: v.references || [],
            })),
          },
        },
      ],
    };

    store.addActivityRecord(pushRecord);

    // Broadcast on Backend B stream (/api/webhooks/events)
    store.broadcastSSE_B({
      type: 'push_scan_completed',
      ...pushRecord,
    });

    // Send scan completion email report to logged-in GitHub user (non-blocking)
    sendScanCompleteEmail(fullRecord).catch((mailErr) => {
      console.error('[ScanService] Unexpected email error:', mailErr.message);
    });

    // Post Commit/PR Comment + Sync GitHub Security Alert Issue on the repository (non-blocking)
    if (!options.skipGitHubPost) {
      postScanReportToGitHub(fullRecord, options.githubToken || null).catch((ghErr) => {
        console.error('[ScanService] Unexpected GitHub report error:', ghErr.message);
      });

      // Automatically generate/update a Security Fix PR upgrading vulnerable packages
      if (fullRecord.vulnerableCount > 0) {
        createSecurityFixPR(fullRecord, options.githubToken || null).catch((prErr) => {
          console.error('[ScanService] Unexpected Auto-Fix PR error:', prErr.message);
        });
      }
    }

    return fullRecord;
  } catch (err) {
    const failedRecord = {
      id: scanId,
      ...meta,
      status: 'failed',
      error: err.message,
      scannedAt: new Date().toISOString(),
      totalPackages: 0,
      vulnerableCount: 0,
      cleanCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      packages: [],
      vulnerabilities: [],
    };
    store.addScanRecord(failedRecord);
    store.logActivity('error', `Scan failed for ${meta.repoName}: ${err.message}`, {
      scanId,
      error: err.message,
    });
    store.broadcastSSE_A('scan_failed', failedRecord);
    throw err;
  }
}

module.exports = {
  executeScan,
};
