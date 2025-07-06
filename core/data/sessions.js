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
export function detectCodingSessions(commits, sessionThresholdMinutes = 45) {
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
  sessionThresholdMinutes = 45
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
 * Calculate session-based metrics for a set of commits
 * @param {Array} commits - Array of commit objects
 * @param {Object} userConfig - User configuration
 * @param {number} sessionThresholdMinutes - Session boundary threshold
 * @returns {Object} - Session metrics
 */
export function calculateSessionMetrics(
  commits,
  userConfig,
  sessionThresholdMinutes = 45
) {
  if (!commits || commits.length === 0) {
    return {
      sessions_per_day: [],
      session_durations: [],
      total_session_time_per_day: [],
      session_commit_intensity: [],
      session_intervals: [],
      daily_session_metrics: [],
    };
  }
  const commitsByDay = groupBy(commits, (commit) =>
    getLocalCodingDay(commit.timestamp, userConfig)
  );
  const dailySessionMetrics = [];
  const allSessionDurations = [];
  const allSessionIntensities = [];
  const allSessionIntervals = [];
  Object.entries(commitsByDay).forEach(([date, dayCommits]) => {
    const sessions = detectCodingSessions(dayCommits, sessionThresholdMinutes);
    const sessionsCount = sessions.length;
    const sessionDurations = sessions.map((s) => s.duration);
    const totalSessionTime = sessionDurations.reduce(
      (sum, duration) => sum + duration,
      0
    );
    const sessionIntensities = sessions
      .filter((s) => s.duration > 0)
      .map((s) => s.commitCount / (s.duration / 60));
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
      avg_session_intensity:
        sessionIntensities.length > 0
          ? sessionIntensities.reduce((sum, i) => sum + i, 0) /
            sessionIntensities.length
          : 0,
    });
    allSessionDurations.push(...sessionDurations);
    allSessionIntensities.push(...sessionIntensities);
    allSessionIntervals.push(...sessionIntervals);
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
    session_commit_intensity: allSessionIntensities,
    session_intervals: allSessionIntervals,
    daily_session_metrics: dailySessionMetrics,
  };
}

/**
 * Validate session detection quality
 * @param {Array} sessions - Detected sessions
 * @param {number} threshold - Threshold used for detection
 * @returns {Object} - Validation metrics
 */
export function validateSessionDetection(sessions, threshold) {
  if (!sessions || sessions.length === 0) {
    return {
      threshold,
      totalSessions: 0,
      quality: 0,
      avgSessionLength: 0,
      warnings: ["No sessions detected"],
    };
  }
  const sessionLengths = sessions.map((s) => s.duration);
  const tooShort = sessionLengths.filter((l) => l < 5).length; // < 5 minutes
  const tooLong = sessionLengths.filter((l) => l > 480).length; // > 8 hours
  const reasonable = sessionLengths.filter((l) => l >= 5 && l <= 480).length;
  const warnings = [];
  if (tooShort / sessions.length > 0.3) {
    warnings.push(
      `${Math.round(
        (tooShort / sessions.length) * 100
      )}% of sessions are very short (< 5 min)`
    );
  }
  if (tooLong > 0) {
    warnings.push(`${tooLong} sessions are unusually long (> 8 hours)`);
  }
  if (reasonable / sessions.length < 0.5) {
    warnings.push(
      "Low quality: Less than 50% of sessions are reasonable length"
    );
  }
  return {
    threshold,
    totalSessions: sessions.length,
    reasonableSessions: reasonable,
    tooShort,
    tooLong,
    quality: reasonable / sessions.length,
    avgSessionLength:
      sessionLengths.reduce((sum, l) => sum + l, 0) / sessionLengths.length,
    medianSessionLength: calculateMedian(sessionLengths),
    warnings,
  };
}
