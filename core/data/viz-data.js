import {
  getLocalCodingDay,
  getLocalHour,
  isSameCodingDay,
} from "../utils/timezone.js";

function groupBy(array, keyOrFn) {
  return array.reduce((groups, item) => {
    const group = typeof keyOrFn === "function" ? keyOrFn(item) : item[keyOrFn];
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

function uniq(array) {
  return [...new Set(array)];
}

/**
 * Extract all individual time intervals between consecutive commits within same coding day
 * @param {Array} commits - Array of commit objects with timestamp property
 * @param {Object} userConfig - User configuration with timezone info
 * @returns {Array} - Array of interval objects with time differences in minutes
 */
export function extractCommitIntervals(commits, userConfig) {
  if (!commits || commits.length < 2) {
    return [];
  }
  const sortedCommits = [...commits].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const intervals = [];
  for (let i = 1; i < sortedCommits.length; i++) {
    const prevCommit = sortedCommits[i - 1];
    const currCommit = sortedCommits[i];
    if (
      !isSameCodingDay(prevCommit.timestamp, currCommit.timestamp, userConfig)
    ) {
      continue;
    }
    const prevTime = new Date(prevCommit.timestamp).getTime();
    const currTime = new Date(currCommit.timestamp).getTime();
    const intervalMinutes = (currTime - prevTime) / (1000 * 60);
    intervals.push({
      date: getLocalCodingDay(currCommit.timestamp, userConfig),
      interval_minutes: intervalMinutes,
      from_commit: prevCommit.sha,
      to_commit: currCommit.sha,
      from_repo: prevCommit.repo,
      to_repo: currCommit.repo,
      same_repo: prevCommit.repo === currCommit.repo,
      cross_day: false,
    });
  }
  return intervals;
}

function getCommitsPerDay(commits, userConfig) {
  const commitsByDate = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  return Object.entries(commitsByDate).map(([date, group]) => ({
    date,
    commits: group.length,
  }));
}

function getLinesOfCodePerDay(commits, userConfig) {
  const commitsByDate = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  return Object.entries(commitsByDate).map(([date, group]) => {
    const loc = group.reduce((sum, c) => sum + c.additions + c.deletions, 0);
    return { date, loc };
  });
}

function getRepositoriesPerDay(commits, userConfig) {
  const commitsByDate = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  return Object.entries(commitsByDate).map(([date, group]) => ({
    date,
    repos: uniq(group.map((c) => c.repo)).length,
  }));
}

function getCodingTime(commits, userConfig) {
  const commitsByDate = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  const codingTimeData = [];
  for (const [date, group] of Object.entries(commitsByDate)) {
    const utcTimestamps = group
      .map((c) => new Date(c.timestamp).getTime())
      .sort((a, b) => a - b);
    let minutes;
    if (utcTimestamps.length === 1) {
      minutes = 6;
    } else {
      const timeDiff =
        (utcTimestamps[utcTimestamps.length - 1] - utcTimestamps[0]) /
        (1000 * 60);
      minutes = timeDiff;
    }
    codingTimeData.push({ date, coding_time: minutes });
  }
  return codingTimeData;
}

function getHourlyCommitDistribution(commits, userConfig) {
  const hourlyCommits = {};
  commits.forEach((commit) => {
    const localCodingDay = getLocalCodingDay(commit.timestamp, userConfig);
    const localHour = getLocalHour(
      commit.timestamp,
      userConfig.timezone_offset_hours
    );
    const hourKey = `${localCodingDay}T${localHour
      .toString()
      .padStart(2, "0")}`;
    hourlyCommits[hourKey] = (hourlyCommits[hourKey] || 0) + 1;
  });
  return Object.values(hourlyCommits);
}

function getCommitsByHourOfDay(commits, userConfig) {
  const hourCounts = new Array(24).fill(0);
  commits.forEach((commit) => {
    const localHour = getLocalHour(
      commit.timestamp,
      userConfig.timezone_offset_hours
    );
    hourCounts[localHour]++;
  });
  return hourCounts;
}

function calculateMetadata(commits, userConfig) {
  if (commits.length === 0) {
    return {
      total_commits: 0,
      active_days: 0,
      private_repo_percentage: 0,
      fork_percentage: 0,
      date_range: { start: null, end: null },
    };
  }
  const commitsByDate = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
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
    coding_time: [],
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
 * @param {Object} userConfig - User configuration with timezone info
 * @returns {Object} - Object containing various metrics for visualization
 */
export function computeVizDataForType(commits, type, userConfig) {
  if (!commits || commits.length === 0) {
    return createEmptyVizData(type);
  }
  return {
    type,
    commits: getCommitsPerDay(commits, userConfig),
    loc: getLinesOfCodePerDay(commits, userConfig),
    repos: getRepositoriesPerDay(commits, userConfig),
    coding_time: getCodingTime(commits, userConfig),
    commit_intervals: extractCommitIntervals(commits, userConfig),
    hourly_commit_distribution: getHourlyCommitDistribution(
      commits,
      userConfig
    ),
    commits_by_hour_of_day: getCommitsByHourOfDay(commits, userConfig),
    metadata: calculateMetadata(commits, userConfig),
  };
}

/**
 * Compute visualization data for all three categories
 * @param {Array} commits - Array of commit objects
 * @param {Object} userConfig - User configuration with timezone info
 * @param {Object} fetchStats - Optional fetch statistics
 * @returns {Object} - Object containing visualization data for all three categories
 */
export function computeVizData(commits, userConfig, fetchStats) {
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
  const allVizData = computeVizDataForType(allCommits, "all", userConfig);
  const codeVizData = computeVizDataForType(codeCommits, "code", userConfig);
  const docVizData = computeVizDataForType(docCommits, "doc", userConfig);
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
 * @param {Object} userConfig - User configuration with timezone info
 * @returns {Object} - Object containing aggregate visualization data for all three categories
 */
export function computeAggregateVizData(allCommits, userConfig) {
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
    const activeDays = new Set(
      commits.map((c) => getLocalCodingDay(c.timestamp, userConfig))
    ).size;
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
    const activeDays = new Set(
      commits.map((c) => getLocalCodingDay(c.timestamp, userConfig))
    ).size;
    let medianCommitsPerDay = 0;
    if (activeDays > 0) {
      const sortedCounts = dailyCommitCounts.sort((a, b) => a - b);
      medianCommitsPerDay =
        sortedCounts.length % 2 === 0
          ? (sortedCounts[sortedCounts.length / 2 - 1] +
              sortedCounts[sortedCounts.length / 2]) /
            2
          : sortedCounts[Math.floor(sortedCounts.length / 2)];
    }
    return {
      total_commits: commits.length,
      total_active_days: activeDays,
      total_repositories: new Set(commits.map((c) => c.repo)).size,
      commits_per_active_day: medianCommitsPerDay,
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
