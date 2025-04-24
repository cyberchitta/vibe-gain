const { Octokit } = require("@octokit/rest");
const fs = require("fs").promises;
const path = require("path");
const _ = require("lodash");
const Papa = require("papaparse");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
  throw new Error(
    "Please set GITHUB_TOKEN and GITHUB_USERNAME environment variables."
  );
}
const PERIODS = [
  { name: "Pre-AI", start: "2022-09-07", end: "2022-12-06" },
  { name: "Beginning_AI", start: "2023-02-12", end: "2023-05-11" },
  { name: "Recent_AI", start: "2025-01-01", end: "2025-03-31" },
];
const OUTPUT_DIR = "output";
const DATA_DIR = path.join(OUTPUT_DIR, "data");
const CLUSTER_THRESHOLD_MINUTES = 30;
const DEFAULT_BINS = 20;

async function initDirs() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function fetchCommitsFromAllRepos(startDate, endDate) {
  console.log(
    `Fetching commits from all accessible repos for ${startDate} to ${endDate}`
  );
  const allRepos = new Map();
  let page = 1;
  let hasMoreRepos = true;
  while (hasMoreRepos) {
    console.log(`Fetching owned repos page ${page}...`);
    const { data: reposPage } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      page: page,
      affiliation: "owner,organization_member",
    });
    reposPage.forEach((repo) => allRepos.set(repo.full_name, repo));
    hasMoreRepos = reposPage.length === 100;
    page++;
  }
  page = 1;
  hasMoreRepos = true;
  while (hasMoreRepos) {
    console.log(`Fetching contributed repos page ${page}...`);
    try {
      const { data: contributedPage } = await octokit.repos.listForUser({
        username: GITHUB_USERNAME,
        per_page: 100,
        page: page,
        type: "all",
      });
      contributedPage.forEach((repo) => allRepos.set(repo.full_name, repo));
      hasMoreRepos = contributedPage.length === 100;
    } catch (error) {
      console.error(
        `Error fetching contributed repos page ${page}:`,
        error.message
      );
      hasMoreRepos = false;
    }
    page++;
  }
  const repos = Array.from(allRepos.values());
  console.log(`Found ${repos.length} total repositories to check`);

  const commitData = [];
  const startDateTime = new Date(startDate);
  const endDateTime = new Date(endDate);
  let totalProcessed = 0;
  for (const repo of repos) {
    console.log(
      `[${++totalProcessed}/${repos.length}] Checking ${
        repo.full_name
      } for commits...`
    );
    try {
      let commitsPage = 1;
      let hasMoreCommits = true;
      let repoCommitCount = 0;
      while (hasMoreCommits) {
        const { data: pageCommits } = await octokit.repos.listCommits({
          owner: repo.owner.login,
          repo: repo.name,
          author: GITHUB_USERNAME,
          since: startDateTime.toISOString(),
          until: endDateTime.toISOString(),
          per_page: 100,
          page: commitsPage,
        });
        repoCommitCount += pageCommits.length;
        for (const commit of pageCommits) {
          try {
            const { data: detailedCommit } = await octokit.repos.getCommit({
              owner: repo.owner.login,
              repo: repo.name,
              ref: commit.sha,
            });
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
            });
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
          console.log(`Fetching page ${commitsPage} of commits for ${repo.full_name}...`);
        }
      }
      if (repoCommitCount > 0) {
        console.log(`Found ${repoCommitCount} total commits in ${repo.full_name}`);
      }
    } catch (error) {
      console.error(
        `Error fetching commits from ${repo.full_name}:`,
        error.message
      );
    }
  }
  console.log(`Total commits found across all repos: ${commitData.length}`);
  return commitData;
}

async function fetchCommits(startDate, endDate, csvPath) {
  try {
    await fs.access(csvPath);
    console.log(`Loading commits from ${csvPath}`);
    const csvData = await fs.readFile(csvPath, "utf8");
    const parsed = Papa.parse(csvData, { header: true, dynamicTyping: true });
    return parsed.data.map((row) => ({
      ...row,
      date: row.date,
      timestamp: new Date(row.timestamp),
    }));
  } catch (error) {
    const commitData = await fetchCommitsFromAllRepos(startDate, endDate);
    if (commitData.length > 0) {
      const csv = Papa.unparse(commitData);
      await fs.writeFile(csvPath, csv);
      console.log(`Saved ${commitData.length} commits to ${csvPath}`);
    } else {
      console.log(`No commits found for period ${startDate} to ${endDate}`);
    }
    return commitData;
  }
}

