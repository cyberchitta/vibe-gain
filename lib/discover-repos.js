import fs from "fs/promises";
import path from "path";
import { getUserDirs } from "./config.js";
import {
  getUserActivityRepositories,
  getUserEventRepositories,
  getUserRepositories,
  getOrganizationRepositories,
  getUserOrganizations,
  isAuthenticatedUser,
  searchRepositoriesInPeriod,
  getRepositoryDetails,
  getRepositoryCommits,
} from "./api/queries.js";

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

async function hasCommitsInPeriod(repo, username, period) {
  try {
    const commits = await getRepositoryCommits(
      repo.owner.login,
      repo.name,
      username,
      new Date(`${period.start}T00:00:00Z`).toISOString(),
      new Date(`${period.end}T23:59:59Z`).toISOString(),
      1,
      1
    );
    return commits && commits.length > 0;
  } catch (commitError) {
    return false;
  }
}

async function filterForkRepositories(repoNames) {
  console.log(
    `\nChecking for duplicate forks among ${repoNames.length} repositories...`
  );
  const repoDetails = await getRepositoryDetails(repoNames);
  const forkParents = new Map();
  for (const [repoName, repoInfo] of repoDetails.entries()) {
    if (repoInfo && repoInfo.fork && repoInfo.parent) {
      forkParents.set(repoName, repoInfo.parent.full_name);
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
  const isAuthUser = await isAuthenticatedUser(username);
  // APPROACH 1: GraphQL user activity
  console.log(
    `Fetching user activity via GraphQL for period ${period.name}...`
  );
  try {
    const activityRepos = await getUserActivityRepositories(
      username,
      period.start,
      period.end
    );
    activityRepos.forEach((repo) => discoveredRepos.add(repo));
    console.log(
      `Found ${activityRepos.length} repositories from GraphQL activity (may include duplicates)`
    );
  } catch (error) {
    console.error(`Error in user activity query:`, error.message);
  }
  if (isAuthUser) {
    // APPROACH 2: Authenticated user events
    console.log(
      `Authenticated as ${username}, checking personal events stream...`
    );
    try {
      const eventRepos = await getUserEventRepositories(username);
      eventRepos.forEach((repo) => discoveredRepos.add(repo));
      console.log(`Found ${eventRepos.size} unique repositories from events`);
    } catch (error) {
      console.error(`Error fetching events:`, error.message);
    }
    // APPROACH 3: Direct repository access
    console.log(`Checking all repositories with various access patterns...`);
    const affiliations = ["owner", "collaborator", "organization_member"];
    for (const affiliation of affiliations) {
      try {
        console.log(`Checking repositories with affiliation: ${affiliation}`);
        const repos = await getUserRepositories(affiliation);
        console.log(
          `Found ${repos.length} repositories with affiliation ${affiliation}`
        );
        for (const repo of repos) {
          try {
            if (await hasCommitsInPeriod(repo, username, period)) {
              discoveredRepos.add(repo.full_name);
            }
          } catch (commitError) {
            // Ignore errors - likely access issues
          }
        }
      } catch (error) {
        console.error(
          `Error listing repos with affiliation ${affiliation}:`,
          error.message
        );
      }
    }
    // APPROACH 4: Organization repositories
    try {
      const orgs = await getUserOrganizations();
      console.log(
        `Checking ${orgs.length} organizations for private repositories...`
      );
      for (const org of orgs) {
        console.log(`Checking ${org.login} organization...`);
        const visibilities = ["public", "private", "all"];
        for (const visibility of visibilities) {
          try {
            console.log(
              `Fetching ${visibility} repositories for ${org.login}...`
            );
            const orgRepos = await getOrganizationRepositories(
              org.login,
              visibility
            );
            console.log(
              `Found ${orgRepos.length} ${visibility} repos in ${org.login}`
            );
            for (const repo of orgRepos) {
              try {
                if (await hasCommitsInPeriod(repo, username, period)) {
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
    const baseQueries = [
      `author:${username}`,
      `committer:${username}`,
      `author-email:*@users.noreply.github.com author-name:${username}`,
    ];
    for (const baseQuery of baseQueries) {
      const periodRepos = await searchRepositoriesInPeriod(
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
