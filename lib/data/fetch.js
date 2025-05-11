import fs from "fs/promises";
import path from "path";
import { octokit } from "../api/github.js";
import { getTotalCommitCount } from "../api/queries.js";
import { createDateRange } from "../utils/date.js";

/**
 * Convert commit objects to compact array format
 * @param {Array} commits - Array of commit objects
 * @returns {Object} - Compact schema-based representation
 */
export function commitArrayFormat(commits) {
  const schema = [
    "repo",
    "sha",
    "date",
    "timestamp",
    "additions",
    "deletions",
    "private",
    "isFork",
    "isDocOnly",
  ];
  const data = commits.map((commit) => [
    commit.repo,
    commit.sha,
    commit.date,
    typeof commit.timestamp === "string"
      ? commit.timestamp
      : commit.timestamp.toISOString(),
    commit.additions,
    commit.deletions,
    commit.private,
    commit.isFork,
    commit.isDocOnly,
  ]);
  return { schema, data };
}

/**
 * Convert compact array format back to commit objects
 * @param {Object} arrayFormat - Compact schema-based representation
 * @returns {Array} - Array of commit objects
 */
export function arrayFormatToCommits(arrayFormat) {
  const { schema, data } = arrayFormat;
  return data.map((row) => {
    const commit = {};
    row.forEach((value, index) => {
      commit[schema[index]] = value;
    });
    if (commit.timestamp && typeof commit.timestamp === "string") {
      commit.timestamp = new Date(commit.timestamp);
    }
    return commit;
  });
}

/**
 * Fetch commits from repos for a specific time period
 * @param {Array} repos - Array of repository objects
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} - Array of commit objects
 */
