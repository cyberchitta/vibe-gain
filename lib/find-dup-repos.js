import fs from "fs/promises";
import { createNodePeriodDataManager } from "../core/data/pdm-node.js";
import { groupBy } from "../core/utils/array.js";
import { DEFAULT_PARAMETERS_FILE } from "../lib/config.js";

function createContentKey(commit) {
  return commit.timestamp;
}

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

async function findDuplicateReposForPeriod(username, period) {
  console.log(`\nAnalyzing ${username} - ${period.name}...`);
  const dataManager = createNodePeriodDataManager(`./data/${username}/raw`, {});
  try {
    const { commits } = await dataManager.loadPeriodData(period.name);
    const grouped = groupBy(commits, createContentKey);
    const duplicateRepoSets = new Set();
    Object.values(grouped).forEach((commitGroup) => {
      if (commitGroup.length > 1) {
        const repos = [...new Set(commitGroup.map((c) => c.repo))];
        if (repos.length > 1) {
          const sortedRepos = repos.sort().join(",");
          duplicateRepoSets.add(sortedRepos);
        }
      }
    });
    const uniqueRepoSets = Array.from(duplicateRepoSets).sort();
    const duplicateOutputPath = `./data/${username}/duplicate-repo-sets-${period.name.replace(
      /\s+/g,
      "_"
    )}.txt`;
    const dedupOutputPath = `./data/${username}/dedup-repo-sets-${period.name.replace(
      /\s+/g,
      "_"
    )}.txt`;
    if (uniqueRepoSets.length === 0) {
      console.log(`  No duplicates found`);
      try {
        await fs.unlink(duplicateOutputPath);
        console.log(`  Deleted old duplicate file: ${duplicateOutputPath}`);
      } catch (error) {
      }
      try {
        await fs.unlink(dedupOutputPath);
        console.log(`  Deleted old dedup file: ${dedupOutputPath}`);
      } catch (error) {
      }
      return [];
    }
    await fs.writeFile(duplicateOutputPath, uniqueRepoSets.join("\n") + "\n");
    console.log(`  Found ${uniqueRepoSets.length} unique duplicate repo sets`);
    console.log(`  Output: ${duplicateOutputPath}`);
    console.log(`  Preview:`);
    uniqueRepoSets.slice(0, 3).forEach((set) => console.log(`    ${set}`));
    if (uniqueRepoSets.length > 3) {
      console.log(`    ... and ${uniqueRepoSets.length - 3} more`);
    }
    try {
      await fs.access(dedupOutputPath);
      console.log(`  Dedup file already exists: ${dedupOutputPath}`);
    } catch (error) {
      await fs.writeFile(dedupOutputPath, "");
      console.log(`  Created empty dedup file: ${dedupOutputPath}`);
      console.log(`  Edit this file to set precedence order (first = keep, rest = remove)`);
    }
    return uniqueRepoSets;
  } catch (error) {
    console.log(`  No data found for ${period.name}: ${error.message}`);
    return [];
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
    console.error("No GitHub users specified in parameters file.");
    return;
  }
  if (!PERIODS || !Array.isArray(PERIODS) || PERIODS.length === 0) {
    console.error("No periods specified in parameters file.");
    return;
  }
  for (const userConfig of GITHUB_USERNAMES) {
    const { username } = userConfig;
    console.log(`\n==== Processing user: ${username} ====`);
    for (const period of PERIODS) {
      await findDuplicateReposForPeriod(username, period);
    }
  }
  console.log("\nDuplicate detection complete for all users!");
}

main().catch(console.error);
