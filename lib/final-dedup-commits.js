import fs from "fs/promises";
import path from "path";
import { createNodePeriodDataManager } from "../core/data/pdm-node.js";
import { groupBy } from "../core/utils/array.js";
import { DEFAULT_PARAMETERS_FILE } from "../lib/config.js";

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

async function loadDedupRepoSets(username, period) {
  const dedupPath = `./data/${username}/dedup-repo-sets-${period.name.replace(
    /\s+/g,
    "_"
  )}.txt`;
  try {
    const content = await fs.readFile(dedupPath, "utf8");
    const repoSets = content
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.split(",").map((repo) => repo.trim()));
    console.log(
      `  Loaded ${repoSets.length} dedup repo sets from ${dedupPath}`
    );
    return repoSets;
  } catch (error) {
    console.log(`  No dedup file found at ${dedupPath}: ${error.message}`);
    return [];
  }
}

function createPrecedenceMap(repoSets) {
  const precedenceMap = new Map();
  repoSets.forEach((repoSet) => {
    repoSet.forEach((repo, index) => {
      precedenceMap.set(repo, index);
    });
  });
  return precedenceMap;
}

function selectHighestPrecedenceCommit(commitGroup, precedenceMap) {
  let bestCommit = commitGroup[0];
  let bestPrecedence = precedenceMap.get(bestCommit.repo) ?? Infinity;
  for (const commit of commitGroup) {
    const precedence = precedenceMap.get(commit.repo) ?? Infinity;
    if (precedence < bestPrecedence) {
      bestCommit = commit;
      bestPrecedence = precedence;
    }
  }
  return bestCommit;
}

async function hasBackupFiles(username, period) {
  const dataDir = `./data/${username}/raw`;
  const safePeriodName = period.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const backupFiles = [
    `${safePeriodName}_commits.json.bkp`,
    `${safePeriodName}_metadata.json.bkp`,
    `${safePeriodName}_fetchinfo.json.bkp`,
  ];
  for (const filename of backupFiles) {
    const backupPath = path.join(dataDir, filename);
    try {
      await fs.access(backupPath);
      return true;
    } catch (error) {}
  }
  return false;
}

async function backupFiles(username, period) {
  const dataDir = `./data/${username}/raw`;
  const safePeriodName = period.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const files = [
    `${safePeriodName}_commits.json`,
    `${safePeriodName}_metadata.json`,
    `${safePeriodName}_fetchinfo.json`,
  ];
  for (const filename of files) {
    const originalPath = path.join(dataDir, filename);
    const backupPath = path.join(dataDir, `${filename}.bkp`);
    try {
      await fs.copyFile(originalPath, backupPath);
      console.log(`  Backed up ${filename} to ${filename}.bkp`);
    } catch (error) {
      console.log(`  Warning: Could not backup ${filename}: ${error.message}`);
    }
  }
}

function filterRepoMetadata(originalMetadata, remainingRepos) {
  const filteredMetadata = {};
  for (const repo of remainingRepos) {
    if (originalMetadata[repo]) {
      filteredMetadata[repo] = originalMetadata[repo];
    }
  }
  return filteredMetadata;
}

async function dedupCommitsForPeriod(username, period, userConfig) {
  console.log(`\nProcessing ${username} - ${period.name}...`);
  if (await hasBackupFiles(username, period)) {
    console.log(`  Backup files already exist, skipping...`);
    return;
  }
  const repoSets = await loadDedupRepoSets(username, period);
  if (repoSets.length === 0) {
    console.log(`  No dedup rules found, skipping...`);
    return;
  }
  const dataManager = createNodePeriodDataManager(
    `./data/${username}/raw`,
    userConfig
  );
  try {
    const { commits, repoMetadata, fetchMetadata } =
      await dataManager.loadPeriodData(period.name);
    console.log(`  Loaded ${commits.length} commits`);
    const precedenceMap = createPrecedenceMap(repoSets);
    console.log(`  Created precedence map for ${precedenceMap.size} repos`);
    const commitsByTimestamp = groupBy(commits, (commit) => commit.timestamp);
    let duplicateGroups = 0;
    let removedCommits = 0;
    const dedupedCommits = [];
    for (const [timestamp, commitGroup] of Object.entries(commitsByTimestamp)) {
      if (commitGroup.length > 1) {
        const duplicateRepoCommits = commitGroup.filter((c) =>
          precedenceMap.has(c.repo)
        );
        const unrelatedCommits = commitGroup.filter(
          (c) => !precedenceMap.has(c.repo)
        );
        if (duplicateRepoCommits.length > 1) {
          if (unrelatedCommits.length > 0) {
            console.warn(
              `    WARNING: Timestamp ${timestamp} has ${duplicateRepoCommits.length} duplicate commits ` +
                `and ${unrelatedCommits.length} unrelated commits - this is unexpected!`
            );
            console.warn(
              `      Duplicate repos: ${duplicateRepoCommits
                .map((c) => c.repo)
                .join(", ")}`
            );
            console.warn(
              `      Unrelated repos: ${unrelatedCommits
                .map((c) => c.repo)
                .join(", ")}`
            );
          }
          const selectedCommit = selectHighestPrecedenceCommit(
            duplicateRepoCommits,
            precedenceMap
          );
          dedupedCommits.push(selectedCommit, ...unrelatedCommits);
          duplicateGroups++;
          removedCommits += duplicateRepoCommits.length - 1;
          const keptRepos = [
            selectedCommit.repo,
            ...unrelatedCommits.map((c) => c.repo),
          ].join(", ");
          const removedRepos = duplicateRepoCommits
            .filter((c) => c.repo !== selectedCommit.repo)
            .map((c) => c.repo)
            .join(", ");
          console.log(
            `    Timestamp ${timestamp}: kept [${keptRepos}], removed [${removedRepos}]`
          );
        } else {
          dedupedCommits.push(...commitGroup);
        }
      } else {
        dedupedCommits.push(commitGroup[0]);
      }
    }
    console.log(`  Found ${duplicateGroups} duplicate timestamp groups`);
    console.log(`  Removed ${removedCommits} duplicate commits`);
    console.log(`  Final commit count: ${dedupedCommits.length}`);
    if (removedCommits > 0) {
      await backupFiles(username, period);
      const remainingRepos = [...new Set(dedupedCommits.map((c) => c.repo))];
      const filteredMetadata = filterRepoMetadata(repoMetadata, remainingRepos);
      console.log(
        `  Filtered metadata: ${Object.keys(repoMetadata).length} -> ${
          Object.keys(filteredMetadata).length
        } repos`
      );
      await dataManager.savePeriodData(
        period.name,
        dedupedCommits,
        filteredMetadata,
        fetchMetadata
      );
      console.log(`  Saved deduplicated data`);
    } else {
      console.log(`  No changes needed`);
    }
  } catch (error) {
    console.error(`  Error processing ${period.name}: ${error.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const parameterFile = args[0] || DEFAULT_PARAMETERS_FILE;
  console.log(`Loading parameters from: ${parameterFile}`);
  const { PERIODS, GITHUB_USERNAMES } = await loadParameters(parameterFile);
  console.log(
    `Processing ${GITHUB_USERNAMES.length} users across ${PERIODS.length} periods`
  );
  for (const userConfig of GITHUB_USERNAMES) {
    const { username } = userConfig;
    console.log(`\n==== Processing user: ${username} ====`);
    for (const period of PERIODS) {
      await dedupCommitsForPeriod(username, period, userConfig);
    }
  }
  console.log("\nFinal deduplication complete for all users!");
}

main().catch(console.error);
