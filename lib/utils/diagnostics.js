import fs from "fs/promises";
import path from "path";

let diagnosticsEnabled = false;
let diagnosticsDir = "";
let currentUsername = "";

/**
 * Initialize diagnostics system
 * @param {string} username - GitHub username being processed
 * @param {string} outputDir - Base output directory
 */
export async function initDiagnostics(username, outputDir, enabled = true) {
  diagnosticsEnabled = enabled;
  currentUsername = username;

  if (diagnosticsEnabled) {
    diagnosticsDir = path.join(outputDir, username, "diagnostics");
    await fs.mkdir(diagnosticsDir, { recursive: true });
    console.log(`Diagnostics enabled, writing to ${diagnosticsDir}`);
  }
}

/**
 * Save repository discovery information
 * @param {Object} data - Repository discovery diagnostics
 * @param {string} periodName - Name of the period being processed
 */
export async function saveRepoDiscoveryDiagnostics(data, periodName) {
  if (!diagnosticsEnabled) return;

  const fileName = `repo_discovery_${periodName.replace(/ /g, "_")}.json`;
  const filePath = path.join(diagnosticsDir, fileName);

  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Save commit retrieval diagnostics
 * @param {Object} stats - Commit retrieval statistics
 * @param {string} periodName - Name of the period being processed
 */
export async function saveCommitRetrievalDiagnostics(stats, periodName) {
  if (!diagnosticsEnabled) return;

  const fileName = `commit_retrieval_${periodName.replace(/ /g, "_")}.json`;
  const filePath = path.join(diagnosticsDir, fileName);

  await fs.writeFile(filePath, JSON.stringify(stats, null, 2));
}

/**
 * Save list of repositories with access errors
 * @param {Array} repos - List of repository objects with errors
 * @param {string} periodName - Name of the period being processed
 */
export async function saveAccessErrorDiagnostics(repos, periodName) {
  if (!diagnosticsEnabled) return;

  const fileName = `access_errors_${periodName.replace(/ /g, "_")}.json`;
  const filePath = path.join(diagnosticsDir, fileName);

  await fs.writeFile(filePath, JSON.stringify(repos, null, 2));
}
