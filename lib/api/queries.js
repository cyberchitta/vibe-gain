import fs from "fs/promises";
import path from "path";
import { octokit } from "./github.js";
import { getUserDirs } from "../config.js";
import { saveRepoDiscoveryDiagnostics } from "../utils/diagnostics.js";
import { withRetry } from "./retry.js";

/**
 * Query GitHub API for total commit count in time period, with recursive binary split on incomplete results
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<number|null>} - Total commit count or null if error
 */
async function getTotalCommitCount(username, startDate, endDate) {
  const since = new Date(startDate).toISOString().split("T")[0];
  const until = new Date(endDate).toISOString().split("T")[0];
  const q = `author:${username} committer-date:${since}..${until}`;
  try {
    const { data } = await withRetry(() =>
      octokit.search.commits({ q, per_page: 1 })
    );
    if (!data.incomplete_results) {
      return data.total_count;
    }
    console.warn(
      `Incomplete count for ${q}, splitting period ${since} to ${until}`
    );
    const startD = new Date(since);
    const endD = new Date(until);
    const days = Math.floor(
      (endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days <= 0) {
      console.warn(`Cannot split single day period, returning capped count`);
      return data.total_count;
    }
    const midDays = Math.floor(days / 2);
    const midD = new Date(startD);
    midD.setDate(midD.getDate() + midDays);
    const mid = midD.toISOString().split("T")[0];
    const leftCount = await getTotalCommitCount(username, since, mid);
    const rightD = new Date(midD);
    rightD.setDate(rightD.getDate() + 1);
    const rightStart = rightD.toISOString().split("T")[0];
    const rightCount = await getTotalCommitCount(username, rightStart, until);
    return (leftCount || 0) + (rightCount || 0);
  } catch (error) {
    console.error("Error getting total commit count:", error.message);
    return null;
  }
}

/**
 * Find repositories with commits in a specific time period using a period-specific list file
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} periodName - Name of the period being processed
 * @returns {Promise<Array>} - Array of repository objects
 */
async function findReposWithCommitsInPeriod(
  username,
  startDate,
  endDate,
  periodName = "unnamed"
) {
  console.log(
    `Finding repositories with commits in period ${periodName} (${startDate} to ${endDate})...`
  );
  const reposWithCommits = new Map();
  const diagnostics = {
    username,
    period: { startDate, endDate, name: periodName },
    totalRepos: 0,
    reposWithCommits: 0,
    timestamp: new Date().toISOString(),
  };
  const { outputDir } = getUserDirs(username);
  const repoListsDir = path.join(outputDir, "repo_lists");
  try {
    const safePeriodName = periodName.replace(/\s+/g, "-");
    const reposFilePath = path.join(
      repoListsDir,
      `repositories-${safePeriodName}.txt`
    );
    console.log(`Loading repositories from ${reposFilePath}`);
    const fileContent = await fs.readFile(reposFilePath, "utf8");
    const repoNames = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    console.log(
      `Loaded ${repoNames.length} repositories for period ${periodName}`
    );
    diagnostics.totalRepos = repoNames.length;
    for (const repoFullName of repoNames) {
      try {
        const [owner, repo] = repoFullName.split("/");
        try {
          const { data: repoInfo } = await withRetry(() =>
            octokit.repos.get({ owner, repo })
          );
          const { data: commits } = await withRetry(() =>
            octokit.repos.listCommits({
              owner,
              repo,
              author: username,
              since: new Date(`${startDate}T00:00:00Z`).toISOString(),
              until: new Date(`${endDate}T23:59:59Z`).toISOString(),
              per_page: 1,
            })
          );
          if (commits && commits.length > 0) {
            reposWithCommits.set(repoFullName, {
              full_name: repoFullName,
              owner: { login: owner },
              name: repo,
              private: repoInfo.private || false,
              isFork: repoInfo.fork || false,
              parent: repoInfo.parent ? repoInfo.parent.full_name : null,
              created_at: repoInfo.created_at,
            });
            diagnostics.reposWithCommits++;
            console.log(`Found commits in ${repoFullName} for this period`);
          } else {
            console.log(`No commits found in ${repoFullName} for this period`);
          }
        } catch (repoError) {
          console.error(
            `Error checking repository ${repoFullName}:`,
            repoError.message
          );
          reposWithCommits.set(repoFullName, {
            full_name: repoFullName,
            owner: { login: owner },
            name: repo,
            private: false,
            isFork: false,
            parent: null,
            created_at: null,
          });
          diagnostics.reposWithCommits++;
          console.log(
            `Added ${repoFullName} despite error: ${repoError.message}`
          );
        }
      } catch (error) {
        console.error(
          `Error processing repository ${repoFullName}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error(
      `Error loading repositories list for period ${periodName}:`,
      error.message
    );
    console.error(
      `Make sure you have created the repo_lists directory in ${outputDir}`
    );
    console.error(
      `and the file repositories-${periodName.replace(/\s+/g, "-")}.txt exists`
    );
    console.error("Format: one repository per line (owner/repo)");
  }
  if (typeof saveRepoDiscoveryDiagnostics === "function") {
    await saveRepoDiscoveryDiagnostics(diagnostics, periodName);
  }
  return Array.from(reposWithCommits.values());
}

export { findReposWithCommitsInPeriod, getTotalCommitCount };
