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
const {
  computeAggregateMetrics,
  computeMetrics,
  formatMetricsForExport,
} = require("./data/metrics");

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

async function main() {
  await initDirs(OUTPUT_DIR, DATA_DIR);
  const apiWorking = await testGitHubAPI(GITHUB_USERNAME);
  if (!apiWorking) {
    console.error("GitHub API test failed. Please check your token and permissions.");
    return;
  }
  const periodMetrics = {};
  for (const period of PERIODS) {
    console.log(`Processing ${period.name}...`);
    const csvPath = path.join(DATA_DIR, `commits_${period.name.replace(/ /g, "_")}.csv`);
    const commits = await fetchCommits(
      GITHUB_USERNAME,
      period.start,
      period.end,
      csvPath,
      findReposWithCommitsInPeriod
    );
    const metrics = computeMetrics(commits, CLUSTER_THRESHOLD_MINUTES);
    periodMetrics[period.name] = metrics;
    await exportMetricsJSON(metrics, period.name, OUTPUT_DIR);
    console.log(`  Total commits: ${metrics.summary.total_commits}`);
    console.log(`  Code commits: ${metrics.summary.code_commits}`);
    console.log(`  Doc commits: ${metrics.summary.doc_commits}`);
    console.log(`  Doc percentage: ${metrics.summary.doc_percentage.toFixed(1)}%`);
  }
  await exportMetricsJSON({ periods: periodMetrics }, "agggregate", OUTPUT_DIR);
}

main().catch(console.error);
