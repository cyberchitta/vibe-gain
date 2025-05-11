import path from "path";
import fs from "fs/promises";
import { OUTPUT_DIR, DEFAULT_PARAMETERS_FILE, getUserDirs } from "./config.js";
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

async function processUserPeriods(username, periods, clusterThreshold) {
  console.log(`\n==== Processing data for user: ${username} ====`);
  const { outputDir, rawDir } = getUserDirs(username);
  await initDirs(outputDir, rawDir);
  const periodMetrics = {};
  for (const period of periods) {
    console.log(`Processing ${period.name} for ${username}...`);
    const jsonPath = path.join(
      rawDir,
      `commits_${period.name.replace(/ /g, "_")}.json`
    );
    const commits = await fetchCommits(
      username,
      period.start,
      period.end,
      jsonPath,
      findReposWithCommitsInPeriod
    );
    const metrics = computeMetrics(commits, clusterThreshold);
    periodMetrics[period.name] = metrics;
    await exportMetricsJSON(metrics, period.name, outputDir);
    console.log(`  Total commits: ${metrics.summary.total_commits}`);
    console.log(`  Code commits: ${metrics.summary.code_commits}`);
    console.log(`  Doc commits: ${metrics.summary.doc_commits}`);
    console.log(
      `  Doc percentage: ${metrics.summary.doc_percentage.toFixed(1)}%`
    );
  }
  await exportMetricsJSON({ periods: periodMetrics }, "aggregate", outputDir);
  return periodMetrics;
}

async function main() {
  const args = process.argv.slice(2);
  const parameterFile = args[0] || DEFAULT_PARAMETERS_FILE;
  console.log(`Loading parameters from: ${parameterFile}`);
  const { PERIODS, GITHUB_USERNAMES, CLUSTER_THRESHOLD_MINUTES } =
    await loadParameters(parameterFile);
  if (
    !GITHUB_USERNAMES ||
    !Array.isArray(GITHUB_USERNAMES) ||
    GITHUB_USERNAMES.length === 0
  ) {
    console.error(
      "No GitHub usernames specified in parameters file. Please provide GITHUB_USERNAMES as an array."
    );
    return;
  }
  await initDirs(OUTPUT_DIR);
  for (const username of GITHUB_USERNAMES) {
    const apiWorking = await testGitHubAPI(username);
    if (!apiWorking) {
      console.error(
        `GitHub API test failed for ${username}. Please check your token and permissions.`
      );
      continue;
    }
    await processUserPeriods(username, PERIODS, CLUSTER_THRESHOLD_MINUTES);
  }
  console.log("\nProcessing complete for all users.");
}

main().catch(console.error);
