import fs from "fs/promises";
import { inferCodingDayStart } from "../core/data/coding-day-inference.js";
import { createNodePeriodDataManager } from "../core/data/pdm-node.js";
import { OUTPUT_DIR, DEFAULT_PARAMETERS_FILE, getUserDirs } from "./config.js";

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

async function saveParameters(paramFile, params) {
  try {
    await fs.writeFile(paramFile, JSON.stringify(params, null, 2));
    console.log(`Parameters updated in ${paramFile}`);
  } catch (error) {
    console.error(`Error saving parameters to ${paramFile}: ${error.message}`);
    process.exit(1);
  }
}

async function loadAllCommitsForUser(username, periods) {
  const { outputDir, rawDir } = getUserDirs(username);
  const pdm = createNodePeriodDataManager(rawDir, { username });
  const allCommits = [];
  for (const period of periods) {
    const periodName = period.name;
    try {
      const exists = await pdm.periodExists(periodName);
      if (exists.commits && exists.metadata) {
        const { commits } = await pdm.loadPeriodData(periodName);
        allCommits.push(...commits);
        console.log(`  Loaded ${commits.length} commits from ${periodName}`);
      } else {
        console.log(`  Period ${periodName} not found or incomplete`);
      }
    } catch (error) {
      console.warn(`  Could not load period ${periodName}: ${error.message}`);
    }
  }
  return allCommits;
}

async function main() {
  const args = process.argv.slice(2);
  const parameterFile = args[0] || DEFAULT_PARAMETERS_FILE;
  const forceUpdate = args.includes("--force");
  console.log(`Loading parameters from: ${parameterFile}`);
  const params = await loadParameters(parameterFile);
  if (!params.GITHUB_USERNAMES || !Array.isArray(params.GITHUB_USERNAMES)) {
    console.error("No GITHUB_USERNAMES found in parameters");
    return;
  }
  if (!params.PERIODS || !Array.isArray(params.PERIODS)) {
    console.error("No PERIODS found in parameters");
    return;
  }
  let updated = false;
  for (const user of params.GITHUB_USERNAMES) {
    if (!user.username) continue;
    console.log(`\nProcessing ${user.username}...`);
    if (user.day_cutoff_utc !== undefined && !forceUpdate) {
      console.log(
        `  Already has day_cutoff_utc: ${user.day_cutoff_utc} (use --force to update)`
      );
      continue;
    }
    const commits = await loadAllCommitsForUser(user.username, params.PERIODS);
    if (commits.length === 0) {
      console.log(
        `  No commits found, skipping (cannot infer day_cutoff_utc without data)`
      );
      continue;
    }
    const inference = inferCodingDayStart(commits);
    console.log(`  Analyzed ${commits.length} total commits`);
    console.log(
      `  Inferred day_cutoff_utc: ${inference.day_cutoff} UTC`
    );
    console.log(`  Confidence: ${(inference.confidence * 100).toFixed(1)}%`);
    console.log(
      `  Activity valley: ${
        inference.histogram[inference.day_cutoff]
      } commits at this hour`
    );
    user.day_cutoff_utc = inference.day_cutoff;
    updated = true;
  }
  if (updated) {
    await saveParameters(parameterFile, params);
    console.log("\nDay cutoff hours (UTC) updated successfully!");
  } else {
    console.log(
      "\nNo updates made. Users either already have day_cutoff_utc set or have no commit data."
    );
  }
}

main().catch(console.error);
