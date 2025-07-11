/**
 * Convert commit objects to compact array format
 * @param {Array} commits - Array of commit objects
 * @returns {Object} - Compact schema-based representation
 */
export function commitArrayFormat(commits) {
  const schema = [
    "repo",
    "sha",
    "timestamp",
    "additions",
    "deletions",
    "filesChanged",
    "private",
    "isFork",
    "isDocOnly",
  ];
  const data = commits.map((commit) => [
    commit.repo,
    commit.sha,
    typeof commit.timestamp === "string"
      ? commit.timestamp
      : commit.timestamp.toISOString(),
    commit.additions,
    commit.deletions,
    commit.filesChanged,
    commit.private,
    commit.isFork,
    commit.isDocOnly,
  ]);
  return { schema, data };
}

/**
 * Convert compact array format back to commit objects
 * @param {Object} arrayFormat - Compact schema-based representation
 * @returns {Array} - Array of commit objects
 */
export function arrayFormatToCommits(arrayFormat) {
  const { schema, data } = arrayFormat;
  return data.map((row) => {
    const commit = {};
    row.forEach((value, index) => {
      commit[schema[index]] = value;
    });
    if (commit.timestamp && typeof commit.timestamp === "string") {
      commit.timestamp = new Date(commit.timestamp);
    }
    return commit;
  });
}

/**
 * Extract numeric values from metric data for analysis
 * @param {Array} metricData - Array of metric data (objects or numbers)
 * @param {string} metricId - Metric identifier
 * @returns {Array} - Array of positive numeric values
 */
export function extractValues(metricData, metricId) {
  if (!Array.isArray(metricData)) return [];
  if (metricData.length > 0 && typeof metricData[0] === "number") {
    return metricData.filter((val) => val !== null && !isNaN(val) && val > 0);
  }
  const values = [];
  metricData.forEach((item) => {
    let value = null;
    if (
      (metricId === "commit_intervals" ||
        metricId === "intra_session_intervals") &&
      item.interval_minutes !== undefined
    ) {
      value = item.interval_minutes;
    } else if (
      metricId === "sessions_per_day" &&
      item.sessions_count !== undefined
    ) {
      value = item.sessions_count;
    } else if (metricId === "session_time" && item.session_time !== undefined) {
      value = item.session_time;
    } else if (metricId === "active_hours" && item.active_hours !== undefined) {
      value = item.active_hours;
    } else if (
      metricId === "commits_per_hour" &&
      item.commits_per_hour !== undefined
    ) {
      value = item.commits_per_hour;
    } else if (metricId === "gaps" && item.avg_gap_minutes !== undefined) {
      value = item.avg_gap_minutes;
    } else if (item[metricId] !== undefined) {
      value = item[metricId];
    }
    if (value !== null && !isNaN(value) && value > 0) {
      values.push(value);
    }
  });
  return values;
}
