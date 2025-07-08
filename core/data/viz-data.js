import {
  getLocalCodingDay,
  getLocalHour,
  isSameCodingDay,
} from "../utils/timezone.js";
import { groupBy, uniq, calculateMedian } from "../utils/array.js";
import {
  extractBasicCommitIntervals,
  analyzeSessionsWithThreshold,
} from "./sessions.js";
import { determineSessionThreshold } from "./session-thresholds.js";

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

function processCommitSet(commits, type, userConfig) {
  if (!commits || commits.length === 0) {
    return createEmptyProcessedData(type);
  }
  const thresholdAnalysis = determineSessionThreshold(commits, userConfig);
  const sessionThreshold = thresholdAnalysis.threshold;
  const commitsByDay = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  const sessionAnalysis = analyzeSessionsWithThreshold(
    commits,
    userConfig,
    sessionThreshold
  );
  const dailyMetrics = Object.entries(commitsByDay).map(
    ([date, dayCommits]) => {
      const loc = dayCommits.reduce(
        (sum, c) => sum + c.additions + c.deletions,
        0
      );
      const repos = uniq(dayCommits.map((c) => c.repo)).length;
      const daySessionMetrics = sessionAnalysis.dailyMetrics.find(
        (d) => d.date === date
      );
      const sessionBasedCodingTime = daySessionMetrics
        ? daySessionMetrics.total_session_time
        : 0;
      const utcTimestamps = dayCommits
        .map((c) => new Date(c.timestamp).getTime())
        .sort((a, b) => a - b);
      const legacyCodingTime =
        utcTimestamps.length === 1
          ? 6
          : (utcTimestamps[utcTimestamps.length - 1] - utcTimestamps[0]) /
            (1000 * 60);
      return {
        date,
        commits: dayCommits.length,
        loc,
        repos,
        coding_time: legacyCodingTime,
        session_time: sessionBasedCodingTime,
        sessions_count: daySessionMetrics
          ? daySessionMetrics.sessions_count
          : 0,
      };
    }
  );
  const commitsPerDay = dailyMetrics.map((d) => d.commits);
  const locPerDay = dailyMetrics.map((d) => d.loc);
  const reposPerDay = dailyMetrics.map((d) => d.repos);
  const codingTimePerDay = dailyMetrics.map((d) => d.coding_time);
  const totalActiveDays = Object.keys(commitsByDay).length;
  const totalLinesChanged = commits.reduce(
    (sum, commit) => sum + (commit.additions || 0) + (commit.deletions || 0),
    0
  );
  return {
    type,
    commits: dailyMetrics.map((d) => ({ date: d.date, commits: d.commits })),
    loc: dailyMetrics.map((d) => ({ date: d.date, loc: d.loc })),
    repos: dailyMetrics.map((d) => ({ date: d.date, repos: d.repos })),
    coding_time: dailyMetrics.map((d) => ({
      date: d.date,
      coding_time: d.coding_time,
    })),
    session_time: dailyMetrics.map((d) => ({
      date: d.date,
      session_time: d.session_time,
    })),
    sessions_per_day: sessionAnalysis.metrics.sessions_per_day,
    session_durations: sessionAnalysis.metrics.session_durations,
    session_intervals: sessionAnalysis.metrics.session_intervals,
    intra_session_intervals: sessionAnalysis.metrics.intra_session_intervals,
    commit_intervals: extractBasicCommitIntervals(commits, userConfig),
    hourly_commit_distribution: getHourlyCommitDistribution(
      commits,
      userConfig
    ),
    commits_by_hour_of_day: getCommitsByHourOfDay(commits, userConfig),
    summary: {
      total_commits: commits.length,
      total_active_days: totalActiveDays,
      total_repositories: uniq(commits.map((c) => c.repo)).length,
      total_lines_changed: totalLinesChanged,
      commits_per_active_day: calculateMedian(commitsPerDay),
      median_loc_per_day: calculateMedian(locPerDay),
      median_repos_per_day: calculateMedian(reposPerDay),
      median_coding_time_per_day: calculateMedian(codingTimePerDay),
      median_session_time_per_day:
        sessionAnalysis.summary.median_session_time_per_day,
      median_sessions_per_day: sessionAnalysis.summary.median_sessions_per_day,
      median_session_duration: sessionAnalysis.summary.median_session_duration,
      session_threshold_minutes: sessionThreshold,
      session_threshold_analysis: thresholdAnalysis,
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

function createEmptyProcessedData(type) {
  return {
    type,
    commits: [],
    loc: [],
    repos: [],
    coding_time: [],
    session_time: [],
    sessions_per_day: [],
    session_durations: [],
    session_intervals: [],
    intra_session_intervals: [],
    commit_intervals: [],
    hourly_commit_distribution: [],
    commits_by_hour_of_day: new Array(24).fill(0),
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
      session_threshold_minutes: 45,
      session_threshold_analysis: null,
      private_repo_percentage: 0,
      fork_percentage: 0,
      date_range: { start: null, end: null },
    },
    metadata: {
      total_commits: 0,
      active_days: 0,
      session_threshold_minutes: 45,
      session_threshold_analysis: null,
      private_repo_percentage: 0,
      fork_percentage: 0,
      date_range: { start: null, end: null },
    },
  };
}

export function computeVizData(commits, userConfig, fetchStats = {}) {
  if (!commits || commits.length === 0) {
    return createEmptyVisualizationData();
  }
  const allCommits = commits;
  const codeCommits = commits.filter((c) => !c.isDocOnly);
  const docCommits = commits.filter((c) => c.isDocOnly);
  return {
    all: processCommitSet(allCommits, "all", userConfig),
    code: processCommitSet(codeCommits, "code", userConfig),
    doc: processCommitSet(docCommits, "doc", userConfig),
    summary: {
      total_commits: allCommits.length,
      code_commits: codeCommits.length,
      doc_commits: docCommits.length,
      doc_percentage:
        allCommits.length > 0
          ? (docCommits.length / allCommits.length) * 100
          : 0,
      total_repositories: uniq(allCommits.map((c) => c.repo)).length,
      ...fetchStats,
    },
  };
}

export function computeVizDataForType(commits, type, userConfig) {
  const fullData = computeVizData(commits, userConfig);
  return fullData[type];
}

function createEmptyVisualizationData() {
  return {
    all: createEmptyProcessedData("all"),
    code: createEmptyProcessedData("code"),
    doc: createEmptyProcessedData("doc"),
    summary: {
      total_commits: 0,
      code_commits: 0,
      doc_commits: 0,
      doc_percentage: 0,
      total_repositories: 0,
    },
  };
}

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

export function formatVizDataForExport(vizData, periodName) {
  return {
    period_name: periodName,
    generated_at: new Date().toISOString(),
    viz_data: vizData,
  };
}
