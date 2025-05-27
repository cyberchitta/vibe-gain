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
