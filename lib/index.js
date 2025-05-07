import path from "path";
import fs from "fs/promises";
import { OUTPUT_DIR, DATA_DIR, DEFAULT_PARAMETERS_FILE } from "./config.js";
import { testGitHubAPI } from "./api/github.js";
import { findReposWithCommitsInPeriod } from "./api/queries.js";
import { initDirs, fetchCommits } from "./data/fetch.js";
import { computeMetrics } from "./data/metrics.js";
import { exportMetricsJSON } from "./export/json.js";

async function loadParameters(paramFile) {
  try {
    const data = await fs.readFile(paramFile, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(
      `Error loading parameters from ${paramFile}: ${error.message}`
    );
    process.exit(1);
  }
}
async function main() {
  const args = process.argv.slice(2);
  const parameterFile = args[0] || DEFAULT_PARAMETERS_FILE;
  console.log(`Loading parameters from: ${parameterFile}`);
  const { PERIODS, GITHUB_USERNAME, CLUSTER_THRESHOLD_MINUTES } =
    await loadParameters(parameterFile);
  await initDirs(OUTPUT_DIR, DATA_DIR);
  const apiWorking = await testGitHubAPI(GITHUB_USERNAME);
  if (!apiWorking) {
    console.error(
      "GitHub API test failed. Please check your token and permissions."
    );
    return;
  }
  const periodMetrics = {};
  for (const period of PERIODS) {
    console.log(`Processing ${period.name}...`);
    const jsonPath = path.join(
      DATA_DIR,
      `commits_${period.name.replace(/ /g, "_")}.json`
    );
    const commits = await fetchCommits(
      GITHUB_USERNAME,
      period.start,
      period.end,
      jsonPath,
      findReposWithCommitsInPeriod
    );
    const metrics = computeMetrics(commits, CLUSTER_THRESHOLD_MINUTES);
    periodMetrics[period.name] = metrics;
    await exportMetricsJSON(metrics, period.name, OUTPUT_DIR);
    console.log(`  Total commits: ${metrics.summary.total_commits}`);
    console.log(`  Code commits: ${metrics.summary.code_commits}`);
    console.log(`  Doc commits: ${metrics.summary.doc_commits}`);
    console.log(
      `  Doc percentage: ${metrics.summary.doc_percentage.toFixed(1)}%`
    );
  }
  await exportMetricsJSON({ periods: periodMetrics }, "aggregate", OUTPUT_DIR);
}

main().catch(console.error);
