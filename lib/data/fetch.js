import fs from "fs/promises";
import path from "path";
import { createDateRange } from "../../core/utils/date.js";
import {
  arrayFormatToCommits,
  commitArrayFormat,
} from "../../core/data/formats.js";
import { octokit } from "../api/github.js";
import { getTotalCommitCount } from "../api/queries.js";
import {
  saveCommitRetrievalDiagnostics,
  saveAccessErrorDiagnostics,
} from "../utils/diagnostics.js";

/**
 * Create a standardized commit object from GitHub API data
 * @param {Object} detailedCommit - Detailed commit data from GitHub API
 * @param {Object} repo - Repository object
 * @param {boolean} isDocOnly - Whether commit only touches documentation
 * @returns {Object} - Standardized commit object
 */
function createCommitObject(detailedCommit, repo, isDocOnly) {
  return {
    repo: repo.full_name,
    sha: detailedCommit.sha,
    timestamp: new Date(detailedCommit.commit.author.date).toISOString(),
    additions: detailedCommit.stats.additions || 0,
    deletions: detailedCommit.stats.deletions || 0,
    filesChanged: detailedCommit.files ? detailedCommit.files.length : 0,
    private: repo.private || false,
    isFork: repo.isFork || false,
    isDocOnly: isDocOnly,
  };
}

/**
 * Fetch commits from repos for a specific time period
 * @param {Array} repos - Array of repository objects
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} periodName - Name of the period being processed
 * @returns {Promise<Array>} - Array of commit objects
 */
