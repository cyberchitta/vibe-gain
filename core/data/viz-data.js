import _ from "lodash";
import {
  calculateTimeBetweenCommits,
  calculateGapsBetweenClusters,
} from "./clustering.js";

/**
 * Compute visualization data from a specific set of commit data
 * @param {Array} commits - Array of commit objects
 * @param {number} clusterThresholdMinutes - Threshold for clustering commits in minutes
 * @param {string} type - Type identifier ('all', 'code', or 'doc')
 * @returns {Object} - Object containing various metrics for visualization
 */
export function computeVizDataForType(commits, clusterThresholdMinutes, type) {
  if (!commits || commits.length === 0) {
    return {
      type,
      commits: [],
      loc: [],
      repos: [],
      hours: [],
      gaps: [],
      commits_per_hour: [],
      time_between_commits: [],
      metadata: {
        total_commits: 0,
        active_days: 0,
        private_repo_percentage: 0,
        fork_percentage: 0,
        date_range: { start: null, end: null },
      },
    };
  }
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
    const avgGap = calculateGapsBetweenClusters(
      timestamps,
      clusterThresholdMinutes
    );
    gapsPerDay.push({ date, avg_gap_minutes: avgGap });
    const avgInterval = calculateTimeBetweenCommits(timestamps);
    timeBetweenCommits.push({ date, avg_time_between_commits: avgInterval });
  }
  return {
    type,
    commits: commitsPerDay,
    loc: locPerDay,
    repos: reposPerDay,
    hours: hoursPerDay,
    gaps: gapsPerDay,
    commits_per_hour: commitsPerHour,
    time_between_commits: timeBetweenCommits,
    metadata: {
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
    },
  };
}

/**
 * Compute visualization data for all three categories: all commits, code commits, and doc commits
 * @param {Array} commits - Array of commit objects
 * @param {number} clusterThresholdMinutes - Threshold for clustering commits in minutes
 * @returns {Object} - Object containing visualization data for all three categories
 */
export function computeVizData(commits, clusterThresholdMinutes) {
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
  const allVizData = computeVizDataForType(
    allCommits,
    clusterThresholdMinutes,
    "all"
  );
  const codeVizData = computeVizDataForType(
    codeCommits,
    clusterThresholdMinutes,
    "code"
  );
  const docVizData = computeVizDataForType(
    docCommits,
    clusterThresholdMinutes,
    "doc"
  );
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
