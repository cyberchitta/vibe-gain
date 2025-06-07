import { extractCommitIntervals } from "./clustering.js";

function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const group = item[key];
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

function uniq(array) {
  return [...new Set(array)];
}

function getCommitsPerDay(commits) {
  const commitsByDate = groupBy(commits, "date");
  return Object.entries(commitsByDate).map(([date, group]) => ({
    date,
    commits: group.length,
  }));
}

function getLinesOfCodePerDay(commits) {
  const commitsByDate = groupBy(commits, "date");
  return Object.entries(commitsByDate).map(([date, group]) => {
    const loc = group.reduce((sum, c) => sum + c.additions + c.deletions, 0);
    return { date, loc };
  });
}

function getRepositoriesPerDay(commits) {
  const commitsByDate = groupBy(commits, "date");
  return Object.entries(commitsByDate).map(([date, group]) => ({
    date,
    repos: uniq(group.map((c) => c.repo)).length,
  }));
}

function getHoursPerDay(commits) {
  const commitsByDate = groupBy(commits, "date");
  const hoursPerDay = [];
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
  }
  return hoursPerDay;
}

function getHourlyCommitDistribution(commits) {
  const hourlyCommits = {};
  commits.forEach((commit) => {
    const timestamp =
      commit.timestamp instanceof Date
        ? commit.timestamp.toISOString()
        : commit.timestamp;
    const hourKey = timestamp.slice(0, 13);
    hourlyCommits[hourKey] = (hourlyCommits[hourKey] || 0) + 1;
  });
  return Object.values(hourlyCommits);
}

function getCommitsByHourOfDay(commits) {
  const hourCounts = new Array(24).fill(0);
  commits.forEach((commit) => {
    const hour = new Date(commit.timestamp).getHours();
    hourCounts[hour]++;
  });
  return hourCounts;
}

function calculateMetadata(commits) {
  if (commits.length === 0) {
    return {
      total_commits: 0,
      active_days: 0,
      private_repo_percentage: 0,
      fork_percentage: 0,
      date_range: { start: null, end: null },
    };
  }
  const commitsByDate = groupBy(commits, "date");
  return {
    total_commits: commits.length,
    active_days: Object.keys(commitsByDate).length,
    private_repo_percentage:
      (commits.filter((c) => c.private).length / commits.length) * 100,
    fork_percentage:
      (commits.filter((c) => c.isFork).length / commits.length) * 100,
    date_range: {
      start: new Date(
        Math.min(...commits.map((c) => new Date(c.timestamp)))
      ).toISOString(),
      end: new Date(
        Math.max(...commits.map((c) => new Date(c.timestamp)))
      ).toISOString(),
    },
  };
}

function createEmptyVizData(type) {
  return {
    type,
    commits: [],
    loc: [],
    repos: [],
    hours: [],
    commit_intervals: [],
    hourly_commit_distribution: [],
    commits_by_hour_of_day: new Array(24).fill(0),
    metadata: {
      total_commits: 0,
      active_days: 0,
      private_repo_percentage: 0,
      fork_percentage: 0,
      date_range: { start: null, end: null },
    },
  };
}

/**
 * Compute visualization data from a specific set of commit data
 * @param {Array} commits - Array of commit objects
 * @param {string} type - Type identifier ('all', 'code', or 'doc')
 * @returns {Object} - Object containing various metrics for visualization
 */
export function computeVizDataForType(commits, type) {
  if (!commits || commits.length === 0) {
    return createEmptyVizData(type);
  }
  return {
    type,
    commits: getCommitsPerDay(commits),
    loc: getLinesOfCodePerDay(commits),
    repos: getRepositoriesPerDay(commits),
    hours: getHoursPerDay(commits),
    commit_intervals: extractCommitIntervals(commits),
    hourly_commit_distribution: getHourlyCommitDistribution(commits),
    commits_by_hour_of_day: getCommitsByHourOfDay(commits),
    metadata: calculateMetadata(commits),
  };
}

/**
 * Compute visualization data for all three categories: all commits, code commits, and doc commits
 * @param {Array} commits - Array of commit objects
 * @returns {Object} - Object containing visualization data for all three categories
 */
