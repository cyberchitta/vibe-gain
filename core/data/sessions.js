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
