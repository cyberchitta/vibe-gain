import { octokit } from "./github.js";
import { createDateRange } from "../utils/date.js";
import { saveRepoDiscoveryDiagnostics } from '../utils/diagnostics.js';

/**
 * Query GitHub API for total commit count in time period
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<number|null>} - Total commit count or null if error
 */
async function getTotalCommitCount(username, startDate, endDate) {
  try {
    const since = new Date(startDate).toISOString().split("T")[0];
    const until = new Date(endDate).toISOString().split("T")[0];
    const { data } = await octokit.search.commits({
      q: `author:${username} committer-date:${since}..${until}`,
      per_page: 1,
    });
    return data.total_count;
  } catch (error) {
    console.error("Error getting total commit count:", error.message);
    return null;
  }
}

/**
 * Check if a repository is a fork
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} - Fork information
 */
async function checkIfRepoIsFork(owner, repo) {
  try {
    const { data: repoInfo } = await octokit.repos.get({ owner, repo });
    return {
      isFork: repoInfo.fork || false,
      parent: repoInfo.parent ? repoInfo.parent.full_name : null,
      source: repoInfo.source ? repoInfo.source.full_name : null,
    };
  } catch (error) {
    console.error(
      `Error checking if ${owner}/${repo} is a fork:`,
      error.message
    );
    return { isFork: false, parent: null, source: null };
  }
}

/**
 * Check events API for potentially missing commits
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Set<string>>} - Set of potentially missing repositories
 */
