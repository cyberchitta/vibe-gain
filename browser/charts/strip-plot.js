import { SHAPE_NAMES, SHAPE_DEFINITIONS } from "../../core/data/strip-plot.js";
import { prepareStripPlotData } from "../../core/data/strip-plot.js";

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
 * @param {number} groupCount - Number of groups
 * @returns {Array} - Array of color values
 */
export function generateGroupColors(groupCount = 9) {
  const universalColors = [
    "#1E88E5", // bright blue
    "#43A047", // bright green
    "#FB8C00", // bright orange
    "#E53935", // bright red
    "#8E24AA", // bright purple
    "#00ACC1", // bright teal
    "#FDD835", // bright yellow
    "#D81B60", // bright pink
    "#6D4C41", // brown
  ];
  return universalColors.slice(0, groupCount);
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
 * Get color for a repository group
 * @param {string} groupId - Group identifier (e.g., 'group0', 'group1')
 * @returns {string} - Color hex code
 */
function getColorForGroup(groupId) {
  const colors = generateGroupColors(9);
  const groupIndex = parseInt(groupId.replace("group", "")) || 0;
  return colors[groupIndex] || colors[0];
}

// In browser/charts/strip-plot.js, add:

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
  const { periodConfigs, userConfig, colorOffset, shapeOffset } = options;
  const periodData = periodsRawData.find((p) => p.period === targetPeriod);
  if (!periodData) {
    throw new Error(`Period "${targetPeriod}" not found in provided data`);
  }
  const config = periodConfigs[targetPeriod] || {};
  const stripPlotData = prepareStripPlotData(periodData.commits, targetPeriod, {
    sessions: periodData.sessions || [],
    groupCount: 9,
    periodStart: config.start,
    periodEnd: config.end,
    userConfig: userConfig,
    colorOffset: colorOffset,
    shapeOffset: shapeOffset,
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
      color: getColorForGroup(repo.group),
      displayName: repo.repo.split("/").pop(),
      fullName: repo.repo,
    }));
}
