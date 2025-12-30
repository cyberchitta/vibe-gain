import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadWebPublishConfig() {
  const configPath = join(projectRoot, "data", "web-publish.json");
  if (!(await fileExists(configPath))) {
    return null;
  }
  const configText = await readFile(configPath, "utf-8");
  return JSON.parse(configText);
}

function shouldIncludePeriodBoundaries(user) {
  if (!user.period_day_boundaries) return false;
  const dayBoundaryUtc = user.day_boundary_utc;
  return Object.values(user.period_day_boundaries).some(
    (boundary) => boundary !== dayBoundaryUtc
  );
}

function cleanUserConfig(user) {
  const cleaned = {
    username: user.username,
    day_boundary_utc: user.day_boundary_utc,
  };
  if (user.timezone_offset_hours !== undefined) {
    cleaned.timezone_offset_hours = user.timezone_offset_hours;
  }
  if (user.day_boundary !== undefined) {
    cleaned.day_boundary = user.day_boundary;
  }
  if (shouldIncludePeriodBoundaries(user)) {
    cleaned.period_day_boundaries = user.period_day_boundaries;
  }
  return cleaned;
}

async function cleanParametersForWeb(parameters, publishConfig) {
  let users = parameters.GITHUB_USERNAMES;
  if (publishConfig && publishConfig.usernames) {
    const usernameSet = new Set(publishConfig.usernames);
    users = users.filter((user) => usernameSet.has(user.username));
  }
  return {
    PERIODS: parameters.PERIODS,
    GITHUB_USERNAMES: users
      .map(cleanUserConfig)
      .sort((a, b) => a.username.localeCompare(b.username)),
  };
}

async function packageForWeb() {
  console.log("📦 Packaging data for web publication...\n");
  const dataDir = join(projectRoot, "data");
  const outputDir = join(projectRoot, "web-dist");
  const publishConfig = await loadWebPublishConfig();
  if (publishConfig) {
    console.log(
      `📋 Using web-publish.json (${publishConfig.usernames.length} users)\n`
    );
  } else {
    console.log("📋 No web-publish.json found - packaging all users\n");
  }
  const parametersPath = join(dataDir, "parameters.json");
  const parametersText = await readFile(parametersPath, "utf-8");
  const parameters = JSON.parse(parametersText);
  await ensureDir(outputDir);
  const cleanedParameters = await cleanParametersForWeb(
    parameters,
    publishConfig
  );
  const outputParametersPath = join(outputDir, "parameters.json");
  await writeFile(
    outputParametersPath,
    JSON.stringify(cleanedParameters, null, 2)
  );
  console.log(
    `✓ Copied parameters.json (cleaned, ${cleanedParameters.GITHUB_USERNAMES.length} users)`
  );
  for (const userConfig of cleanedParameters.GITHUB_USERNAMES) {
    const username = userConfig.username;
    console.log(`\n📂 Processing user: ${username}`);
    const userOutputDir = join(outputDir, username, "raw");
    await ensureDir(userOutputDir);
    for (const period of parameters.PERIODS) {
      const safePeriodName = period.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");
      const commitFile = `${safePeriodName}_commits.json`;
      const sourcePath = join(dataDir, username, "raw", commitFile);
      const destPath = join(userOutputDir, commitFile);
      try {
        const sourceData = await readFile(sourcePath, "utf-8");
        const arrayFormat = JSON.parse(sourceData);
        if (!arrayFormat.schema || !arrayFormat.data) {
          console.log(
            `  ⚠ ${commitFile} has invalid format - skipping validation`
          );
          await copyFile(sourcePath, destPath);
          console.log(`  ✓ ${commitFile} (copied without validation)`);
          continue;
        }
        const periodStartDate = new Date(period.start);
        const periodEndDate = new Date(period.end);
        const fetchStartDate = new Date(periodStartDate);
        fetchStartDate.setDate(fetchStartDate.getDate() - 1);
        const fetchEndDate = new Date(periodEndDate);
        fetchEndDate.setDate(fetchEndDate.getDate() + 1);
        const minAllowedTimestamp = fetchStartDate.getTime();
        const maxAllowedTimestamp = fetchEndDate.getTime();
        const timestampIndex = arrayFormat.schema.indexOf("timestamp");
        if (timestampIndex === -1) {
          console.log(
            `  ⚠ ${commitFile} missing timestamp in schema - skipping validation`
          );
          await copyFile(sourcePath, destPath);
          console.log(`  ✓ ${commitFile} (copied without validation)`);
          continue;
        }
        const originalCommitCount = arrayFormat.data.length;
        const validCommits = arrayFormat.data.filter((row) => {
          const timestamp = row[timestampIndex];
          const commitTimestamp = new Date(timestamp).getTime();
          return (
            commitTimestamp >= minAllowedTimestamp &&
            commitTimestamp <= maxAllowedTimestamp
          );
        });
        const filteredCount = originalCommitCount - validCommits.length;
        if (filteredCount > 0) {
          const invalidCommits = arrayFormat.data.filter((row) => {
            const timestamp = row[timestampIndex];
            const commitTimestamp = new Date(timestamp).getTime();
            return (
              commitTimestamp < minAllowedTimestamp ||
              commitTimestamp > maxAllowedTimestamp
            );
          });
          const sortedInvalid = invalidCommits.sort(
            (a, b) =>
              new Date(a[timestampIndex]).getTime() -
              new Date(b[timestampIndex]).getTime()
          );
          console.log(
            `  ⚠ ${commitFile}: Filtered ${filteredCount} commits outside range`
          );
          console.log(
            `    Expected: ${fetchStartDate.toISOString().split("T")[0]} to ${
              fetchEndDate.toISOString().split("T")[0]
            }`
          );
          console.log(
            `    Invalid span: ${
              new Date(sortedInvalid[0][timestampIndex])
                .toISOString()
                .split("T")[0]
            } to ${
              new Date(sortedInvalid[sortedInvalid.length - 1][timestampIndex])
                .toISOString()
                .split("T")[0]
            }`
          );
        }
        const cleanedData = {
          schema: arrayFormat.schema,
          data: validCommits,
        };
        await writeFile(destPath, JSON.stringify(cleanedData));
        console.log(
          `  ✓ ${commitFile} (${validCommits.length} commits${
            filteredCount > 0 ? `, filtered ${filteredCount}` : ""
          })`
        );
      } catch (error) {
        if (error.code === "ENOENT") {
          console.log(`  ⚠ ${commitFile} not found - skipping`);
        } else {
          throw error;
        }
      }
    }
  }
  console.log("\n✅ Packaging complete!");
  console.log(`📁 Output directory: ${outputDir}`);
}

packageForWeb().catch((error) => {
  console.error("\n❌ Packaging failed:", error.message);
  process.exit(1);
});