export async function fetchCommitsFromRepos(
  repos,
  username,
  startDate,
  endDate
) {
  console.log(
    `Fetching commits from ${repos.length} repositories for period ${startDate} to ${endDate}`
  );
  const commitData = [];
  const commitSHAs = new Map();
  const sortedRepos = [...repos].sort((a, b) => {
    if (a.isFork && !b.isFork) return 1;
    if (!a.isFork && b.isFork) return -1;
    return 0;
  });
  const dateRange = createDateRange(startDate, endDate);
  let totalProcessed = 0;
  let accessDeniedRepos = [];
  let duplicateCommitCount = 0;
  let replacedCommitCount = 0;
  for (const repo of sortedRepos) {
    console.log(
      `[${++totalProcessed}/${repos.length}] Checking ${
        repo.full_name
      } for commits${repo.private ? " (private)" : ""}${
        repo.isFork ? " (fork)" : ""
      }...`
    );
    try {
      let commitsPage = 1;
      let hasMoreCommits = true;
      let repoCommitCount = 0;
      let repoSkippedCount = 0;
      while (hasMoreCommits) {
        const { data: pageCommits } = await octokit.repos.listCommits({
          owner: repo.owner.login,
          repo: repo.name,
          author: username,
          since: dateRange.sinceISOString,
          until: dateRange.untilISOString,
          per_page: 100,
          page: commitsPage,
        });
        for (const commit of pageCommits) {
          if (commitSHAs.has(commit.sha)) {
            const existingIndex = commitSHAs.get(commit.sha);
            const existingCommit = commitData[existingIndex];
            if (existingCommit.isFork && !repo.isFork) {
              console.log(
                `Replacing commit ${commit.sha.substring(0, 7)} from fork ${
                  existingCommit.repo
                } with original from ${repo.full_name}`
              );
              try {
                const { data: detailedCommit } = await octokit.repos.getCommit({
                  owner: repo.owner.login,
                  repo: repo.name,
                  ref: commit.sha,
                });
                const modifiedFiles = detailedCommit.files.map(
                  (file) => file.filename
                );
                const isDocOnly =
                  modifiedFiles.length > 0 &&
                  modifiedFiles.every((file) => isDocumentationFile(file));
                commitData[existingIndex] = {
                  repo: repo.full_name,
                  sha: commit.sha,
                  date: new Date(detailedCommit.commit.author.date)
                    .toISOString()
                    .split("T")[0],
                  timestamp: new Date(
                    detailedCommit.commit.author.date
                  ).toISOString(),
                  additions: detailedCommit.stats.additions || 0,
                  deletions: detailedCommit.stats.deletions || 0,
                  private: repo.private || false,
                  isFork: repo.isFork || false,
                  isDocOnly: isDocOnly,
                };
                replacedCommitCount++;
                repoCommitCount++;
              } catch (commitError) {
                console.error(
                  `Error fetching details for commit ${commit.sha}:`,
                  commitError.message
                );
              }
            } else {
              repoSkippedCount++;
              duplicateCommitCount++;
            }
            continue;
          }
          try {
            const { data: detailedCommit } = await octokit.repos.getCommit({
              owner: repo.owner.login,
              repo: repo.name,
              ref: commit.sha,
            });
            const modifiedFiles = detailedCommit.files.map(
              (file) => file.filename
            );
            const isDocOnly =
              modifiedFiles.length > 0 &&
              modifiedFiles.every((file) => isDocumentationFile(file));
            commitData.push({
              repo: repo.full_name,
              sha: commit.sha,
              date: new Date(detailedCommit.commit.author.date)
                .toISOString()
                .split("T")[0],
              timestamp: new Date(
                detailedCommit.commit.author.date
              ).toISOString(),
              additions: detailedCommit.stats.additions || 0,
              deletions: detailedCommit.stats.deletions || 0,
              private: repo.private || false,
              isFork: repo.isFork || false,
              isDocOnly: isDocOnly,
            });
            commitSHAs.set(commit.sha, commitData.length - 1);
            repoCommitCount++;
          } catch (commitError) {
            console.error(
              `Error fetching details for commit ${commit.sha}:`,
              commitError.message
            );
          }
        }
        hasMoreCommits = pageCommits.length === 100;
        commitsPage++;
        if (hasMoreCommits) {
          console.log(
            `Fetching page ${commitsPage} of commits for ${repo.full_name}...`
          );
        }
      }
      if (repoCommitCount > 0 || repoSkippedCount > 0) {
        console.log(
          `Found ${repoCommitCount} unique commits in ${repo.full_name}${
            repoSkippedCount > 0
              ? ` (skipped ${repoSkippedCount} duplicate commits)`
              : ""
          }`
        );
      }
    } catch (error) {
      console.error(
        `Error fetching commits from ${repo.full_name}:`,
        error.message
      );
      if (
        error.status === 403 ||
        error.status === 404 ||
        (error.response &&
          (error.response.status === 403 || error.response.status === 404))
      ) {
        accessDeniedRepos.push(repo.full_name);
      }
    }
  }
  if (accessDeniedRepos.length > 0) {
    console.log(
      `\n⚠️ WARNING: Could not access ${accessDeniedRepos.length} repositories:`
    );
    accessDeniedRepos.forEach((repo) => console.log(`- ${repo}`));
    console.log(
      `\nThese repositories may contain commits that are not included in the analysis.`
    );
    console.log(
      `To include them, you need the right permissions and a token with the 'repo' scope.`
    );
  }
  if (duplicateCommitCount > 0) {
    console.log(
      `\nFiltered out ${duplicateCommitCount} duplicate commits that appeared in multiple repositories.`
    );
  }
  if (replacedCommitCount > 0) {
    console.log(
      `\nReplaced ${replacedCommitCount} commits from forks with their original repository versions.`
    );
  }
  console.log(
    `Total unique commits found for period ${startDate} to ${endDate}: ${commitData.length}`
  );
  const expectedTotalCount = await getTotalCommitCount(
    username,
    startDate,
    endDate
  );
  if (expectedTotalCount && commitData.length < expectedTotalCount * 0.9) {
    const missingCount = expectedTotalCount - commitData.length;
    console.log(
      `\n⚠️ WARNING: Found ${commitData.length} commits, but GitHub reports approximately ${expectedTotalCount}`
    );
    console.log(
      `Approximately ${missingCount} commits (${(
        (missingCount / expectedTotalCount) *
        100
      ).toFixed(1)}%) may be missing from the analysis`
    );
    console.log(
      `This often happens when commits are in private repositories that your token cannot access`
    );
  }
  return commitData;
}