async function checkEventsForMissingCommits(username, startDate, endDate) {
  const potentialMissingRepos = new Set();
  try {
    const dateRange = createDateRange(startDate, endDate);
    const startMillis = dateRange.startDate.getTime();
    const endMillis = dateRange.endDate.getTime();
    const today = new Date().getTime();
    const ninetyDaysAgo = today - 90 * 24 * 60 * 60 * 1000;
    const periodStartMillis = Math.max(startMillis, ninetyDaysAgo);
    if (endMillis < ninetyDaysAgo) {
      console.log("Period is older than 90 days, skipping events API check");
      return potentialMissingRepos;
    }
    console.log("Checking events API for potential missing commits...");
    let isAuthenticatedUser = false;
    let authenticatedUsername = "";
    try {
      const { data: authUser } = await octokit.rest.users.getAuthenticated();
      authenticatedUsername = authUser.login;
      isAuthenticatedUser = authenticatedUsername === username;
      console.log(
        `Username ${username} ${
          isAuthenticatedUser ? "matches" : "does not match"
        } authenticated user (${authenticatedUsername}).`
      );
    } catch (error) {
      console.log(
        "Could not determine authenticated user, assuming different user."
      );
    }
    console.log(`Checking events for user: ${username}...`);
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      try {
        const { data: events } = await octokit.request(
          "GET /users/{username}/events",
          {
            username: username,
            per_page: 100,
            page: page,
          }
        );
        if (events.length === 0) {
          hasMore = false;
          continue;
        }
        for (const event of events) {
          const eventTime = new Date(event.created_at).getTime();
          if (eventTime >= startMillis && eventTime <= endMillis) {
            if (event.type === "PushEvent") {
              if (event.repo && event.repo.name) {
                potentialMissingRepos.add(event.repo.name);
              }
            }
          } else if (eventTime < startMillis) {
            hasMore = false;
            break;
          }
        }
        page++;
        if (page > 10) hasMore = false;
      } catch (error) {
        console.error(
          `Error checking events API (page ${page}):`,
          error.message
        );
        if (error.status === 404 || error.status === 403) {
          console.log("Falling back to public events only...");
          try {
            const { data: publicEvents } = await octokit.request(
              "GET /users/{username}/events/public",
              {
                username: username,
                per_page: 100,
                page: page,
              }
            );
            if (publicEvents.length === 0) {
              hasMore = false;
              continue;
            }
            for (const event of publicEvents) {
              const eventTime = new Date(event.created_at).getTime();
              if (eventTime >= startMillis && eventTime <= endMillis) {
                if (event.type === "PushEvent") {
                  if (event.repo && event.repo.name) {
                    potentialMissingRepos.add(event.repo.name);
                  }
                }
              } else if (eventTime < startMillis) {
                hasMore = false;
                break;
              }
            }
            page++;
            if (page > 10) hasMore = false;
          } catch (publicError) {
            console.error(
              `Error checking public events API (page ${page}):`,
              publicError.message
            );
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
    }
    if (potentialMissingRepos.size > 0) {
      console.log(
        `Found ${potentialMissingRepos.size} potentially missing repositories from events API.`
      );
    } else {
      console.log("No additional repositories found from events API.");
    }
  } catch (error) {
    console.error("Error in events API check:", error.message);
    console.log(
      "Continuing without events API data - some repositories might be missing."
    );
  }
  return potentialMissingRepos;
}

/**
 * Find repositories with commits in a specific time period
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} periodName - Name of the period being processed
 * @returns {Promise<Array>} - Array of repository objects
 */
async function findReposWithCommitsInPeriod(username, startDate, endDate, periodName = 'unnamed') {
  const diagnostics = {
    username,
    period: { startDate, endDate, name: periodName },
    expectedTotalCommits: 0,
    searchResults: [],
    potentialMissingRepos: [],
    forksRemoved: [],
    accessDeniedRepos: [],
    finalRepoCount: 0,
    timestamp: new Date().toISOString()
  };
  console.log(`Finding repositories with commits in period ${startDate} to ${endDate}...`);
  const reposWithCommits = new Map();
  const originalRepoInfo = new Map();
  try {
    const dateRange = createDateRange(startDate, endDate);
    const expectedTotalCount = await getTotalCommitCount(username, startDate, endDate);
    diagnostics.expectedTotalCommits = expectedTotalCount || 0;
    console.log(`GitHub reports approximately ${expectedTotalCount} total commits in this period`);
    let page = 1;
    let hasMoreResults = true;
    while (hasMoreResults) {
      try {
        const { data } = await octokit.search.commits({
          q: `author:${username} committer-date:${dateRange.sinceQueryDate}..${dateRange.untilQueryDate}`,
          per_page: 100,
          page: page,
          sort: "committer-date",
          order: "desc",
        });
        const pageRepos = [];
        if (data.items && data.items.length > 0) {
          console.log(
            `Found ${data.items.length} commits in search results (page ${page})`
          );
          for (const item of data.items) {
            if (item.repository) {
              const repoFullName = item.repository.full_name;
              pageRepos.push(repoFullName);
              if (!reposWithCommits.has(repoFullName)) {
                const [owner, repo] = repoFullName.split("/");
                const forkInfo = await checkIfRepoIsFork(owner, repo);
                reposWithCommits.set(repoFullName, {
                  full_name: repoFullName,
                  owner: { login: owner },
                  name: repo,
                  private: item.repository.private || false,
                  isFork: forkInfo.isFork,
                  parent: forkInfo.parent,
                  source: forkInfo.source,
                });
                if (forkInfo.isFork) {
                  console.log(
                    `Repository ${repoFullName} is a fork of ${
                      forkInfo.parent || forkInfo.source || "unknown"
                    }`
                  );
                  if (forkInfo.parent) {
                    originalRepoInfo.set(repoFullName, forkInfo.parent);
                  } else if (forkInfo.source) {
                    originalRepoInfo.set(repoFullName, forkInfo.source);
                  }
                }
              }
            }
          }
        }
        diagnostics.searchResults.push({
          page,
          itemCount: data.items ? data.items.length : 0,
          repos: pageRepos
        });
        hasMoreResults = data.items && data.items.length === 100;
        page++;
      } catch (error) {
        console.error(`Error in search API (page ${page}):`, error.message);
        diagnostics.errors = diagnostics.errors || [];
        diagnostics.errors.push({
          phase: 'search',
          page,
          message: error.message,
          status: error.status
        });
        hasMoreResults = false;
      }
    }
    console.log(
      `Found ${reposWithCommits.size} repositories with commits in this period`
    );
    const potentialMissingRepos = await checkEventsForMissingCommits(
      username,
      startDate,
      endDate
    );
    diagnostics.potentialMissingRepos = Array.from(potentialMissingRepos);
    let missingCount = 0;
    for (const repoName of potentialMissingRepos) {
      if (!reposWithCommits.has(repoName)) {
        missingCount++;
        console.log(`⚠️ Potentially missing commits from: ${repoName}`);
        try {
          const [owner, repo] = repoName.split("/");
          const { data: repoInfo } = await octokit.repos.get({
            owner,
            repo,
          });
          const forkInfo = await checkIfRepoIsFork(owner, repo);
          reposWithCommits.set(repoName, {
            full_name: repoName,
            owner: { login: owner },
            name: repo,
            private: repoInfo.private || true,
            isFork: forkInfo.isFork,
            parent: forkInfo.parent,
            source: forkInfo.source,
          });
          if (forkInfo.isFork) {
            console.log(
              `Repository ${repoName} is a fork of ${
                forkInfo.parent || forkInfo.source || "unknown"
              }`
            );
            if (forkInfo.parent) {
              originalRepoInfo.set(repoName, forkInfo.parent);
            } else if (forkInfo.source) {
              originalRepoInfo.set(repoName, forkInfo.source);
            }
          }
          console.log(`Added ${repoName} to repository list`);
        } catch (error) {
          console.error(
            `Cannot access repository ${repoName}: ${error.message}`
          );
          diagnostics.accessDeniedRepos.push(repoName);
        }
      }
    }
    if (missingCount > 0) {
      console.log(
        `⚠️ Found ${missingCount} potentially missing repositories with commits`
      );
    }
    const forksToRemove = [];
    for (const [repoName, repoInfo] of reposWithCommits.entries()) {
      if (repoInfo.isFork) {
        const parent = originalRepoInfo.get(repoName);
        if (parent && reposWithCommits.has(parent)) {
          forksToRemove.push(repoName);
          console.log(
            `Filtering out fork ${repoName} as original repo ${parent} is also available`
          );
        }
      }
    }
    diagnostics.forksRemoved = forksToRemove;
    forksToRemove.forEach((repo) => reposWithCommits.delete(repo));
    if (forksToRemove.length > 0) {
      console.log(
        `Removed ${forksToRemove.length} fork repositories to avoid duplicate commits`
      );
      console.log(`Remaining repositories: ${reposWithCommits.size}`);
    }
    diagnostics.finalRepoCount = reposWithCommits.size;
  } catch (error) {
    console.error("Error finding repositories with commits:", error.message);
    diagnostics.errors = diagnostics.errors || [];
    diagnostics.errors.push({
      phase: 'main',
      message: error.message
    });
  }
  await saveRepoDiscoveryDiagnostics(diagnostics, periodName);
  return Array.from(reposWithCommits.values());
}

export {
  getTotalCommitCount,
  checkIfRepoIsFork,
  checkEventsForMissingCommits,
  findReposWithCommitsInPeriod,
};
