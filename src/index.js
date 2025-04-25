const path = require("path");
const fs = require("fs").promises;
const {
  PERIODS,
  OUTPUT_DIR,
  DATA_DIR,
  GITHUB_USERNAME,
  CLUSTER_THRESHOLD_MINUTES,
  DEFAULT_BINS,
} = require("./config");
const { testGitHubAPI } = require("./api/github");
const { findReposWithCommitsInPeriod } = require("./api/queries");
const { initDirs, fetchCommits } = require("./data/fetch");
const { computeMetrics, formatMetricsForExport } = require("./data/metrics");
const {
  createHistogramConfigurations,
} = require("./visualization/charts/histogram");
const {
  generateInteractiveHistograms,
} = require("./visualization/renderers/html");

/**
 * Export metrics data as JSON
 * @param {Object} metrics - Metrics object
 * @param {string} periodName - Name of the period
 * @param {string} outputDir - Output directory
 */
async function exportMetricsJSON(metrics, periodName, outputDir) {
  const exportData = formatMetricsForExport(metrics, periodName);
  const outputPath = path.join(
    outputDir,
    `metrics_${periodName.replace(/ /g, "_")}.json`
  );

  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Saved metrics JSON to ${outputPath}`);
}

/**
 * Main function
 */
async function main() {
  await initDirs(OUTPUT_DIR, DATA_DIR);
  const apiWorking = await testGitHubAPI(GITHUB_USERNAME);
  if (!apiWorking) {
    console.error(
      "GitHub API test failed. Please check your token and permissions."
    );
    return;
  }
  for (const period of PERIODS) {
    console.log(`Processing ${period.name}...`);
    const csvPath = path.join(
      DATA_DIR,
      `commits_${period.name.replace(/ /g, "_")}.csv`
    );
    const commits = await fetchCommits(
      GITHUB_USERNAME,
      period.start,
      period.end,
      csvPath,
      findReposWithCommitsInPeriod
    );
    const metrics = computeMetrics(commits, CLUSTER_THRESHOLD_MINUTES);
    await exportMetricsJSON(metrics, period.name, OUTPUT_DIR);
    const histogramConfigs = createHistogramConfigurations(
      metrics,
      DEFAULT_BINS
    );
    await generateInteractiveHistograms(
      histogramConfigs,
      period.name,
      OUTPUT_DIR
    );
  }
}

main().catch(console.error);
