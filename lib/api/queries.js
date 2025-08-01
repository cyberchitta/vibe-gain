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

/**
 * Get user activity repositories via GraphQL
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} - Array of repository names
 */
export async function getUserActivityRepositories(
  username,
  startDate,
  endDate
) {
  const activityQuery = `
    query {
      user(login: "${username}") {
        contributionsCollection(from: "${startDate}T00:00:00Z", to: "${endDate}T23:59:59Z") {
          commitContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
          issueContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
          pullRequestContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
          pullRequestReviewContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
        }
      }
    }
  `;
  const activityResult = await withRetry(() => graphqlWithAuth(activityQuery));
  const repos = [];
  if (activityResult?.user?.contributionsCollection) {
    const contributions = activityResult.user.contributionsCollection;
    [
      "commitContributionsByRepository",
      "issueContributionsByRepository",
      "pullRequestContributionsByRepository",
      "pullRequestReviewContributionsByRepository",
    ].forEach((contributionType) => {
      if (contributions[contributionType]) {
        const contributionRepos = contributions[contributionType]
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        repos.push(...contributionRepos);
      }
    });
  }
  return repos;
}

/**
 * Get user event repositories for authenticated user
 * @param {string} username - GitHub username
 * @returns {Promise<Array>} - Array of repository names
 */
export async function getUserEventRepositories(username) {
  const eventRepos = new Set();
  let page = 1;
  let hasMoreEvents = true;
  while (hasMoreEvents) {
    const { data: events } = await withRetry(() =>
      octokit.activity.listEventsForAuthenticatedUser({
        username,
        per_page: 100,
        page,
      })
    );
    if (events.length === 0) {
      break;
    }
    for (const event of events) {
      if (event.repo && event.repo.name) {
        eventRepos.add(event.repo.name);
      }
    }
    hasMoreEvents = events.length === 100;
    page++;
  }
  return Array.from(eventRepos);
}

/**
 * Get user repositories with specific affiliation
 * @param {string} affiliation - Repository affiliation (owner, collaborator, organization_member)
 * @param {number} maxPages - Maximum pages to fetch
 * @returns {Promise<Array>} - Array of repository objects
 */
export async function getUserRepositories(affiliation, maxPages = 5) {
  const repos = [];
  let page = 1;
  let hasMoreRepos = true;
  while (hasMoreRepos && page <= maxPages) {
    const { data: pageRepos } = await withRetry(() =>
      octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        page,
        sort: "pushed",
        direction: "desc",
        affiliation,
        visibility: "all",
      })
    );
    repos.push(...pageRepos);
    hasMoreRepos = pageRepos.length === 100;
    page++;
  }
  return repos;
}

/**
 * Get repositories for an organization
 * @param {string} orgLogin - Organization login
 * @param {string} visibility - Repository visibility (public, private, all)
 * @returns {Promise<Array>} - Array of repository objects
 */
export async function getOrganizationRepositories(
  orgLogin,
  visibility = "all"
) {
  const { data: orgRepos } = await withRetry(() =>
    octokit.repos.listForOrg({
      org: orgLogin,
      type: "all",
      sort: "pushed",
      per_page: 100,
      visibility,
    })
  );
  return orgRepos;
}

/**
 * Get user's organizations
 * @returns {Promise<Array>} - Array of organization objects
 */
export async function getUserOrganizations() {
  const { data: orgs } = await withRetry(() =>
    octokit.orgs.listForAuthenticatedUser()
  );
  return orgs;
}

/**
 * Check if given username is the authenticated user
 * @param {string} username - GitHub username to check
 * @returns {Promise<boolean>} - True if authenticated user
 */
export async function isAuthenticatedUser(username) {
  try {
    const { data } = await withRetry(() => octokit.users.getAuthenticated());
    return data.login === username;
  } catch (error) {
    console.error("Error checking authenticated user:", error.message);
    return false;
  }
}

/**
 * Search for repositories with commits in a date range using sequential peeling
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} baseQuery - Base search query without date range
 * @returns {Promise<Set<string>>} - Set of repository full names
 */
