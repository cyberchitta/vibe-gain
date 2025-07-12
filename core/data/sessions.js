import { getLocalCodingDay, isSameCodingDay } from "../utils/timezone.js";
import { groupBy, uniq, calculateMedian } from "../utils/array.js";

/**
 * Extract basic commit intervals (time between consecutive commits within same day)
 * @param {Array} commits - Array of commit objects
 * @param {Object} userConfig - User configuration
 * @returns {Array} - Array of interval objects
 */
export function extractBasicCommitIntervals(commits, userConfig) {
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

/**
 * Detect coding sessions within daily commits using configurable threshold
 * @param {Array} commits - Array of commit objects for a single day
 * @param {number} sessionThresholdMinutes - Minutes gap to consider new session
 * @returns {Array} - Array of session objects with start/end times and commits
 */
export function detectCodingSessions(commits, sessionThresholdMinutes) {
  if (!commits || commits.length === 0) return [];
  const sortedCommits = [...commits].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const sessions = [];
  let currentSession = {
    commits: [sortedCommits[0]],
    startTime: new Date(sortedCommits[0].timestamp),
    endTime: new Date(sortedCommits[0].timestamp),
  };
  for (let i = 1; i < sortedCommits.length; i++) {
    const prevTime = new Date(sortedCommits[i - 1].timestamp);
    const currTime = new Date(sortedCommits[i].timestamp);
    const gapMinutes = (currTime - prevTime) / (1000 * 60);
    if (gapMinutes <= sessionThresholdMinutes) {
      currentSession.commits.push(sortedCommits[i]);
      currentSession.endTime = currTime;
    } else {
      sessions.push(currentSession);
      currentSession = {
        commits: [sortedCommits[i]],
        startTime: currTime,
        endTime: currTime,
      };
    }
  }
  sessions.push(currentSession);
  return sessions.map((session, index) => ({
    sessionIndex: index,
    startTime: session.startTime,
    endTime: session.endTime,
    duration: (session.endTime - session.startTime) / (1000 * 60),
    commitCount: session.commits.length,
    commits: session.commits,
    repositories: uniq(session.commits.map((c) => c.repo)),
    repoCount: uniq(session.commits.map((c) => c.repo)).length,
    linesChanged: session.commits.reduce(
      (sum, c) => sum + c.additions + c.deletions,
      0
    ),
    locPerSession: session.commits.reduce(
      (sum, c) => sum + c.additions + c.deletions,
      0
    ),
  }));
}

/**
 * Extract intra-session commit intervals (within sessions only)
 * @param {Array} commits - Array of commit objects
 * @param {Object} userConfig - User configuration
 * @param {number} sessionThresholdMinutes - Session boundary threshold
 * @returns {Array} - Array of intra-session interval objects
 */
export function extractIntraSessionIntervals(
  commits,
  userConfig,
  sessionThresholdMinutes
) {
  if (!commits || commits.length < 2) return [];
  const commitsByDay = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  const dailyIntervals = [];
  Object.entries(commitsByDay).forEach(([date, dayCommits]) => {
    const sessions = detectCodingSessions(dayCommits, sessionThresholdMinutes);
    sessions.forEach((session, sessionIndex) => {
      if (session.commits.length < 2) return;
      for (let i = 1; i < session.commits.length; i++) {
        const prevCommit = session.commits[i - 1];
        const currCommit = session.commits[i];
        const prevTime = new Date(prevCommit.timestamp).getTime();
        const currTime = new Date(currCommit.timestamp).getTime();
        const intervalMinutes = (currTime - prevTime) / (1000 * 60);
        dailyIntervals.push({
          date,
          interval_minutes: intervalMinutes,
          sessionIndex,
          from_commit: prevCommit.sha,
          to_commit: currCommit.sha,
          from_repo: prevCommit.repo,
          to_repo: currCommit.repo,
          same_repo: prevCommit.repo === currCommit.repo,
          session_commit_position: i,
          session_total_commits: session.commits.length,
        });
      }
    });
  });
  return dailyIntervals;
}

/**
 * Calculate comprehensive session metrics using explicit threshold
 * @param {Array} commits - Array of commit objects
 * @param {Object} userConfig - User configuration
 * @param {number} sessionThresholdMinutes - Session boundary threshold
 * @returns {Object} - Complete session metrics
 */
export function calculateSessionMetrics(
  commits,
  userConfig,
  sessionThresholdMinutes
) {
  if (!commits || commits.length === 0) {
    return {
      sessions_per_day: [],
      session_durations: [],
      total_session_time_per_day: [],
      session_intervals: [],
      loc_per_session: [],
      commits_per_session: [],
      daily_session_metrics: [],
    };
  }
  const commitsByDay = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  const dailySessionMetrics = [];
  const allSessionDurations = [];
  const allSessionIntervals = [];
  const allLocPerSession = [];
  const allCommitsPerSession = [];
  Object.entries(commitsByDay).forEach(([date, dayCommits]) => {
    const sessions = detectCodingSessions(dayCommits, sessionThresholdMinutes);
    const sessionsCount = sessions.length;
    const sessionDurations = sessions.map((s) => s.duration);
    const sessionLocCounts = sessions.map((s) => s.locPerSession);
    const sessionCommitCounts = sessions.map((s) => s.commitCount);
    const totalSessionTime = sessionDurations.reduce(
      (sum, duration) => sum + duration,
      0
    );
    const sessionIntervals = [];
    for (let i = 1; i < sessions.length; i++) {
      const gapMinutes =
        (sessions[i].startTime - sessions[i - 1].endTime) / (1000 * 60);
      sessionIntervals.push(gapMinutes);
    }
    dailySessionMetrics.push({
      date,
      sessions_count: sessionsCount,
      total_session_time: totalSessionTime,
      avg_session_duration:
        sessionDurations.length > 0
          ? sessionDurations.reduce((sum, d) => sum + d, 0) /
            sessionDurations.length
          : 0,
      max_session_duration:
        sessionDurations.length > 0 ? Math.max(...sessionDurations) : 0,
    });
    allSessionDurations.push(...sessionDurations);
    allSessionIntervals.push(...sessionIntervals);
    allLocPerSession.push(...sessionLocCounts);
    allCommitsPerSession.push(...sessionCommitCounts);
  });
  return {
    sessions_per_day: dailySessionMetrics.map((d) => ({
      date: d.date,
      sessions_count: d.sessions_count,
    })),
    session_durations: allSessionDurations,
    total_session_time_per_day: dailySessionMetrics.map((d) => ({
      date: d.date,
      total_session_time: d.total_session_time,
    })),
    session_intervals: allSessionIntervals,
    loc_per_session: allLocPerSession,
    commits_per_session: allCommitsPerSession,
    daily_session_metrics: dailySessionMetrics,
  };
}

/**
 * Comprehensive session analysis with explicit threshold
 * @param {Array} commits - Array of commit objects
 * @param {Object} userConfig - User configuration
 * @param {number} sessionThresholdMinutes - Session boundary threshold
 * @returns {Object} - Complete session analysis results
 */
export function analyzeSessionsWithThreshold(
  commits,
  userConfig,
  sessionThresholdMinutes
) {
  const metrics = calculateSessionMetrics(
    commits,
    userConfig,
    sessionThresholdMinutes
  );
  const intraSessionIntervals = extractIntraSessionIntervals(
    commits,
    userConfig,
    sessionThresholdMinutes
  ).map((interval) => interval.interval_minutes);
  const medianIntraSessionInterval = calculateMedian(intraSessionIntervals);
  const adjustedDailyMetrics = metrics.daily_session_metrics.map(
    (dayMetric) => {
      const currentSessionTime = dayMetric.total_session_time;
      const adjustment = dayMetric.sessions_count * medianIntraSessionInterval;
      const adjustedSessionTime = currentSessionTime + adjustment;
      return {
        ...dayMetric,
        total_session_time: adjustedSessionTime,
        session_time_adjustment: adjustment,
        original_session_time: currentSessionTime,
      };
    }
  );
  return {
    threshold: sessionThresholdMinutes,
    metrics: {
      sessions_per_day: metrics.sessions_per_day.map((d) => d.sessions_count),
      session_durations: metrics.session_durations,
      session_time: adjustedDailyMetrics.map((d) => d.total_session_time),
      session_intervals: metrics.session_intervals,
      loc_per_session: metrics.loc_per_session,
      commits_per_session: metrics.commits_per_session,
      intra_session_intervals: intraSessionIntervals,
    },
    dailyMetrics: adjustedDailyMetrics,
    summary: {
      total_sessions: metrics.session_durations.length,
      median_session_duration: calculateMedian(metrics.session_durations),
      median_sessions_per_day: calculateMedian(
        metrics.sessions_per_day.map((d) => d.sessions_count)
      ),
      median_session_time_per_day: calculateMedian(
        adjustedDailyMetrics.map((d) => d.total_session_time)
      ),
      median_inter_session_interval: calculateMedian(metrics.session_intervals),
      median_loc_per_session: calculateMedian(metrics.loc_per_session),
      median_commits_per_session: calculateMedian(metrics.commits_per_session),
      median_intra_session_interval: medianIntraSessionInterval,
      session_time_adjustment_per_day: calculateMedian(
        adjustedDailyMetrics.map((d) => d.session_time_adjustment)
      ),
    },
  };
}
