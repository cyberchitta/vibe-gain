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
      const { data: repoInfo } = await octokit.repos.get({ owner, repo });
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
  const safePeroidName = period.name.replace(/\s+/g, "-");
  const reposFilePath = path.join(
    repoListsDir,
    `repositories-${safePeroidName}.txt`
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
  const fileContent = `${fileHeader}
${allRepos.join("\n")}
`;
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
    const activityResult = await graphqlWithAuth(activityQuery);
    let activityRepos = [];
    // Extract repositories from all contribution types
    if (activityResult?.user?.contributionsCollection) {
      const contributions = activityResult.user.contributionsCollection;
      // Commits
      if (contributions.commitContributionsByRepository) {
        const repos = contributions.commitContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
      // Issues
      if (contributions.issueContributionsByRepository) {
        const repos = contributions.issueContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
      // Pull Requests
      if (contributions.pullRequestContributionsByRepository) {
        const repos = contributions.pullRequestContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
      // Pull Request Reviews
      if (contributions.pullRequestReviewContributionsByRepository) {
        const repos = contributions.pullRequestReviewContributionsByRepository
          .filter((item) => item?.repository?.nameWithOwner)
          .map((item) => item.repository.nameWithOwner);
        activityRepos.push(...repos);
      }
    }
    // Add discovered repositories to the set
    activityRepos.forEach((repo) => discoveredRepos.add(repo));
    console.log(
      `Found ${activityRepos.length} repositories from GraphQL activity (may include duplicates)`
    );
  } catch (error) {
    console.error(`Error in user activity query:`, error.message);
  }
  // APPROACH 2: Look at the authenticated user's events stream directly (this can find private repos)
  if (await isAuthenticatedUser(username)) {
    console.log(
      `Authenticated as ${username}, checking personal events stream...`
    );
    try {
      let page = 1;
      let hasMoreEvents = true;
      const eventRepos = new Set();
      while (hasMoreEvents) {
        const { data: events } =
          await octokit.activity.listEventsForAuthenticatedUser({
            username,
            per_page: 100,
            page,
          });
        if (events.length === 0) {
          break;
        }
        console.log(`Processing ${events.length} events (page ${page})...`);
        // Filter events by date
        const periodEvents = events.filter((event) => {
          const eventDate = new Date(event.created_at);
          return eventDate >= new Date(since) && eventDate <= new Date(until);
        });
        console.log(
          `Found ${periodEvents.length} events within the time period`
        );
        // Extract repository information
        for (const event of periodEvents) {
          if (event.repo && event.repo.name) {
            eventRepos.add(event.repo.name);
          }
        }
        hasMoreEvents = events.length === 100;
        page++;
        // GitHub API limitation
        if (page > 10) {
          console.log(`Reached page limit (10) for events`);
          hasMoreEvents = false;
        }
      }
      console.log(`Found ${eventRepos.size} unique repositories from events`);
      // Add to discovered repos
      eventRepos.forEach((repo) => discoveredRepos.add(repo));
    } catch (error) {
      console.error(`Error fetching events:`, error.message);
    }
    // APPROACH 3: Try direct repository access with different permission models
    console.log(`Checking all repositories with various access patterns...`);
    // List all repos the user can access with different affiliations
    const affiliations = ["owner", "collaborator", "organization_member"];
    for (const affiliation of affiliations) {
      try {
        console.log(`Checking repositories with affiliation: ${affiliation}`);
        let page = 1;
        let hasMoreRepos = true;
        while (hasMoreRepos) {
          try {
            const { data: repos } =
              await octokit.repos.listForAuthenticatedUser({
                per_page: 100,
                page,
                sort: "pushed",
                direction: "desc",
                affiliation,
                visibility: "all", // Explicitly request all visibilities (public, private, internal)
              });
            console.log(
              `Found ${repos.length} repositories with affiliation ${affiliation} (page ${page})`
            );
            if (repos.length === 0) {
              break;
            }
            // Check each repo for commits in the time period
            for (const repo of repos) {
              try {
                // Check if user has commits in this repo during the time period
                const { data: commits } = await octokit.repos.listCommits({
                  owner: repo.owner.login,
                  repo: repo.name,
                  author: username,
                  since,
                  until,
                  per_page: 1,
                });
                if (commits && commits.length > 0) {
                  discoveredRepos.add(repo.full_name);
                }
              } catch (commitError) {
                // Ignore errors - likely access issues
              }
            }
            hasMoreRepos = repos.length === 100;
            page++;
            // Limit to avoid excessive API calls
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
    // APPROACH 4: Look for commits in specific organizations the user belongs to
    try {
      // Get all organizations the authenticated user belongs to
      const { data: orgs } = await octokit.orgs.listForAuthenticatedUser();
      console.log(
        `Checking ${orgs.length} organizations for private repositories...`
      );
      for (const org of orgs) {
        console.log(`Checking ${org.login} organization...`);
        try {
          // Try each visibility type separately
          const visibilities = ["public", "private", "all"];
          for (const visibility of visibilities) {
            try {
              console.log(
                `Fetching ${visibility} repositories for ${org.login}...`
              );
              const { data: orgRepos } = await octokit.repos.listForOrg({
                org: org.login,
                type: "all",
                sort: "pushed",
                per_page: 100,
                visibility,
              });
              console.log(
                `Found ${orgRepos.length} ${visibility} repos in ${org.login}`
              );
              // Check each repo for commits by this user
              for (const repo of orgRepos) {
                try {
                  // Check for commits in this time period
                  const { data: commits } = await octokit.repos.listCommits({
                    owner: repo.owner.login,
                    repo: repo.name,
                    author: username,
                    since,
                    until,
                    per_page: 1,
                  });
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
  // APPROACH 5: Search for commits with REST API
  console.log(
    `Searching for commits via REST API for period ${period.name}...`
  );
  try {
    // Try different search query formats to find more repositories
    const searchQueries = [
      `author:${username} committer-date:${period.start}..${period.end}`,
      `committer:${username} committer-date:${period.start}..${period.end}`,
      `author-email:*@users.noreply.github.com committer-date:${period.start}..${period.end} author-name:${username}`,
    ];
    for (const searchQuery of searchQueries) {
      let page = 1;
      let hasMoreResults = true;
      console.log(`Executing search query: ${searchQuery}`);
      while (hasMoreResults) {
        try {
          const searchResult = await octokit.search.commits({
            q: searchQuery,
            per_page: 100,
            page: page,
            sort: "committer-date",
            order: "desc",
          });
          if (searchResult.data.items && searchResult.data.items.length > 0) {
            console.log(
              `Found ${searchResult.data.items.length} commits in search results (page ${page})`
            );
            for (const item of searchResult.data.items) {
              if (item.repository) {
                discoveredRepos.add(item.repository.full_name);
              }
            }
          }
          hasMoreResults =
            searchResult.data.items && searchResult.data.items.length === 100;
          page++;
          // Limit to avoid excessive API calls
          if (page > 10) {
            console.log(`Reached page limit (10) for commit search`);
            hasMoreResults = false;
          }
        } catch (searchError) {
          console.error(
            `Error in search API (page ${page}):`,
            searchError.message
          );
          hasMoreResults = false;
        }
      }
    }
  } catch (error) {
    console.error(`Error in REST API commit search:`, error.message);
  }
  // Convert the Set to an array and update the repository list file
  const reposList = Array.from(discoveredRepos);
  console.log(
    `\nTotal discovered repositories for period ${period.name}: ${reposList.length}`
  );
  // Update the repository list file
  await updateRepoListFile(username, period, reposList);
  return reposList;
}

async function isAuthenticatedUser(username) {
  try {
    const { data } = await octokit.users.getAuthenticated();
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
