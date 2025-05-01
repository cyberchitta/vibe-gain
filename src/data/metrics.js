const _ = require("lodash");

/**
 * Compute metrics from commit data
 * @param {Array} commits - Array of commit objects
 * @param {number} clusterThresholdMinutes - Threshold for clustering commits in minutes
 * @returns {Object} - Object containing various metrics
 */
function computeMetrics(commits, clusterThresholdMinutes) {
  const docOnlyCommits = commits.filter((c) => c.isDocOnly);
  const codeCommits = commits.filter((c) => !c.isDocOnly);
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
    commits: commitsPerDay,
    loc: locPerDay,
    repos: reposPerDay,
    hours: hoursPerDay,
    gaps: gapsPerDay,
    commits_per_hour: commitsPerHour,
    time_between_commits: timeBetweenCommits,
    doc_commits: Object.entries(_.groupBy(docOnlyCommits, "date")).map(
      ([date, group]) => ({
        date,
        commits: group.length,
      })
    ),
    doc_percentage: (docOnlyCommits.length / commits.length) * 100,
    metadata: {
      total_commits: commits.length,
      active_days: Object.keys(commitsByDate).length,
      private_repo_percentage:
        (commits.filter((c) => c.private).length / commits.length) * 100,
      fork_percentage:
        (commits.filter((c) => c.isFork).length / commits.length) * 100,
      date_range: {
        start:
          commits.length > 0
            ? new Date(
                Math.min(...commits.map((c) => new Date(c.timestamp)))
              ).toISOString()
            : null,
        end:
          commits.length > 0
            ? new Date(
                Math.max(...commits.map((c) => new Date(c.timestamp)))
              ).toISOString()
            : null,
      },
      total_doc_commits: docOnlyCommits.length,
      total_code_commits: codeCommits.length,
      doc_percentage: (docOnlyCommits.length / commits.length) * 100,
    },
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

module.exports = {
  computeMetrics,
  formatMetricsForExport,
};
