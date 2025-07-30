import path from "path";
import fs from "fs/promises";
import { OUTPUT_DIR, DEFAULT_PARAMETERS_FILE, getUserDirs } from "./config.js";
import { testGitHubAPI } from "./api/github.js";
import { initDirs, fetchCommits } from "./data/fetch.js";
import { initDiagnostics } from "./utils/diagnostics.js";
import { MetricsBuilder } from "../core/data/metrics-builder.js";

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

async function processUserPeriods(userConfig, periods) {
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
  const codeOnlyFilter = (commit) => {
    const isWebsiteDocCommit =
      commit.isDocOnly &&
      commit.repo &&
      commit.repo.endsWith("/www.cyberchitta.cc");
    return !isWebsiteDocCommit;
  };
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
      period.name
    );
    allCommits.push(...commits);
    const builder = MetricsBuilder.forPeriod(
      commits,
      userConfig,
      period.start,
      period.end
    );
    const metrics = builder.withFilter(codeOnlyFilter).build();
    periodMetrics[period.name] = metrics;
    periodSummaries[period.name] = {
      summary: metrics.summary,
      period: {
        start: period.start,
        end: period.end,
      },
    };
    console.log(`  Total commits: ${metrics.summary.total_commits}`);
    console.log(`  Active days: ${metrics.summary.total_active_days}`);
    console.log(`  Total repositories: ${metrics.summary.total_repositories}`);
  }
  return periodMetrics;
}

async function main() {
  const args = process.argv.slice(2);
  const parameterFile = args[0] || DEFAULT_PARAMETERS_FILE;
  console.log(`Loading parameters from: ${parameterFile}`);
  const { PERIODS, GITHUB_USERNAMES } = await loadParameters(parameterFile);
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
    await processUserPeriods(userConfig, PERIODS);
  }
  console.log("\nProcessing complete for all users.");
}

main().catch(console.error);
