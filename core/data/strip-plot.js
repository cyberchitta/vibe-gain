import {
  getLocalCodingDay,
  getLocalHourDecimal,
  toLocalTime,
} from "../utils/timezone.js";

export const SHAPE_NAMES = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "cross",
  "star",
  "pentagon",
];

export const SHAPE_DEFINITIONS = {
  circle: "M0,-5A5,5,0,1,1,0,5A5,5,0,1,1,0,-5Z",
  square: "M-4,-4L4,-4L4,4L-4,4Z",
  triangle: "M0,-5L4.33,2.5L-4.33,2.5Z",
  diamond: "M0,-5L4,0L0,5L-4,0Z",
  cross: "M-1,-5L1,-5L1,-1L5,-1L5,1L1,1L1,5L-1,5L-1,1L-5,1L-5,-1L-1,-1Z",
  star: "M0,-6L1.8,-1.8L6,0L1.8,1.8L0,6L-1.8,1.8L-6,0L-1.8,-1.8Z",
  pentagon: "M0,-6L5.7,-1.9L3.5,4.9L-3.5,4.9L-5.7,-1.9Z",
};

/**
 * Assign repositories to visual groups using commit rank order
 * @param {Array} repos - Array of repository names
 * @param {Array} commits - Array of commit objects (to calculate commit counts)
 * @param {number} groupCount - Number of groups to create
 * @returns {Object} - Object mapping repo names to group assignments
 */
export function assignRepositoryGroups(
  repos,
  commits,
  groupCount,
  options = {}
) {
  const { colorOffset, shapeOffset } = options;
  if (!repos || repos.length === 0) {
    return {};
  }
  const repoCommitCounts = {};
  commits.forEach((commit) => {
    repoCommitCounts[commit.repo] = (repoCommitCounts[commit.repo] || 0) + 1;
  });
  const uniqueRepos = [...new Set(repos)].sort(
    (a, b) => (repoCommitCounts[b] || 0) - (repoCommitCounts[a] || 0)
  );
  const groupAssignments = {};
  const shapeDefinitions = SHAPE_NAMES;
  uniqueRepos.forEach((repo, index) => {
    const groupId = (index + colorOffset) % groupCount;
    const shapeIndex = (index + shapeOffset) % shapeDefinitions.length;
    groupAssignments[repo] = {
      group: `group${groupId}`,
      groupIndex: groupId,
      shape: shapeDefinitions[shapeIndex],
      shapeIndex: shapeIndex,
      overallIndex: index,
    };
  });
  return groupAssignments;
}

/**
 * Prepare data for strip plot visualization
 * @param {Array} commits - Array of commit objects
 * @param {string} period - Period identifier (e.g., 'Pre-AI', 'Recent-AI')
 * @param {Object} options - Configuration options including userConfig
 * @returns {Object} - Formatted data for visualization
 */