function computeMetrics(commits) {
  const commitsByDate = _.groupBy(commits, "date");
  const commitsPerDay = Object.entries(commitsByDate).map(([date, group]) => ({
    date,
    commits: group.length,
  }));
  const locPerDay = Object.entries(commitsByDate).map(([date, group]) => {
    const loc = group.reduce((sum, c) => sum + c.additions + c.deletions, 0);
    return { date, loc };
  });
  const reposPerDay = Object.entries(commitsByDate).map(([date, group]) => ({
    date,
    repos: _.uniq(group.map((c) => c.repo)).length,
  }));
  const hoursPerDay = [];
  const commitsPerHour = [];
  const gapsPerDay = [];
  const timeBetweenCommits = [];
  for (const [date, group] of Object.entries(commitsByDate)) {
    const timestamps = group
      .map((c) => new Date(c.timestamp))
      .sort((a, b) => a - b);
    let hours;
    if (timestamps.length === 1) {
      hours = 0.1;
    } else {
      const timeDiff =
        (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 3600);
      hours = Math.min(timeDiff, 8);
    }
    hoursPerDay.push({ date, hours });
    const cph = timestamps.length / Math.max(hours, 0.1);
    commitsPerHour.push({ date, commits_per_hour: cph });
    if (timestamps.length <= 1) {
      gapsPerDay.push({ date, avg_gap_minutes: 0 });
    } else {
      const clusters = [];
      let currentCluster = [timestamps[0]];
      for (let i = 1; i < timestamps.length; i++) {
        const timeDiff = (timestamps[i] - timestamps[i - 1]) / (1000 * 60);
        if (timeDiff <= CLUSTER_THRESHOLD_MINUTES) {
          currentCluster.push(timestamps[i]);
        } else {
          clusters.push(currentCluster);
          currentCluster = [timestamps[i]];
        }
      }
      clusters.push(currentCluster);
      const avgGap =
        clusters.length <= 1
          ? 0
          : clusters.slice(1).reduce((sum, cluster, i) => {
              const gap = (cluster[0] - clusters[i][0]) / (1000 * 60);
              return sum + gap;
            }, 0) /
            (clusters.length - 1);
      gapsPerDay.push({ date, avg_gap_minutes: avgGap });
    }
    if (timestamps.length <= 1) {
      timeBetweenCommits.push({ date, avg_time_between_commits: 0 });
    } else {
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push((timestamps[i] - timestamps[i - 1]) / (1000 * 60));
      }
      const avgInterval =
        intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      timeBetweenCommits.push({ date, avg_time_between_commits: avgInterval });
    }
  }
  return {
    commits: commitsPerDay,
    loc: locPerDay,
    repos: reposPerDay,
    hours: hoursPerDay,
    gaps: gapsPerDay,
    commits_per_hour: commitsPerHour,
    time_between_commits: timeBetweenCommits,
  };
}

