import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { getUserDirs } from "./config.js";

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${GITHUB_TOKEN}`,
  },
});

/**
 * Check remaining rate limit and pause if necessary
 * @returns {Promise<boolean>} - True if safe to proceed, false if paused
 */
async function checkRateLimit() {
  try {
    const { data } = await octokit.rateLimit.get();
    const remaining = data.resources.search.remaining;
    const resetTime = data.resources.search.reset * 1000;
    console.log(
      `Search API rate limit: ${remaining} requests remaining, resets at ${new Date(
        resetTime
      ).toISOString()}`
    );
    if (remaining < 5) {
      const waitTime = resetTime - Date.now() + 1000;
      console.log(
        `Rate limit low (${remaining} remaining), pausing for ${waitTime}ms until reset...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return false;
    }
    return true;
  } catch (error) {
    console.log(
      `Error checking rate limit, proceeding cautiously:`,
      error.message
    );
    return true;
  }
}

/**
 * Utility function to retry API calls with exponential backoff
 * @param {Function} fn - The API call function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Result of the API call
 */
async function withRetry(fn, maxRetries = 5, baseDelay = 5000) {
  let lastError;
  try {
    return await fn();
  } catch (error) {
    lastError = error;
    if (error.status === 403 && error.message.includes("rate limit exceeded")) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let delay = baseDelay * Math.pow(2, attempt - 1);
        if (error.response?.headers?.["x-ratelimit-reset"]) {
          const resetTime =
            parseInt(error.response.headers["x-ratelimit-reset"]) * 1000;
          const now = Date.now();
          delay = Math.max(resetTime - now, delay);
        }
        console.log(
          `Rate limit hit, retrying (${attempt}/${maxRetries}) after ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          return await fn();
        } catch (retryError) {
          lastError = retryError;
          if (
            !(
              retryError.status === 403 &&
              retryError.message.includes("rate limit exceeded")
            )
          ) {
            throw retryError;
          }
        }
      }
      console.error(
        `Failed to recover from rate limit after ${maxRetries} attempts:`,
        lastError.message
      );
      throw lastError;
    }
    throw error;
  }
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

async function filterForkRepositories(repoNames) {
  console.log(
    `\nChecking for duplicate forks among ${repoNames.length} repositories...`
  );
  const repoDetails = new Map();
  const forkParents = new Map();
  for (const repoName of repoNames) {
    try {
      const [owner, repo] = repoName.split("/");
      const { data: repoInfo } = await withRetry(() =>
        octokit.repos.get({ owner, repo })
      );
      repoDetails.set(repoName, repoInfo);
      if (repoInfo.fork && repoInfo.parent) {
        forkParents.set(repoName, repoInfo.parent.full_name);
      }
    } catch (error) {
      console.log(`Could not get details for ${repoName}: ${error.message}`);
    }
  }
  const forksToRemove = [];
  for (const [forkName, parentName] of forkParents.entries()) {
    if (repoNames.includes(parentName)) {
      forksToRemove.push(forkName);
      console.log(
        `Filtering out fork ${forkName} as original repo ${parentName} is also available`
      );
    }
  }
  const filteredRepos = repoNames.filter(
    (repo) => !forksToRemove.includes(repo)
  );
  console.log(
    `Removed ${forksToRemove.length} forks to avoid duplicate commits`
  );
  console.log(`Remaining repositories: ${filteredRepos.length}`);
  return filteredRepos;
}

async function updateRepoListFile(username, period, newRepos) {
  const filteredNewRepos = await filterForkRepositories(newRepos);
  const { outputDir } = getUserDirs(username);
  const repoListsDir = path.join(outputDir, "repo_lists");
  await fs.mkdir(repoListsDir, { recursive: true });
  const safePeriodName = period.name.replace(/\s+/g, "-");
  const reposFilePath = path.join(
    repoListsDir,
    `repositories-${safePeriodName}.txt`
  );
  let existingRepos = [];
  let existingContent = "";
  let fileHeader = `# GitHub Repositories for period: ${period.name} (${
    period.start
  } to ${period.end})
# Generated: ${new Date().toISOString()}
# Note: Edit this file manually to add/remove repositories as needed
`;
  try {
    existingContent = await fs.readFile(reposFilePath, "utf8");
    const headerLines = existingContent
      .split("\n")
      .filter((line) => line.startsWith("#"));
    if (headerLines.length > 0) {
      fileHeader = headerLines.join("\n") + "\n";
    }
    existingRepos = existingContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    console.log(
      `Found ${existingRepos.length} existing repositories in ${reposFilePath}`
    );
  } catch (error) {
    console.log(`No existing repository list found, will create a new one`);
  }
  let allRepos = [...new Set([...existingRepos, ...filteredNewRepos])];
  if (existingRepos.length > 0) {
    allRepos = await filterForkRepositories(allRepos);
  }
  allRepos.sort();
  const fileContent = `${fileHeader}${allRepos.join("\n")}\n`;
  await fs.writeFile(reposFilePath, fileContent);
  const newlyAdded = filteredNewRepos.filter(
    (repo) => !existingRepos.includes(repo)
  );
  console.log(`Updated ${reposFilePath} with ${allRepos.length} repositories`);
  console.log(`Added ${newlyAdded.length} new unique repositories to the list`);
  if (newlyAdded.length > 0) {
    console.log("\nNewly added repositories:");
    newlyAdded.forEach((repo) => console.log(`- ${repo}`));
  }
}

async function discoverRepositoriesForPeriod(username, period) {
  console.log(
    `\nDiscovering repositories for ${username} in period ${period.name} (${period.start} to ${period.end})...`
  );
  const { outputDir } = getUserDirs(username);
  const repoListsDir = path.join(outputDir, "repo_lists");
  const safePeriodName = period.name.replace(/\s+/g, "-");
  const reposFilePath = path.join(
    repoListsDir,
    `repositories-${safePeriodName}.txt`
  );
  try {
    const existingContent = await fs.readFile(reposFilePath, "utf8");
    const existingRepos = existingContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    if (existingRepos.length > 0) {
      console.log(
        `Repository list file already exists at ${reposFilePath} with ${existingRepos.length} repositories. Skipping discovery.`
      );
      console.log(`Existing repositories:`);
      existingRepos.forEach((repo) => console.log(`- ${repo}`));
      return existingRepos;
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(
        `No existing repository list found at ${reposFilePath}, proceeding with discovery...`
      );
    } else {
      console.error(`Error checking repository list file: ${error.message}`);
    }
  }
  const discoveredRepos = new Set();
  const since = new Date(`${period.start}T00:00:00Z`).toISOString();
  const until = new Date(`${period.end}T23:59:59Z`).toISOString();
  // APPROACH 1: Look at the user's activity feed for the period via GraphQL
  console.log(
    `Fetching user activity via GraphQL for period ${period.name}...`
  );
  try {
    const activityQuery = `
      query {
        user(login: "${username}") {
          contributionsCollection(from: "${period.start}T00:00:00Z", to: "${period.end}T23:59:59Z") {
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
    const activityResult = await withRetry(() =>
      graphqlWithAuth(activityQuery)
    );
    let activityRepos = [];
    if (activityResult?.user?.contributionsCollection) {
      const contributions = activityResult.user.contributionsCollection;
      if (contributions.commitContributionsByRepository) {
        const repos = contributions.commitContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
      if (contributions.issueContributionsByRepository) {
        const repos = contributions.issueContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
      if (contributions.pullRequestContributionsByRepository) {
        const repos = contributions.pullRequestContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
      if (contributions.pullRequestReviewContributionsByRepository) {
        const repos = contributions.pullRequestReviewContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
    }
    activityRepos.forEach((repo) => discoveredRepos.add(repo));
    console.log(
      `Found ${activityRepos.length} repositories from GraphQL activity (may include duplicates)`
    );
  } catch (error) {
    console.error(`Error in user activity query:`, error.message);
  }
  // APPROACH 2: Look at the authenticated user's events stream directly
  if (await isAuthenticatedUser(username)) {
    console.log(
      `Authenticated as ${username}, checking personal events stream...`
    );
    try {
      let page = 1;
      let hasMoreEvents = true;
      const eventRepos = new Set();
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
        console.log(`Processing ${events.length} events (page ${page})...`);
        const periodEvents = events.filter((event) => {
          const eventDate = new Date(event.created_at);
          return eventDate >= new Date(since) && eventDate <= new Date(until);
        });
        console.log(
          `Found ${periodEvents.length} events within the time period`
        );
        for (const event of periodEvents) {
          if (event.repo && event.repo.name) {
            eventRepos.add(event.repo.name);
          }
        }
        hasMoreEvents = events.length === 100;
        page++;
      }
      console.log(`Found ${eventRepos.size} unique repositories from events`);
      eventRepos.forEach((repo) => discoveredRepos.add(repo));
    } catch (error) {
      console.error(`Error fetching events:`, error.message);
    }
    // APPROACH 3: Try direct repository access with different permission models
    console.log(`Checking all repositories with various access patterns...`);
    const affiliations = ["owner", "collaborator", "organization_member"];
    for (const affiliation of affiliations) {
      try {
        console.log(`Checking repositories with affiliation: ${affiliation}`);
        let page = 1;
        let hasMoreRepos = true;
        while (hasMoreRepos) {
          try {
            const { data: repos } = await withRetry(() =>
              octokit.repos.listForAuthenticatedUser({
                per_page: 100,
                page,
                sort: "pushed",
                direction: "desc",
                affiliation,
                visibility: "all",
              })
            );
            console.log(
              `Found ${repos.length} repositories with affiliation ${affiliation} (page ${page})`
            );
            if (repos.length === 0) {
              break;
            }
            for (const repo of repos) {
              try {
                const { data: commits } = await withRetry(() =>
                  octokit.repos.listCommits({
                    owner: repo.owner.login,
                    repo: repo.name,
                    author: username,
                    since,
                    until,
                    per_page: 1,
                  })
                );
                if (commits && commits.length > 0) {
                  discoveredRepos.add(repo.full_name);
                }
              } catch (commitError) {
                // Ignore errors - likely access issues
              }
            }
            hasMoreRepos = repos.length === 100;
            page++;
            if (page > 5) {
              console.log(
                `Reached page limit (5) for repos with affiliation ${affiliation}`
              );
              hasMoreRepos = false;
            }
          } catch (pageError) {
            console.error(
              `Error fetching page ${page} of repos with affiliation ${affiliation}:`,
              pageError.message
            );
            hasMoreRepos = false;
          }
        }
      } catch (error) {
        console.error(
          `Error listing repos with affiliation ${affiliation}:`,
          error.message
        );
      }
    }
    // APPROACH 4: Look for commits in specific organizations
    try {
      const { data: orgs } = await withRetry(() =>
        octokit.orgs.listForAuthenticatedUser()
      );
      console.log(
        `Checking ${orgs.length} organizations for private repositories...`
      );
      for (const org of orgs) {
        console.log(`Checking ${org.login} organization...`);
        try {
          const visibilities = ["public", "private", "all"];
          for (const visibility of visibilities) {
            try {
              console.log(
                `Fetching ${visibility} repositories for ${org.login}...`
              );
              const { data: orgRepos } = await withRetry(() =>
                octokit.repos.listForOrg({
                  org: org.login,
                  type: "all",
                  sort: "pushed",
                  per_page: 100,
                  visibility,
                })
              );
              console.log(
                `Found ${orgRepos.length} ${visibility} repos in ${org.login}`
              );
              for (const repo of orgRepos) {
                try {
                  const { data: commits } = await withRetry(() =>
                    octokit.repos.listCommits({
                      owner: repo.owner.login,
                      repo: repo.name,
                      author: username,
                      since,
                      until,
                      per_page: 1,
                    })
                  );
                  if (commits && commits.length > 0) {
                    discoveredRepos.add(repo.full_name);
                  }
                } catch (commitError) {
                  // Permission issues likely - skip
                }
              }
            } catch (visibilityError) {
              console.log(
                `Could not fetch ${visibility} repos for ${org.login}: ${visibilityError.message}`
              );
            }
          }
        } catch (orgError) {
          console.error(
            `Error listing repos for org ${org.login}:`,
            orgError.message
          );
        }
      }
    } catch (orgsError) {
      console.error(`Error listing organizations:`, orgsError.message);
    }
  }
  // APPROACH 5: Search for commits with REST API (with sequential peel on incomplete results)
  console.log(
    `Searching for commits via REST API for period ${period.name}...`
  );
  try {
    const baseQueries = [
      `author:${username}`,
      `committer:${username}`,
      `author-email:*@users.noreply.github.com author-name:${username}`,
    ];
    for (const baseQuery of baseQueries) {
      await checkRateLimit();
      const periodRepos = await searchReposInPeriod(
        username,
        period.start,
        period.end,
        baseQuery
      );
      periodRepos.forEach((repo) => discoveredRepos.add(repo));
    }
    console.log(
      `Found ${discoveredRepos.size} unique repositories from commit search`
    );
  } catch (error) {
    console.error(`Error in REST API commit search:`, error.message);
  }
  const reposList = Array.from(discoveredRepos);
  console.log(
    `\nTotal discovered repositories for period ${period.name}: ${reposList.length}`
  );
  await updateRepoListFile(username, period, reposList);
  return reposList;
}

/**
 * Recursively search for repositories with commits in a date range using a base query, peeling sequentially on incomplete results and dropping boundary day commits from the prefix.
 * @param {string} username - GitHub username
 * @param {string} start - Start date YYYY-MM-DD
 * @param {string} end - End date YYYY-MM-DD
 * @param {string} baseQuery - Base search query without date range
 * @returns {Promise<Set<string>>} - Set of repository full names
 */
async function searchReposInPeriod(username, start, end, baseQuery) {
  const repos = new Set();
  let currentStart = start;
  while (new Date(currentStart) <= new Date(end)) {
    const q = `${baseQuery} committer-date:${currentStart}..${end}`;
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
    if (lastDateStr === end) {
      console.warn(
        `Reached end date ${end} with incomplete results, accepting partial`
      );
      break;
    }
    currentStart = lastDateStr;
  }
  return repos;
}

async function isAuthenticatedUser(username) {
  try {
    const { data } = await withRetry(() => octokit.users.getAuthenticated());
    return data.login === username;
  } catch (error) {
    console.error("Error checking authenticated user:", error.message);
    return false;
  }
}

async function main() {
  const DEFAULT_PARAMETERS_FILE = path.join(
    process.cwd(),
    "data",
    "parameters.json"
  );
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
  for (const userConfig of GITHUB_USERNAMES) {
    const { username } = userConfig;
    console.log(`\n==== Discovering repositories for user: ${username} ====`);
    for (const period of PERIODS) {
      await discoverRepositoriesForPeriod(username, period);
    }
  }
  console.log("\nRepository discovery complete for all users and periods.");
  console.log(
    "You can now manually edit the repository list files in each user's repo_lists directory."
  );
}

main().catch(console.error);
s