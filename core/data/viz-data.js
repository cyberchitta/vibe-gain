import {
  getLocalCodingDay,
} from "../utils/timezone.js";

function createEmptyMetrics() {
  return {
    commits: [],
    loc: [],
    repos: [],
    coding_time: [],
    commit_intervals: [],
    hourly_commit_distribution: [],
    commits_by_hour_of_day: new Array(24).fill(0),
    session_time: [],
    sessions_per_day: [],
    session_durations: [],
    session_intervals: [],
    intra_session_intervals: [],
    summary: {
      total_commits: 0,
      total_active_days: 0,
      total_repositories: 0,
      commits_per_active_day: 0,
      median_loc_per_day: 0,
      median_repos_per_day: 0,
      median_coding_time_per_day: 0,
      median_session_time_per_day: 0,
      median_sessions_per_day: 0,
      median_session_duration: 0,
      private_repo_percentage: 0,
      fork_percentage: 0,
      total_lines_changed: 0,
      session_threshold_minutes: 45,
      date_range: { start: null, end: null },
    },
  };
}

export function computeVizData(commits, userConfig, fetchStats = {}) {
  if (!commits || commits.length === 0) {
    return createEmptyMetrics();
  }
  const builder = new MetricsBuilder(commits, userConfig);
  const metrics = builder.withEstimatedThreshold().build();
  return {
    ...metrics,
    summary: {
      ...metrics.summary,
      ...fetchStats,
    },
  };
}

export function computeAggregateVizData(allCommits, userConfig) {
  if (!allCommits || allCommits.length === 0) {
    return {
      summary: {
        total_commits: 0,
        total_repositories: 0,
      },
      repository_stats: [],
    };
  }
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
    return {
      repository: repo,
      commit_count: commits.length,
      active_days: activeDays,
      lines_changed: commits.reduce(
        (sum, c) => sum + c.additions + c.deletions,
        0
      ),
      is_private: commits[0].private,
      is_fork: commits[0].isFork,
    };
  });
  repoStats.sort((a, b) => b.commit_count - a.commit_count);
  const activeDays = new Set(
    allCommits.map((c) => getLocalCodingDay(c.timestamp, userConfig))
  ).size;
  return {
    summary: {
      total_commits: allCommits.length,
      total_active_days: activeDays,
      total_repositories: Object.keys(commitsByRepo).length,
      commits_per_active_day:
        activeDays > 0 ? allCommits.length / activeDays : 0,
      period_range:
        allCommits.length > 0
          ? {
              start: new Date(
                Math.min(...allCommits.map((c) => new Date(c.timestamp)))
              ).toISOString(),
              end: new Date(
                Math.max(...allCommits.map((c) => new Date(c.timestamp)))
              ).toISOString(),
            }
          : { start: null, end: null },
    },
    repository_stats: repoStats,
  };
}

export function formatVizDataForExport(vizData, periodName) {
  return {
    period_name: periodName,
    generated_at: new Date().toISOString(),
    viz_data: vizData,
  };
}