function getDynamicRange(data, key, fallbackRange) {
  if (!data || data.length === 0) return fallbackRange;
  const values = data.map((d) => d[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [Math.max(0, min - 1), max + 1];
  }
  const padding = (max - min) * 0.05;
  return [Math.floor(min - padding), Math.ceil(max + padding)];
}

async function generateInteractiveHistograms(metrics, periodName) {
  const histograms = [
    {
      id: "commits",
      title: "Commits per Active Day",
      key: "commits",
      data: metrics.commits,
      xLabel: "Commits",
      fallbackRange: [0, 20],
    },
    {
      id: "loc",
      title: "LOC per Active Day",
      key: "loc",
      data: metrics.loc,
      xLabel: "LOC (Additions + Deletions)",
      fallbackRange: [0, 1000],
    },
    {
      id: "repos",
      title: "Repos per Active Day",
      key: "repos",
      data: metrics.repos,
      xLabel: "Unique Repos",
      fallbackRange: [1, 5],
    },
    {
      id: "hours",
      title: "Estimated Hours per Active Day",
      key: "hours",
      data: metrics.hours,
      xLabel: "Hours",
      fallbackRange: [0, 8],
    },
    {
      id: "gaps",
      title: "Avg Time Between Commit Groups",
      key: "avg_gap_minutes",
      data: metrics.gaps,
      xLabel: "Minutes",
      fallbackRange: [0, 120],
    },
    {
      id: "commits_per_hour",
      title: "Commits per Hour",
      key: "commits_per_hour",
      data: metrics.commits_per_hour,
      xLabel: "Commits per Hour",
      fallbackRange: [0, 10],
    },
    {
      id: "time_between_commits",
      title: "Avg Time Between Commits",
      key: "avg_time_between_commits",
      data: metrics.time_between_commits,
      xLabel: "Minutes",
      fallbackRange: [0, 60],
    },
  ];
  const histogramConfigs = histograms.map((h) => {
    const range = getDynamicRange(h.data, h.key, h.fallbackRange);
    const bins = Math.min(
      DEFAULT_BINS,
      Math.ceil((range[1] - range[0]) / (h.key.includes("commits") ? 1 : 10))
    );
    return { ...h, range, bins };
  });
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>GitHub Productivity Analysis - ${periodName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-gap: 20px; }
    canvas { width: 100%; height: 200px; }
    button { margin: 10px 0; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@1.2.1/dist/chartjs-plugin-zoom.min.js"></script>
</head>
<body>
  <h1>Productivity Metrics - ${periodName}</h1>
  <button onclick="resetAll()">Reset Zoom</button>
  <div class="grid">
    ${histogramConfigs
      .map((h) => `<canvas id="${h.id}"></canvas>`)
      .concat("<div></div>") // Empty slot for 2x4 grid
      .join("")}
  </div>
  <script>
    const metrics = ${JSON.stringify(metrics)};
    const histogramConfigs = ${JSON.stringify(histogramConfigs)};

    function createHistogram(ctx, config) {
      const { title, data, xLabel, bins, range } = config;
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: Array.from({ length: bins }, (_, i) => {
            const step = (range[1] - range[0]) / bins;
            return (range[0] + i * step).toFixed(1);
          }),
          datasets: [{
            label: title,
            data: (() => {
              const counts = Array(bins).fill(0);
              const step = (range[1] - range[0]) / bins;
              data.forEach(val => {
                if (val >= range[0] && val <= range[1]) {
                  const bin = Math.min(Math.floor((val - range[0]) / step), bins - 1);
                  counts[bin]++;
                }
              });
              return counts;
            })(),
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          }],
        },
        options: {
          plugins: {
            title: { display: true, text: title },
            zoom: {
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                drag: { enabled: true, backgroundColor: 'rgba(0,0,0,0.1)' },
                mode: 'x',
              },
              pan: { enabled: true, mode: 'x' },
            },
          },
          scales: {
            x: { title: { display: true, text: xLabel } },
            y: { title: { display: true, text: 'Frequency' } },
          },
        },
      });
    }

    const charts = {};
    histogramConfigs.forEach(config => {
      charts[config.id] = createHistogram(
        document.getElementById(config.id).getContext('2d'),
        config
      );
    });

    function resetAll() {
      Object.values(charts).forEach(chart => chart.resetZoom());
    }
  </script>
</body>
</html>
  `;

  const outputPath = path.join(
    OUTPUT_DIR,
    `histograms_${periodName.replace(/ /g, "_")}.html`
  );
  await fs.writeFile(outputPath, html);
  console.log(`Saved histograms to ${outputPath}`);
}

async function testGitHubAPI() {
  try {
    console.log("Testing GitHub API connection...");
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`Successfully authenticated as: ${user.login}`);
    console.log("Fetching repos...");
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      per_page: 5,
    });
    console.log(`Found ${repos.length} repositories`);
    repos.forEach((repo) => console.log(`- ${repo.full_name}`));
    console.log("Testing commit search...");
    const searchResult = await octokit.search.commits({
      q: `author:${GITHUB_USERNAME}`,
    });
    console.log(`Found ${searchResult.data.total_count} total commits`);
    return true;
  } catch (error) {
    console.error("GitHub API test failed:", error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response body:`, error.response.data);
    }
    return false;
  }
}

async function main() {
  await initDirs();
  const apiWorking = await testGitHubAPI();
  if (!apiWorking) {
    console.error(
      "GitHub API test failed. Please check your token and permissions."
    );
    return;
  }
  for (const period of PERIODS) {
    console.log(`Processing ${period.name}...`);
    const csvPath = path.join(
      DATA_DIR,
      `commits_${period.name.replace(/ /g, "_")}.csv`
    );
    const commits = await fetchCommits(period.start, period.end, csvPath);
    const metrics = computeMetrics(commits);
    await generateInteractiveHistograms(metrics, period.name);
  }
}

main().catch(console.error);
