import {
  getLocalCodingDay,
  getLocalHourDecimal,
  toLocalTime,
} from "../../core/utils/timezone.js";

export const SHAPE_NAMES = [
  "diamond",
  "cross",
  "square",
  "star",
  "triangle",
  "pentagon",
  "circle",
];

export const SHAPE_DEFINITIONS = {
  diamond: "M0,-5L4,0L0,5L-4,0Z",
  cross: "M-1,-5L1,-5L1,-1L5,-1L5,1L1,1L1,5L-1,5L-1,1L-5,1L-5,-1L-1,-1Z",
  square: "M-4,-4L4,-4L4,4L-4,4Z",
  star: "M0,-6L1.8,-1.8L6,0L1.8,1.8L0,6L-1.8,1.8L-6,0L-1.8,-1.8Z",
  triangle: "M0,-5L4.33,2.5L-4.33,2.5Z",
  pentagon: "M0,-6L5.7,-1.9L3.5,4.9L-3.5,4.9L-5.7,-1.9Z",
  circle: "M0,-5A5,5,0,1,1,0,5A5,5,0,1,1,0,-5Z",
};

export function sortReposByCommitCount(repos, commits) {
  const commitCounts = {};
  commits.forEach((commit) => {
    commitCounts[commit.repo] = (commitCounts[commit.repo] || 0) + 1;
  });
  return repos.sort((a, b) => (commitCounts[b] || 0) - (commitCounts[a] || 0));
}

export function organizeRepos(period1Repos, period2Repos) {
  const period1Set = new Set(period1Repos);
  const period2Set = new Set(period2Repos);
  const commonRepos = period1Repos.filter(repo => period2Set.has(repo));
  const uniquePeriod1Repos = period1Repos.filter(repo => !period2Set.has(repo));
  const uniquePeriod2Repos = period2Repos.filter(repo => !period1Set.has(repo));
  return [...commonRepos, ...uniquePeriod1Repos, ...uniquePeriod2Repos];
}

/**
 * Assign repositories to visual groups
 * @param {Array} repos - Array of repository names
 * @param {Array} commits - Array of commit objects (to calculate commit counts)
 * @returns {Object} - Object mapping repo names to group assignments
 */
export function assignRepositoryMarks(repos, options = {}) {
  const { colorOffset = 0, shapeOffset = 0 } = options;
  if (!repos || repos.length === 0) {
    return {};
  }
  const colors = generateMarkColors();
  const shapeDefinitions = SHAPE_NAMES;
  const markAssignments = {};
  repos.forEach((repo, index) => {
    const colorIndex = (index + colorOffset) % colors.length;
    const shapeIndex = (index + shapeOffset) % shapeDefinitions.length;
    markAssignments[repo] = {
      color: `color${colorIndex}`,
      colorIndex: colorIndex,
      shape: shapeDefinitions[shapeIndex],
      shapeIndex: shapeIndex,
      overallIndex: index,
    };
  });
  return markAssignments;
}

/**
 * Prepare data for strip plot visualization
 * @param {Array} commits - Array of commit objects
 * @param {string} period - Period identifier (e.g., 'Pre-AI', 'Recent-AI')
 * @param {Object} options - Configuration options including userConfig
 * @returns {Object} - Formatted data for visualization
 */
