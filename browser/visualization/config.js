export const CONFIG = {
  periods: ["Pre-AI", "Recent-AI"],
  colors: {
    "Pre-AI": "#ed8936", // orange-500
    "Recent-AI": "#48bb78", // green-500
  },
  metricPropertyMap: {
    commits: "commits",
    loc: "loc",
    hours: "hours",
    commits_per_hour: "commits_per_hour",
    time_between_commits: "time_between_commits",
    repos: "repos",
  },
  alternativePropertyMap: {
    time_between_commits: ["time_between_commits", "avg_time_between_commits"],
    commits_per_hour: ["commits_per_hour"],
  },
  axisLabels: {
    commits: "Commits per Day",
    loc: "Lines of Code",
    hours: "Hours",
    commits_per_hour: "Commits per Hour",
    time_between_commits: "Minutes Between Commits",
    repos: "Repositories",
  },
  viewOptions: {
    count: "Raw Counts",
    percentage: "Percentage",
  },
  defaultView: "count", // Options: "count", "percentage"
};
