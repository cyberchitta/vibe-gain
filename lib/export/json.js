import fs from "fs/promises";
import path from "path";
import { commitArrayFormat } from "../../core/data/transforms.js";
import { formatVizDataForExport } from "../../core/data/viz-data.js";

/**
 * Export visualization data as JSON
 * @param {Object} vizData - Visualization data object
 * @param {string} periodName - Name of the period
 * @param {string} outputDir - Output directory
 * @returns {Promise<string>} - Path to the exported file
 */
export async function exportVizDataJSON(vizData, periodName, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const exportData = formatVizDataForExport(vizData, periodName);
  const outputPath = path.join(
    outputDir,
    `vizdata_${periodName.replace(/ /g, "_")}.json`
  );
  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Saved visualization data JSON to ${outputPath}`);
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
