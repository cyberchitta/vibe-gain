import path from "path";
import fs from "fs/promises";
import { OUTPUT_DIR, DEFAULT_PARAMETERS_FILE, getUserDirs } from "./config.js";
import { testGitHubAPI } from "./api/github.js";
import { findReposWithCommitsInPeriod } from "./api/queries.js";
import { initDirs, fetchCommits } from "./data/fetch.js";
import {
  computeVizData,
  computeAggregateVizData,
} from "../core/data/viz-data.js";
import { exportVizDataJSON } from "./export/json.js";
import { initDiagnostics } from "./utils/diagnostics.js";

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

async function processUserPeriods(userConfig, periods, clusterThreshold) {
  const { username } = userConfig;
  console.log(
    `\n==== Processing data for user: ${username} (UTC${
      userConfig.timezone_offset_hours >= 0 ? "+" : ""
    }${userConfig.timezone_offset_hours}) ====`
  );
  const { outputDir, rawDir } = getUserDirs(username);
  await initDirs(outputDir, rawDir);
  await initDiagnostics(username, OUTPUT_DIR);
  const periodMetrics = {};
  const periodSummaries = {};
  const allCommits = [];
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
      findReposWithCommitsInPeriod,
      period.name
    );
    const { outputDir } = getUserDirs(username);
    const diagnosticsPath = path.join(
      outputDir,
      "diagnostics",
      `commit_retrieval_${period.name.replace(/ /g, "_")}.json`
    );
    let fetchStats = null;
    try {
      const diagnosticsData = await fs.readFile(diagnosticsPath, "utf8");
      fetchStats = JSON.parse(diagnosticsData);
    } catch (error) {
    }
    allCommits.push(...commits);
    const metrics = computeVizData(commits, userConfig, fetchStats);
    periodMetrics[period.name] = metrics;
    periodSummaries[period.name] = {
      summary: metrics.summary,
      metadata: {
        all: metrics.all.metadata,
        code: metrics.code.metadata,
        doc: metrics.doc.metadata,
      },
      period: {
        start: period.start,
        end: period.end,
      },
    };
    await exportVizDataJSON(metrics, period.name, outputDir);
    console.log(`  Total commits: ${metrics.summary.total_commits}`);
    console.log(`  Code commits: ${metrics.summary.code_commits}`);
    console.log(`  Doc commits: ${metrics.summary.doc_commits}`);
    console.log(
      `  Doc percentage: ${metrics.summary.doc_percentage.toFixed(1)}%`
    );
  }
  const aggregateMetrics = computeAggregateVizData(allCommits, userConfig);
  await exportVizDataJSON(
    {
      periods: periodSummaries,
      aggregate: {
        summary: aggregateMetrics.summary,
        repository_stats: aggregateMetrics.repository_stats,
      },
    },
    "aggregate",
    outputDir
  );
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
      "No GitHub users specified in parameters file. Please provide GITHUB_USERNAMES as an array of user objects."
    );
    return;
  }
  for (const user of GITHUB_USERNAMES) {
    if (!user.username || typeof user.timezone_offset_hours !== "number") {
      console.error(
        `Invalid user configuration: ${JSON.stringify(
          user
        )}. Each user must have 'username' and 'timezone_offset_hours'.`
      );
      return;
    }
    if (typeof user.coding_day_start_hour !== "number") {
      user.coding_day_start_hour = 4;
    }
  }
  await initDirs(OUTPUT_DIR);
  for (const userConfig of GITHUB_USERNAMES) {
    const { username } = userConfig;
    const { outputDir } = getUserDirs(username);
    const repoListsDir = path.join(outputDir, "repo_lists");
    await fs.mkdir(repoListsDir, { recursive: true });
    const apiWorking = await testGitHubAPI(username);
    if (!apiWorking) {
      console.error(
        `GitHub API test failed for ${username}. Please check your token and permissions.`
      );
      continue;
    }
    await processUserPeriods(userConfig, PERIODS, CLUSTER_THRESHOLD_MINUTES);
  }
  console.log("\nProcessing complete for all users.");
}

main().catch(console.error);
