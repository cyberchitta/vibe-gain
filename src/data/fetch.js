const fs = require("fs").promises;
const path = require("path");
const Papa = require("papaparse");
const { octokit } = require("../api/github");
const { getTotalCommitCount } = require("../api/queries");

/**
 * Fetch commits from repos for a specific time period
 * @param {Array} repos - Array of repository objects
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} - Array of commit objects
 */
async function fetchCommitsFromRepos(repos, username, startDate, endDate) {
  console.log(
    `Fetching commits from ${repos.length} repositories for period ${startDate} to ${endDate}`
  );

  const commitData = [];
  const commitSHAs = new Set();
  const startDateTime = new Date(startDate);
  const endDateTime = new Date(endDate);
  let totalProcessed = 0;
  let accessDeniedRepos = [];
  let duplicateCommitCount = 0;

  for (const repo of repos) {
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
          since: startDateTime.toISOString(),
          until: endDateTime.toISOString(),
          per_page: 100,
          page: commitsPage,
        });

        for (const commit of pageCommits) {
          // Skip this commit if we've already seen it in another repo
          if (commitSHAs.has(commit.sha)) {
            repoSkippedCount++;
            duplicateCommitCount++;
            continue;
          }

          try {
            const { data: detailedCommit } = await octokit.repos.getCommit({
              owner: repo.owner.login,
              repo: repo.name,
              ref: commit.sha,
            });

            // Add this commit to our collection
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
            });

            // Mark this SHA as seen
            commitSHAs.add(commit.sha);
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

      // Check if this was an access denied error
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

  // Report on inaccessible repositories
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

  // Report on duplicate commits
  if (duplicateCommitCount > 0) {
    console.log(
      `\nFiltered out ${duplicateCommitCount} duplicate commits that appeared in multiple repositories.`
    );
  }

  console.log(
    `Total unique commits found for period ${startDate} to ${endDate}: ${commitData.length}`
  );

  // Check if our commit count is significantly less than what GitHub reports
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
 * @param {string} outputDir - Main output directory
 * @param {string} dataDir - Data directory
 */
async function initDirs(outputDir, dataDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
}

/**
 * Fetch all commits for a specific time period
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {function} findReposWithCommitsInPeriod - Function to find repos with commits
 * @returns {Promise<Array>} - Array of commit objects
 */
async function fetchCommitsForPeriod(
  username,
  startDate,
  endDate,
  findReposWithCommitsInPeriod
) {
  // Get all repositories with commits in this period
  const periodRepos = await findReposWithCommitsInPeriod(
    username,
    startDate,
    endDate
  );

  // Now fetch all commits from these repositories
  return await fetchCommitsFromRepos(periodRepos, username, startDate, endDate);
}

/**
 * Load or fetch commits for a period
 * @param {string} username - GitHub username
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} csvPath - Path to CSV file for caching
 * @param {function} findReposWithCommitsInPeriod - Function to find repos with commits
 * @returns {Promise<Array>} - Array of commit objects
 */
async function fetchCommits(
  username,
  startDate,
  endDate,
  csvPath,
  findReposWithCommitsInPeriod
) {
  try {
    await fs.access(csvPath);
    console.log(`Loading commits from ${csvPath}`);
    const csvData = await fs.readFile(csvPath, "utf8");
    const parsed = Papa.parse(csvData, { header: true, dynamicTyping: true });

    // Check for potential missing data in cached results
    const cachedCommitCount = parsed.data.length;
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
      rm "${csvPath}"\n`);
    }

    // Calculate private repo percentage in cached data
    const privateCommits = parsed.data.filter((row) => row.private).length;
    const privatePercentage = (privateCommits / cachedCommitCount) * 100;
    console.log(
      `${privatePercentage.toFixed(
        1
      )}% of cached commits are from private repositories`
    );

    // Check for duplicate commits in cache (a sign the data might be old and not filtered)
    const uniqueSHAs = new Set(parsed.data.map((row) => row.sha));
    if (uniqueSHAs.size < parsed.data.length) {
      console.log(
        `\n⚠️ WARNING: Cache contains duplicate commits (${
          parsed.data.length - uniqueSHAs.size
        } duplicates)`
      );
      console.log(`Consider deleting the cache file to apply duplicate filtering:
      rm "${csvPath}"\n`);
    }

    return parsed.data.map((row) => ({
      ...row,
      date: row.date,
      timestamp: new Date(row.timestamp),
    }));
  } catch (error) {
    // Use the improved method to find repositories with commits in this period
    const commitData = await fetchCommitsForPeriod(
      username,
      startDate,
      endDate,
      findReposWithCommitsInPeriod
    );

    if (commitData.length > 0) {
      const csv = Papa.unparse(commitData);
      await fs.writeFile(csvPath, csv);
      console.log(`Saved ${commitData.length} commits to ${csvPath}`);

      // Calculate private repo percentage
      const privateCommits = commitData.filter(
        (commit) => commit.private
      ).length;
      const privatePercentage = (privateCommits / commitData.length) * 100;
      console.log(
        `${privatePercentage.toFixed(
          1
        )}% of commits are from private repositories`
      );

      // Calculate fork percentage
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

module.exports = {
  initDirs,
  fetchCommitsFromRepos,
  fetchCommitsForPeriod,
  fetchCommits,
};