export async function searchRepositoriesInPeriod(
  username,
  startDate,
  endDate,
  baseQuery
) {
  const repos = new Set();
  let currentStart = startDate;
  while (new Date(currentStart) <= new Date(endDate)) {
    const q = `${baseQuery} committer-date:${currentStart}..${endDate}`;
    console.log(`Executing search query: ${q}`);
    let allItems = [];
    let page = 1;
    let incomplete = false;
    try {
      while (true) {
        const res = await withRetry(() =>
          octokit.search.commits({
            q,
            per_page: 100,
            page,
            sort: "committer-date",
            order: "asc",
          })
        );
        allItems.push(...res.data.items);
        incomplete = incomplete || res.data.incomplete_results;

        if (res.data.items.length < 100) break;
        page++;
      }
    } catch (error) {
      if (
        error.status === 422 &&
        error.message.includes(
          "Only the first 1000 search results are available"
        )
      ) {
        incomplete = true;
      } else {
        console.error(`Unexpected error in search query ${q}:`, error.message);
        break;
      }
    }
    if (allItems.length > 0) {
      const firstDate = new Date(allItems[0].commit.committer.date)
        .toISOString()
        .split("T")[0];
      const lastDate = new Date(
        allItems[allItems.length - 1].commit.committer.date
      )
        .toISOString()
        .split("T")[0];
      if (firstDate === lastDate) {
        console.warn(
          `All ${allItems.length} commits are on ${firstDate}, accepting partial results for this day`
        );
        allItems.forEach((item) => repos.add(item.repository.full_name));
        const nextDay = new Date(firstDate);
        nextDay.setDate(nextDay.getDate() + 1);
        currentStart = nextDay.toISOString().split("T")[0];
        continue;
      }
    }
    if (!incomplete || allItems.length === 0) {
      allItems.forEach((item) => repos.add(item.repository.full_name));
      break;
    }
    const lastCommit = allItems[allItems.length - 1];
    const lastDateStr = new Date(lastCommit.commit.committer.date)
      .toISOString()
      .split("T")[0];
    const filteredItems = allItems.filter(
      (item) =>
        new Date(item.commit.committer.date).toISOString().split("T")[0] !==
        lastDateStr
    );
    filteredItems.forEach((item) => repos.add(item.repository.full_name));
    if (lastDateStr === endDate) {
      console.warn(
        `Reached end date ${endDate} with incomplete results, accepting partial`
      );
      break;
    }
    currentStart = lastDateStr;
  }
  return repos;
}

/**
 * Get repository details for multiple repositories
 * @param {Array} repoNames - Array of repository full names (owner/repo)
 * @returns {Promise<Map>} - Map of repo name to repository info
 */
export async function getRepositoryDetails(repoNames) {
  const repoDetails = new Map();
  for (const repoName of repoNames) {
    try {
      const [owner, repo] = repoName.split("/");
      const { data: repoInfo } = await withRetry(() =>
        octokit.repos.get({ owner, repo })
      );
      repoDetails.set(repoName, repoInfo);
    } catch (error) {
      console.log(`Could not get details for ${repoName}: ${error.message}`);
      repoDetails.set(repoName, null);
    }
  }
  return repoDetails;
}

/**
 * Get repository metadata
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} - Repository object
 */
export async function getRepository(owner, repo) {
  const { data: repoInfo } = await withRetry(() =>
    octokit.repos.get({ owner, repo })
  );
  return repoInfo;
}

/**
 * Get commits from repository for specific author and date range
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} author - Author username
 * @param {string} since - Start date in ISO format
 * @param {string} until - End date in ISO format
 * @param {number} page - Page number
 * @param {number} perPage - Results per page
 * @returns {Promise<Array>} - Array of commit objects
 */
export async function getRepositoryCommits(
  owner,
  repo,
  author,
  since,
  until,
  page = 1,
  perPage = 100
) {
  const { data: commits } = await withRetry(() =>
    octokit.repos.listCommits({
      owner,
      repo,
      author,
      since,
      until,
      per_page: perPage,
      page,
    })
  );
  return commits;
}

/**
 * Get detailed commit information
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} ref - Commit SHA or reference
 * @returns {Promise<Object>} - Detailed commit object with stats and files
 */
export async function getCommitDetails(owner, repo, ref) {
  const { data: detailedCommit } = await withRetry(() =>
    octokit.repos.getCommit({
      owner,
      repo,
      ref,
    })
  );
  return detailedCommit;
}

export { findReposWithCommitsInPeriod, getTotalCommitCount };