export async function fetchCommitsFromRepos(
  repos,
  username,
  startDate,
  endDate,
  periodName = "unnamed"
) {
  console.log(
    `Fetching commits from ${repos.length} repositories for period ${startDate} to ${endDate}`
  );
  const stats = {
    periodName,
    username,
    period: { startDate, endDate },
    totalRepos: repos.length,
    reposProcessed: 0,
    reposWithCommits: 0,
    reposWithAccessErrors: 0,
    totalCommitsFound: 0,
    commitsDeduplicated: 0,
    commitsFromPrivateRepos: 0,
    commitsFromForks: 0,
    repoStats: [],
    timestamp: new Date().toISOString(),
  };
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
    const repoStat = {
      name: repo.full_name,
      isPrivate: repo.private || false,
      isFork: repo.isFork || false,
      commitsFound: 0,
      commitsDuplicated: 0,
      commitsReplaced: 0,
      accessError: false,
      pagesProcessed: 0,
    };
    try {
      let commitsPage = 1;
      let hasMoreCommits = true;
      let repoCommitCount = 0;
      let repoSkippedCount = 0;
      let repoReplacedCount = 0;
      while (hasMoreCommits) {
        repoStat.pagesProcessed++;
        try {
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
                  const { data: detailedCommit } =
                    await octokit.repos.getCommit({
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
                  commitData[existingIndex] = createCommitObject(detailedCommit, repo, isDocOnly);
                  replacedCommitCount++;
                  repoReplacedCount++;
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
              commitData.push(createCommitObject(detailedCommit, repo, isDocOnly));
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
        } catch (pageError) {
          console.error(
            `Error fetching page ${commitsPage} of commits for ${repo.full_name}:`,
            pageError.message
          );
          hasMoreCommits = false;
        }
      }
      repoStat.commitsFound = repoCommitCount;
      repoStat.commitsDuplicated = repoSkippedCount;
      repoStat.commitsReplaced = repoReplacedCount;
      if (repoCommitCount > 0) {
        stats.reposWithCommits++;
        stats.totalCommitsFound += repoCommitCount;
        if (repo.private) {
          stats.commitsFromPrivateRepos += repoCommitCount;
        }
        if (repo.isFork) {
          stats.commitsFromForks += repoCommitCount;
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
      repoStat.accessError = true;
      repoStat.errorMessage = error.message;
      repoStat.errorStatus =
        error.status || (error.response && error.response.status);
      if (
        error.status === 403 ||
        error.status === 404 ||
        (error.response &&
          (error.response.status === 403 || error.response.status === 404))
      ) {
        accessDeniedRepos.push({
          ...repo,
          errorStatus:
            error.status || (error.response && error.response.status),
          errorMessage: error.message,
        });
        stats.reposWithAccessErrors++;
      }
    }
    stats.repoStats.push(repoStat);
    stats.reposProcessed++;
  }
  stats.commitsDeduplicated = duplicateCommitCount;
  stats.commitsReplaced = replacedCommitCount;
  if (accessDeniedRepos.length > 0) {
    console.log(
      `\n⚠️ WARNING: Could not access ${accessDeniedRepos.length} repositories:`
    );
    accessDeniedRepos.forEach((repo) => console.log(`- ${repo.full_name}`));
    console.log(
      `\nThese repositories may contain commits that are not included in the analysis.`
    );
    console.log(
      `To include them, you need the right permissions and a token with the 'repo' scope.`
    );
    await saveAccessErrorDiagnostics(accessDeniedRepos, periodName);
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
    stats.expectedTotalCount = expectedTotalCount;
    stats.missingCommits = missingCount;
    stats.missingPercentage = (missingCount / expectedTotalCount) * 100;
  }
  await saveCommitRetrievalDiagnostics(stats, periodName);
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
 * @param {string} periodName - Name of the period
 * @param {function} findReposWithCommitsInPeriod - Function to find repos with commits
 * @returns {Promise<Array>} - Array of commit objects
 */
export async function fetchCommitsForPeriod(
  username,
  startDate,
  endDate,
  periodName,
  findReposWithCommitsInPeriod
) {
  const periodRepos = await findReposWithCommitsInPeriod(
    username,
    startDate,
    endDate,
    periodName
  );
  return await fetchCommitsFromRepos(
    periodRepos,
    username,
    startDate,
    endDate,
    periodName
  );
}

/**
 * Load or fetch commits for a period
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} jsonPath - Path to JSON file for caching
 * @param {function} findReposWithCommitsInPeriod - Function to find repos with commits
 * @param {string} periodName - Name of the period
 * @returns {Promise<Array>} - Array of commit objects
 */
export async function fetchCommits(
  username,
  startDate,
  endDate,
  jsonPath,
  findReposWithCommitsInPeriod,
  periodName = "unnamed"
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
    const cacheStats = {
      periodName,
      username,
      period: { startDate, endDate },
      source: "cache",
      cachedCommitCount,
      expectedTotalCount,
      privateCommits: commits.filter((row) => row.private).length,
      forkCommits: commits.filter((row) => row.isFork).length,
      uniqueSHAs: new Set(commits.map((row) => row.sha)).size,
      timestamp: new Date().toISOString(),
    };
    cacheStats.privatePercentage =
      (cacheStats.privateCommits / cachedCommitCount) * 100;
    cacheStats.forkPercentage =
      (cacheStats.forkCommits / cachedCommitCount) * 100;
    cacheStats.duplicateCommits = cachedCommitCount - cacheStats.uniqueSHAs;
    if (expectedTotalCount && cachedCommitCount < expectedTotalCount * 0.9) {
      console.log(
        `\n⚠️ WARNING: Cached data has ${cachedCommitCount} commits, but GitHub reports approximately ${expectedTotalCount}`
      );
      console.log(`Consider deleting the cache file to refresh data:
      rm "${jsonPath}"\n`);
      cacheStats.missingCommits = expectedTotalCount - cachedCommitCount;
      cacheStats.missingPercentage =
        (cacheStats.missingCommits / expectedTotalCount) * 100;
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
    await saveCommitRetrievalDiagnostics(cacheStats, `${periodName}_cache`);
    return commits;
  } catch (error) {
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    const commitData = await fetchCommitsForPeriod(
      username,
      startDate,
      endDate,
      periodName,
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