export function prepareStripPlotData(commits, period, options = {}) {
  const periodStart = options.periodStart;
  const periodEnd = options.periodEnd;
  const sessions = options.sessions;
  const userConfig = options.userConfig;
  const repositoryMarks = options.repositoryMarks;
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
  const enhancedCommits = commits.map((commit) => {
    const timeOfDayDate = extractTimeOfDay(commit.timestamp, userConfig);
    const hourDecimal = getLocalHourDecimal(
      commit.timestamp,
      userConfig.timezone_offset_hours
    );
    return {
      ...commit,
      period: period,
      repoColor: repositoryMarks[commit.repo]?.color,
      repoShape: repositoryMarks[commit.repo]?.shape,
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
  const uniqueRepos = [...new Set(commits.map((c) => c.repo))];
  const repositoryMetadata = uniqueRepos.map((repo) => ({
    repo: repo,
    ...repositoryMarks[repo],
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
 * Generate shape definitions for repositories
 * @returns {Array} - Array of SVG path strings for different shapes
 */
export function generateShapeDefinitions() {
  return SHAPE_NAMES.map((name) => SHAPE_DEFINITIONS[name]);
}

/**
 * Format timestamp to extract time of day component
 * @param {string|Date} timestamp - Full timestamp
 * @returns {string} - Formatted time string for visualization
 */
export function formatTimeOfDay(timestamp) {
  const date = new Date(timestamp);
  return date.toTimeString().split(" ")[0]; // Returns HH:MM:SS
}

/**
 * Calculate repository statistics from commits
 * @param {Array} commits - Array of commit objects
 * @returns {Object} - Repository statistics
 */
export function calculateRepositoryStats(commits) {
  if (!commits || commits.length === 0) {
    return {
      totalRepositories: 0,
      repositoryDistribution: {},
      mostActiveRepo: null,
      averageCommitsPerRepo: 0,
    };
  }
  const repoCommitCounts = {};
  commits.forEach((commit) => {
    if (!repoCommitCounts[commit.repo]) {
      repoCommitCounts[commit.repo] = 0;
    }
    repoCommitCounts[commit.repo]++;
  });
  const sortedRepos = Object.entries(repoCommitCounts).sort(
    ([, a], [, b]) => b - a
  );
  return {
    totalRepositories: Object.keys(repoCommitCounts).length,
    repositoryDistribution: repoCommitCounts,
    mostActiveRepo: sortedRepos[0] ? sortedRepos[0][0] : null,
    averageCommitsPerRepo:
      commits.length / Object.keys(repoCommitCounts).length,
    sortedRepositories: sortedRepos.map(([repo, count]) => ({ repo, count })),
  };
}

/**
 * Create time range for visualization scales
 * @param {Array} commits - Array of commits from all periods
 * @returns {Object} - Time range information
 */
export function createTimeRange(commits) {
  if (!commits || commits.length === 0) {
    return {
      dateRange: [new Date("2022-06-01"), new Date("2025-04-30")],
      timeRange: [
        new Date(2000, 0, 1, 0, 0, 0), // 00:00:00
        new Date(2000, 0, 1, 23, 59, 59), // 23:59:59
      ],
    };
  }
  const timestamps = commits.map((c) => new Date(c.timestamp));
  const dates = commits.map((c) => new Date(c.date));
  return {
    dateRange: [new Date(Math.min(...dates)), new Date(Math.max(...dates))],
    timeRange: [
      new Date(2000, 0, 1, 0, 0, 0), // Always use full 24-hour range
      new Date(2000, 0, 1, 23, 59, 59),
    ],
  };
}

/**
 * Generate color palette for repository groups
 * @returns {Array} - Array of color values
 */
export function generateMarkColors() {
  const universalColors = [
    "#1E88E5", // bright blue
    "#43A047", // bright green
    "#E53935", // bright red
    "#8E24AA", // bright purple
    "#FB8C00", // bright orange
    "#FFEB3B", // bright yellow
    "#00ACC1", // balanced cyan
    "#8D4E2A", // reddish brown
    "#BDBDBD", // light grey
  ];
  return universalColors;
}

/**
 * Filter commits by time range for focused analysis
 * @param {Array} commits - Array of commit objects
 * @param {Date} startTime - Start time (time of day)
 * @param {Date} endTime - End time (time of day)
 * @returns {Array} - Filtered commits
 */
export function filterCommitsByTimeRange(commits, startTime, endTime) {
  if (!commits || commits.length === 0) {
    return [];
  }
  return commits.filter((commit) => {
    const commitTime = new Date(commit.timestamp);
    const timeOfDay = commitTime.getHours() * 60 + commitTime.getMinutes();
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    return timeOfDay >= startMinutes && timeOfDay <= endMinutes;
  });
}

/**
 * Get color for a repository color id
 * @param {string} colorId - Color identifier (e.g., 'color0', 'color1')
 * @returns {string} - Color hex code
 */
function getColorForId(colorId) {
  const colors = generateMarkColors();
  const colorIndex = parseInt(colorId.replace("color", "")) || 0;
  return colors[colorIndex] || colors[0];
}

/**
 * Prepare periods data with raw commits for strip plot rendering
 * @param {Array} periodsRawData - Array of {period, commits, color} objects where commits is raw commit array
 * @param {string} targetPeriod - Name of the period to render
 * @param {Object} options - Options including periodConfigs, colorOffset, shapeOffset
 * @returns {Object} - Prepared strip plot data for the target period
 */
export function preparePeriodsForStripPlot(
  periodsRawData,
  targetPeriod,
  options = {}
) {
  const { periodConfigs, userConfig, repositoryMarks } = options;
  const periodData = periodsRawData.find((p) => p.period === targetPeriod);
  if (!periodData) {
    throw new Error(`Period "${targetPeriod}" not found in provided data`);
  }
  const config = periodConfigs[targetPeriod] || {};
  const stripPlotData = prepareStripPlotData(periodData.commits, targetPeriod, {
    sessions: periodData.sessions || [],
    periodStart: config.start,
    periodEnd: config.end,
    userConfig: userConfig,
    repositoryMarks: repositoryMarks,
  });
  return {
    period: targetPeriod,
    stripPlotData,
    color: periodData.color,
  };
}

/**
 * Prepare legend data for repository visualization
 * @param {Object} stripPlotData - Processed strip plot data
 * @param {Object} options - Legend options
 * @returns {Array} - Array of legend items sorted by commit count
 */
export function prepareLegendData(stripPlotData, options = {}) {
  const {
    sortBy = "commitCount",
    sortOrder = "desc",
    includePrivate = true,
    includeForks = true,
  } = options;
  return stripPlotData.repositories
    .filter((repo) => {
      if (!includePrivate && repo.isPrivate) return false;
      if (!includeForks && repo.isFork) return false;
      return true;
    })
    .sort((a, b) => {
      const order = sortOrder === "desc" ? -1 : 1;
      return order * (b[sortBy] - a[sortBy]);
    })
    .map((repo) => ({
      ...repo,
      color: getColorForId(repo.color),
      displayName: repo.repo.split("/").pop(),
      fullName: repo.repo,
    }));
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
