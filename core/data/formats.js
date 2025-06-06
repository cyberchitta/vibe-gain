/**
 * Convert commit objects to compact array format
 * @param {Array} commits - Array of commit objects
 * @returns {Object} - Compact schema-based representation
 */
export function commitArrayFormat(commits) {
  const schema = [
    "repo",
    "sha",
    "date",
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
    commit.date,
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
