import { generateUserLlmReport } from "./gen-all-plots-llm.js";
import fs from "fs/promises";
import path from "path";

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadWebPublishConfig() {
  const configPath = path.join(process.cwd(), "data", "web-publish.json");
  if (!(await fileExists(configPath))) {
    return null;
  }
  const configText = await fs.readFile(configPath, "utf-8");
  return JSON.parse(configText);
}

async function generateAllUsersReports() {
  console.log("📊 Generating LLM reports for all users...\n");
  const parametersPath = path.join(process.cwd(), "data/parameters.json");
  const parametersContent = await fs.readFile(parametersPath, "utf8");
  const parameters = JSON.parse(parametersContent);
  const publishConfig = await loadWebPublishConfig();
  let usersToProcess = parameters.GITHUB_USERNAMES;
  if (publishConfig && publishConfig.usernames) {
    const usernameSet = new Set(publishConfig.usernames);
    usersToProcess = usersToProcess.filter((u) => usernameSet.has(u.username));
    console.log(`📋 Using web-publish.json (${usersToProcess.length} users)\n`);
  } else {
    console.log("📋 No web-publish.json found - processing all users\n");
  }
  const outputDir = path.join(process.cwd(), "llm-dist");
  await fs.mkdir(outputDir, { recursive: true });
  const results = {
    success: [],
    failed: [],
    skipped: [],
  };
  for (const userConfig of usersToProcess) {
    const username = userConfig.username;
    console.log(`\n📂 Processing user: ${username}`);
    const userOutputDir = path.join(outputDir, username);
    await fs.mkdir(userOutputDir, { recursive: true });
    const outputPath = path.join(userOutputDir, "all-plots-llm.md");
    try {
      const success = await generateUserLlmReport(
        username,
        userConfig,
        parameters.PERIODS,
        outputPath
      );
      if (success) {
        results.success.push(username);
      } else {
        results.skipped.push(username);
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
      results.failed.push(username);
    }
  }
  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary:");
  console.log(`  ✓ Success: ${results.success.length} users`);
  if (results.success.length > 0) {
    results.success.forEach((u) => console.log(`    - ${u}`));
  }
  if (results.skipped.length > 0) {
    console.log(`  ⚠ Skipped: ${results.skipped.length} users (no data)`);
    results.skipped.forEach((u) => console.log(`    - ${u}`));
  }
  if (results.failed.length > 0) {
    console.log(`  ❌ Failed: ${results.failed.length} users`);
    results.failed.forEach((u) => console.log(`    - ${u}`));
  }
  console.log(`\n📁 Output directory: ${outputDir}`);
  console.log("=".repeat(60));
}

generateAllUsersReports().catch(console.error);