export function computeVizData(commits, fetchStats) {
  if (!commits || commits.length === 0) {
    return {
      all: { type: "all", metadata: { total_commits: 0 } },
      code: { type: "code", metadata: { total_commits: 0 } },
      doc: { type: "doc", metadata: { total_commits: 0 } },
      summary: {
        total_commits: 0,
        code_commits: 0,
        doc_commits: 0,
        doc_percentage: 0,
        total_repositories: 0,
      },
    };
  }
  const allCommits = commits;
  const codeCommits = commits.filter((c) => !c.isDocOnly);
  const docCommits = commits.filter((c) => c.isDocOnly);
  const allVizData = computeVizDataForType(allCommits, "all", fetchStats);
  const codeVizData = computeVizDataForType(codeCommits, "code", fetchStats);
  const docVizData = computeVizDataForType(docCommits, "doc", fetchStats);
  return {
    all: allVizData,
    code: codeVizData,
    doc: docVizData,
    summary: {
      total_commits: commits.length,
      code_commits: codeCommits.length,
      doc_commits: docCommits.length,
      doc_percentage: (docCommits.length / commits.length) * 100,
      total_repositories: new Set(commits.map((c) => c.repo)).size,
      missing_commits: fetchStats?.missingCommits || 0,
      expected_total_commits: fetchStats?.expectedTotalCount || commits.length,
      data_completeness_percentage: fetchStats?.expectedTotalCount
        ? (commits.length / fetchStats.expectedTotalCount) * 100
        : 100,
    },
  };
}

/**
 * Compute aggregate visualization data across all periods
 * @param {Array} allCommits - Array of all commit objects from all periods
 * @returns {Object} - Object containing aggregate visualization data for all three categories
 */
export function computeAggregateVizData(allCommits) {
  if (!allCommits || allCommits.length === 0) {
    return {
      all: { total_commits: 0 },
      code: { total_commits: 0 },
      doc: { total_commits: 0 },
      repository_stats: [],
    };
  }
  const codeCommits = allCommits.filter((c) => !c.isDocOnly);
  const docCommits = allCommits.filter((c) => c.isDocOnly);
  const commitsByRepo = {};
  allCommits.forEach((commit) => {
    if (!commitsByRepo[commit.repo]) {
      commitsByRepo[commit.repo] = [];
    }
    commitsByRepo[commit.repo].push(commit);
  });
  const repoStats = Object.entries(commitsByRepo).map(([repo, commits]) => {
    const activeDays = new Set(commits.map((c) => c.date)).size;
    const docOnlyCommits = commits.filter((c) => c.isDocOnly);
    const codeOnlyCommits = commits.filter((c) => !c.isDocOnly);
    return {
      repository: repo,
      commit_count: commits.length,
      active_days: activeDays,
      doc_only_commits: docOnlyCommits.length,
      code_commits: codeOnlyCommits.length,
      doc_percentage: (docOnlyCommits.length / commits.length) * 100,
      lines_changed: commits.reduce(
        (sum, c) => sum + c.additions + c.deletions,
        0
      ),
      is_private: commits[0].private,
      is_fork: commits[0].isFork,
    };
  });
  repoStats.sort((a, b) => b.commit_count - a.commit_count);
  function getVizDataForCommitSet(commits) {
    const activeDays = new Set(commits.map((c) => c.date)).size;
    return {
      total_commits: commits.length,
      total_active_days: activeDays,
      total_repositories: new Set(commits.map((c) => c.repo)).size,
      commits_per_active_day: activeDays > 0 ? commits.length / activeDays : 0,
      period_range:
        commits.length > 0
          ? {
              start: new Date(
                Math.min(...commits.map((c) => new Date(c.timestamp)))
              ).toISOString(),
              end: new Date(
                Math.max(...commits.map((c) => new Date(c.timestamp)))
              ).toISOString(),
            }
          : { start: null, end: null },
    };
  }
  return {
    all: getVizDataForCommitSet(allCommits),
    code: getVizDataForCommitSet(codeCommits),
    doc: getVizDataForCommitSet(docCommits),
    summary: {
      total_commits: allCommits.length,
      code_commits: codeCommits.length,
      doc_commits: docCommits.length,
      doc_percentage: (docCommits.length / allCommits.length) * 100,
    },
    repository_stats: repoStats,
  };
}

/**
 * Format visualization data for export
 * @param {Object} vizData - Visualization data object from computeVizData
 * @param {string} periodName - Name of the period
 * @returns {Object} - Formatted data for export
 */
export function formatVizDataForExport(vizData, periodName) {
  return {
    period_name: periodName,
    generated_at: new Date().toISOString(),
    viz_data: vizData,
  };
}
