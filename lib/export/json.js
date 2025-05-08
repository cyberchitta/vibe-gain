import fs from "fs/promises";
import path from "path";
import { commitArrayFormat } from "../data/fetch.js";

/**
 * Format metrics data for export
 * @param {Object} metrics - Metrics object
 * @param {string} periodName - Name of the period
 * @returns {Object} - Formatted data for export
 */
export function formatMetricsForExport(metrics, periodName) {
  return {
    period_name: periodName,
    generated_at: new Date().toISOString(),
    metrics,
  };
}

/**
 * Export metrics data as JSON
 * @param {Object} metrics - Metrics object
 * @param {string} periodName - Name of the period
 * @param {string} outputDir - Output directory
 * @returns {Promise<string>} - Path to the exported file
 */
export async function exportMetricsJSON(metrics, periodName, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const exportData = formatMetricsForExport(metrics, periodName);
  const outputPath = path.join(
    outputDir,
    `metrics_${periodName.replace(/ /g, "_")}.json`
  );
  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Saved metrics JSON to ${outputPath}`);
  return outputPath;
}

/**
 * Export raw commits data for visualization
 * @param {Array} commits - Array of commit objects
 * @param {string} periodName - Name of the period
 * @param {string} outputDir - Output directory
 * @returns {Promise<string>} - Path to the exported file
 */
export async function exportCommitsForVisualization(
  commits,
  periodName,
  outputDir
) {
  const arrayFormat = commitArrayFormat(commits);
  const outputPath = path.join(
    outputDir,
    `viz_commits_${periodName.replace(/ /g, "_")}.json`
  );
  await fs.writeFile(outputPath, JSON.stringify(arrayFormat));
  console.log(`Saved visualization data to ${outputPath}`);
  return outputPath;
}
