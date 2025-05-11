import _ from "lodash";

/**
 * Compute metrics from a specific set of commit data
 * @param {Array} commits - Array of commit objects
 * @param {number} clusterThresholdMinutes - Threshold for clustering commits in minutes
 * @param {string} type - Type identifier ('all', 'code', or 'doc')
 * @returns {Object} - Object containing various metrics
 */
function computeMetricsForType(commits, clusterThresholdMinutes, type) {
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
    if (timestamps.length <= 1) {
      gapsPerDay.push({ date, avg_gap_minutes: 0 });
    } else {
      const clusters = [];
      let currentCluster = [timestamps[0]];
      for (let i = 1; i < timestamps.length; i++) {
        const timeDiff = (timestamps[i] - timestamps[i - 1]) / (1000 * 60);
        if (timeDiff <= clusterThresholdMinutes) {
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
 * Compute metrics for all three categories: all commits, code commits, and doc commits
 * @param {Array} commits - Array of commit objects
 * @param {number} clusterThresholdMinutes - Threshold for clustering commits in minutes
 * @returns {Object} - Object containing metrics for all three categories
 */
function computeMetrics(commits, clusterThresholdMinutes) {
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
  const allMetrics = computeMetricsForType(
    allCommits,
    clusterThresholdMinutes,
    "all"
  );
  const codeMetrics = computeMetricsForType(
    codeCommits,
    clusterThresholdMinutes,
    "code"
  );
  const docMetrics = computeMetricsForType(
    docCommits,
    clusterThresholdMinutes,
    "doc"
  );
  return {
    all: allMetrics,
    code: codeMetrics,
    doc: docMetrics,
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
 * Compute aggregate metrics across all periods
 * @param {Array} allCommits - Array of all commit objects from all periods
 * @returns {Object} - Object containing aggregate metrics for all three categories
 */
function computeAggregateMetrics(allCommits) {
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
  function getMetricsForCommitSet(commits) {
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
    all: getMetricsForCommitSet(allCommits),
    code: getMetricsForCommitSet(codeCommits),
    doc: getMetricsForCommitSet(docCommits),
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
 * Export metrics as JSON
 * @param {Object} metrics - Metrics object from computeMetrics
 * @param {string} periodName - Name of the period
 * @returns {Object} - Formatted data for export
 */
function formatMetricsForExport(metrics, periodName) {
  return {
    period_name: periodName,
    generated_at: new Date().toISOString(),
    metrics,
  };
}

export {
  computeMetrics,
  computeAggregateMetrics,
  formatMetricsForExport,
};