/**
 * Initialize output directories
 * @param {...string} dirs - Directories to create
 */
export async function initDirs(...dirs) {
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Fetch all commits for a specific time period
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {function} findReposWithCommitsInPeriod - Function to find repos with commits
 * @returns {Promise<Array>} - Array of commit objects
 */
export async function fetchCommitsForPeriod(
  username,
  startDate,
  endDate,
  findReposWithCommitsInPeriod
) {
  const periodRepos = await findReposWithCommitsInPeriod(
    username,
    startDate,
    endDate
  );
  return await fetchCommitsFromRepos(periodRepos, username, startDate, endDate);
}

/**
 * Load or fetch commits for a period
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} jsonPath - Path to JSON file for caching
 * @param {function} findReposWithCommitsInPeriod - Function to find repos with commits
 * @returns {Promise<Array>} - Array of commit objects
 */
export async function fetchCommits(
  username,
  startDate,
  endDate,
  jsonPath,
  findReposWithCommitsInPeriod
) {
  try {
    await fs.access(jsonPath);
    console.log(`Loading commits from ${jsonPath}`);
    const jsonData = await fs.readFile(jsonPath, "utf8");
    const arrayFormat = JSON.parse(jsonData);
    const commits = arrayFormatToCommits(arrayFormat);
    const cachedCommitCount = commits.length;
    const expectedTotalCount = await getTotalCommitCount(
      username,
      startDate,
      endDate
    );
    if (expectedTotalCount && cachedCommitCount < expectedTotalCount * 0.9) {
      console.log(
        `\n⚠️ WARNING: Cached data has ${cachedCommitCount} commits, but GitHub reports approximately ${expectedTotalCount}`
      );
      console.log(`Consider deleting the cache file to refresh data:
      rm "${jsonPath}"\n`);
    }
    const privateCommits = commits.filter((row) => row.private).length;
    const privatePercentage = (privateCommits / cachedCommitCount) * 100;
    console.log(
      `${privatePercentage.toFixed(
        1
      )}% of cached commits are from private repositories`
    );
    const uniqueSHAs = new Set(commits.map((row) => row.sha));
    if (uniqueSHAs.size < commits.length) {
      console.log(
        `\n⚠️ WARNING: Cache contains duplicate commits (${
          commits.length - uniqueSHAs.size
        } duplicates)`
      );
      console.log(`Consider deleting the cache file to apply duplicate filtering:
      rm "${jsonPath}"\n`);
    }
    return commits;
  } catch (error) {
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    const commitData = await fetchCommitsForPeriod(
      username,
      startDate,
      endDate,
      findReposWithCommitsInPeriod
    );
    if (commitData.length > 0) {
      const arrayFormat = commitArrayFormat(commitData);
      const json = JSON.stringify(arrayFormat);
      await fs.writeFile(jsonPath, json);
      console.log(`Saved ${commitData.length} commits to ${jsonPath}`);
      const privateCommits = commitData.filter(
        (commit) => commit.private
      ).length;
      const privatePercentage = (privateCommits / commitData.length) * 100;
      console.log(
        `${privatePercentage.toFixed(
          1
        )}% of commits are from private repositories`
      );
      const forkCommits = commitData.filter((commit) => commit.isFork).length;
      const forkPercentage = (forkCommits / commitData.length) * 100;
      console.log(
        `${forkPercentage.toFixed(1)}% of commits are from forked repositories`
      );
    } else {
      console.log(`No commits found for period ${startDate} to ${endDate}`);
    }
    return commitData;
  }
}

function isDocumentationFile(filePath) {
  return (
    filePath.endsWith(".md") ||
    filePath.endsWith(".markdown") ||
    filePath.endsWith(".txt") ||
    filePath.includes("/docs/") ||
    filePath.includes("/documentation/")
  );
}
