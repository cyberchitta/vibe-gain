import fs from "fs/promises";
import { inferCodingDayStart } from "../core/data/coding-day-inference.js";
import { createNodePeriodDataManager } from "../core/data/pdm-node.js";
import { DEFAULT_PARAMETERS_FILE, getUserDirs } from "./config.js";

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

async function loadCommitsForPeriod(username, period) {
  const { rawDir } = getUserDirs(username);
  const pdm = createNodePeriodDataManager(rawDir, { username });
  try {
    const exists = await pdm.periodExists(period.name);
    if (exists.commits && exists.metadata) {
      const { commits } = await pdm.loadPeriodData(period.name);
      return commits;
    }
  } catch (error) {
    console.warn(`  Could not load ${period.name}: ${error.message}`);
  }
  return [];
}

async function analyzeDayBoundariesForUser(username, periods, threshold) {
  console.log(`\nAnalyzing day boundaries for ${username}...`);
  const periodData = [];
  let allCommits = [];
  for (const period of periods) {
    const commits = await loadCommitsForPeriod(username, period);
    if (commits.length === 0) {
      console.log(`  ${period.name}: No commits, skipping`);
      continue;
    }
    const inference = inferCodingDayStart(commits);
    periodData.push({
      name: period.name,
      boundary: inference.day_boundary,
      confidence: inference.confidence,
      commitCount: commits.length,
    });
    allCommits.push(...commits);
    console.log(
      `  ${period.name}: boundary=${inference.day_boundary}, confidence=${(
        inference.confidence * 100
      ).toFixed(1)}%`
    );
  }
  if (periodData.length === 0) {
    return null;
  }
  const boundaries = periodData.map((p) => p.boundary);
  const minBoundary = Math.min(...boundaries);
  const maxBoundary = Math.max(...boundaries);
  const spread = maxBoundary - minBoundary;
  if (spread <= threshold) {
    console.log(
      `  Boundaries within ${threshold}h threshold (spread=${spread}h)`
    );
    console.log(
      `  Analyzing combined dataset (${allCommits.length} commits)...`
    );
    const combinedInference = inferCodingDayStart(allCommits);
    const commonBoundary = combinedInference.day_boundary;
    console.log(
      `  Combined analysis: boundary=${commonBoundary}, confidence=${(
        combinedInference.confidence * 100
      ).toFixed(1)}%`
    );
    const periodBoundaries = {};
    periodData.forEach((p) => {
      periodBoundaries[p.name] = commonBoundary;
    });
    return {
      day_boundary_utc: commonBoundary,
      period_day_boundaries: periodBoundaries,
      analysis: {
        spread,
        usedCombinedAnalysis: true,
        combinedConfidence: combinedInference.confidence,
        periodAnalyses: periodData,
      },
    };
  } else {
    console.log(
      `  ⚠️  TIMEZONE CHANGE DETECTED: ${spread}h spread exceeds ${threshold}h threshold`
    );
    console.log(`  Using per-period boundaries`);
    const periodBoundaries = {};
    periodData.forEach((p) => {
      periodBoundaries[p.name] = p.boundary;
    });
    const defaultBoundary = periodData[0].boundary;
    return {
      day_boundary_utc: defaultBoundary,
      period_day_boundaries: periodBoundaries,
      analysis: {
        spread,
        usedCombinedAnalysis: false,
        timezoneChangeDetected: true,
        periodAnalyses: periodData,
      },
    };
  }
}

function deriveTimezoneOffsets(periodBoundaries, localDayBoundary) {
  const offsets = {};
  for (const [periodName, utcBoundary] of Object.entries(periodBoundaries)) {
    offsets[periodName] = (utcBoundary - localDayBoundary + 24) % 24;
  }
  return offsets;
}

function shouldStorePeriodValues(values) {
  if (Object.keys(values).length === 0) return false;
  const firstValue = Object.values(values)[0];
  return !Object.values(values).every((v) => v === firstValue);
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
  const threshold = params.DAY_BOUNDARY_THRESHOLD_HOURS ?? 1;
  console.log(`Using day boundary threshold: ${threshold} hour(s)`);
  if (params.LOCAL_DAY_BOUNDARY !== undefined) {
    console.log(`Using LOCAL_DAY_BOUNDARY: ${params.LOCAL_DAY_BOUNDARY}`);
  }
  let updated = false;
  for (const user of params.GITHUB_USERNAMES) {
    if (!user.username) continue;
    console.log(`\nProcessing ${user.username}...`);
    if (user.period_day_boundaries && !forceUpdate) {
      console.log(
        `  Already has period_day_boundaries (use --force to update)`
      );
      continue;
    }
    const analysis = await analyzeDayBoundariesForUser(
      user.username,
      params.PERIODS,
      threshold
    );
    if (!analysis) {
      console.log(`  No commits found for ${user.username}, skipping`);
      continue;
    }
    user.day_boundary_utc = analysis.day_boundary_utc;
    if (shouldStorePeriodValues(analysis.period_day_boundaries)) {
      user.period_day_boundaries = analysis.period_day_boundaries;
      console.log(`  ✓ Stored period_day_boundaries (values differ)`);
    } else {
      delete user.period_day_boundaries;
      console.log(`  ✓ Using common day_boundary_utc (all periods identical)`);
    }
    if (params.LOCAL_DAY_BOUNDARY !== undefined) {
      const offsets = deriveTimezoneOffsets(
        analysis.period_day_boundaries,
        params.LOCAL_DAY_BOUNDARY
      );
      if (shouldStorePeriodValues(offsets)) {
        user.period_timezone_offsets = offsets;
        console.log(`  ✓ Stored period_timezone_offsets (values differ)`);
      } else {
        delete user.period_timezone_offsets;
        console.log(
          `  ✓ Using common timezone_offset_hours (all periods identical)`
        );
      }
    }
    if (!user._day_boundary_analysis) {
      user._day_boundary_analysis = analysis.analysis;
    }
    updated = true;
  }
  if (updated) {
    await saveParameters(parameterFile, params);
    console.log("\n✓ Day boundaries updated successfully!");
  } else {
    console.log("\nNo updates made.");
  }
}

main().catch(console.error);
