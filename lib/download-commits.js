import path from "path";
import fs from "fs/promises";
import { OUTPUT_DIR, DEFAULT_PARAMETERS_FILE, getUserDirs } from "./config.js";
import { testGitHubAPI } from "./api/github.js";
import { initDirs, fetchCommits } from "./data/fetch.js";
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

async function processUserPeriods(userConfig, periods) {
  const { username } = userConfig;
  console.log(`\n==== Processing data for user: ${username} ====`);
  const { outputDir, rawDir } = getUserDirs(username);
  await initDirs(outputDir, rawDir);
  await initDiagnostics(username, OUTPUT_DIR);
  for (const period of periods) {
    console.log(`Processing ${period.name} for ${username}...`);
    const jsonPath = path.join(
      rawDir,
      `commits_${period.name.replace(/ /g, "_")}.json`
    );
    const { commits, repoMetadata } = await fetchCommits(
      username,
      period.start,
      period.end,
      jsonPath,
      period.name
    );
    const totalRepos = Object.keys(repoMetadata).length;
    const privateRepos = Object.values(repoMetadata).filter(
      (repo) => repo.private
    ).length;
    const forkRepos = Object.values(repoMetadata).filter(
      (repo) => repo.isFork
    ).length;
    console.log(`  Total commits: ${commits.length}`);
    console.log(`  Total repositories: ${totalRepos}`);
    console.log(`  Private repositories: ${privateRepos}`);
    console.log(`  Fork repositories: ${forkRepos}`);
  }
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
    if (!user.username) {
      console.error(
        `Invalid user configuration: ${JSON.stringify(
          user
        )}. Each user must have 'username'.`
      );
      return;
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