export function prepareStripPlotData(commits, period, options = {}) {
  const groupCount = options.groupCount;
  const periodStart = options.periodStart;
  const periodEnd = options.periodEnd;
  const sessions = options.sessions;
  const userConfig = options.userConfig || {
    timezone_offset_hours: 0,
    day_cutoff: 4,
  };
  if (!commits || commits.length === 0) {
    return {
      commits: [],
      repositories: [],
      sessionMarkers: [],
      period: period,
      metadata: {
        totalCommits: 0,
        totalRepositories: 0,
        totalClusters: 0,
        periodRange:
          periodStart && periodEnd
            ? {
                start: new Date(periodStart),
                end: new Date(periodEnd),
              }
            : null,
      },
    };
  }
  const uniqueRepos = [...new Set(commits.map((c) => c.repo))];
  const repoGroupings = assignRepositoryGroups(
    uniqueRepos,
    commits,
    groupCount,
    options
  );
  const enhancedCommits = commits.map((commit) => {
    const timeOfDayDate = extractTimeOfDay(commit.timestamp, userConfig);
    const hourDecimal = getLocalHourDecimal(
      commit.timestamp,
      userConfig.timezone_offset_hours
    );
    return {
      ...commit,
      period: period,
      repoGroup: repoGroupings[commit.repo]?.group || "group0",
      repoShape: repoGroupings[commit.repo]?.shape || "circle",
      dayTimestamp: new Date(
        getLocalCodingDay(commit.timestamp, userConfig) + "T00:00:00Z"
      ),
      timeOfDay: timeOfDayDate,
      hourDecimal: hourDecimal,
      commitSize: (commit.additions || 0) + (commit.deletions || 0),
    };
  });
  const sessionMarkers = [];
  sessions.forEach((session, index) => {
    const startHour = getLocalHourDecimal(
      session.startTime,
      userConfig.timezone_offset_hours
    );
    const endHour = getLocalHourDecimal(
      session.endTime,
      userConfig.timezone_offset_hours
    );
    if (endHour < startHour) {
      console.log(
        `Session ${index} crosses midnight: ${startHour.toFixed(
          2
        )} -> ${endHour.toFixed(2)}`
      );
      const startDay = new Date(
        getLocalCodingDay(session.startTime, userConfig) + "T00:00:00Z"
      );
      const endDay = new Date(
        getLocalCodingDay(session.endTime, userConfig) + "T00:00:00Z"
      );
      sessionMarkers.push({
        sessionId: `${period}-${index}-part1`,
        isMultiCommit: true,
        startTime: session.startTime,
        endTime: new Date(startDay.getTime() + 24 * 60 * 60 * 1000),
        startHour: startHour,
        endHour: 24,
        dayTimestamp: startDay,
        commitCount: session.commitCount,
        duration: session.duration,
        period: period,
        isSplit: true,
        splitPart: 1,
      });
      sessionMarkers.push({
        sessionId: `${period}-${index}-part2`,
        isMultiCommit: true,
        startTime: endDay,
        endTime: session.endTime,
        startHour: 0,
        endHour: endHour,
        dayTimestamp: endDay,
        commitCount: session.commitCount,
        duration: session.duration,
        period: period,
        isSplit: true,
        splitPart: 2,
      });
    } else {
      sessionMarkers.push({
        sessionId: `${period}-${index}`,
        isMultiCommit: session.commitCount > 1,
        startTime: session.startTime,
        endTime: session.endTime,
        startHour: startHour,
        endHour: endHour,
        dayTimestamp: new Date(
          getLocalCodingDay(session.startTime, userConfig) + "T00:00:00Z"
        ),
        commitCount: session.commitCount,
        duration: session.duration,
        period: period,
        isSplit: false,
      });
    }
  });
  const repositoryMetadata = uniqueRepos.map((repo) => ({
    repo: repo,
    ...repoGroupings[repo],
    commitCount: commits.filter((c) => c.repo === repo).length,
    period: period,
  }));
  return {
    commits: enhancedCommits,
    repositories: repositoryMetadata,
    sessionMarkers: sessionMarkers,
    period: period,
    metadata: {
      totalCommits: commits.length,
      totalRepositories: uniqueRepos.length,
      periodRange:
        periodStart && periodEnd
          ? {
              start: new Date(periodStart),
              end: new Date(periodEnd),
            }
          : null,
      dateRange: {
        start: new Date(Math.min(...commits.map((c) => new Date(c.timestamp)))),
        end: new Date(Math.max(...commits.map((c) => new Date(c.timestamp)))),
      },
    },
  };
}

/**
 * Extract time of day component from timestamp for visualization
 * @param {string|Date} timestamp - Full timestamp
 * @param {Object} userConfig - User configuration with timezone info
 * @returns {Date} - Date object with time component normalized to 2000-01-01 in UTC
 */
function extractTimeOfDay(timestamp, userConfig) {
  const localTime = toLocalTime(timestamp, userConfig.timezone_offset_hours);
  const localHours = localTime.getUTCHours();
  const localMinutes = localTime.getUTCMinutes();
  const localSeconds = localTime.getUTCSeconds();
  const localMilliseconds = localTime.getUTCMilliseconds();
  return new Date(
    Date.UTC(
      2000,
      0,
      1,
      localHours,
      localMinutes,
      localSeconds,
      localMilliseconds
    )
  );
}
