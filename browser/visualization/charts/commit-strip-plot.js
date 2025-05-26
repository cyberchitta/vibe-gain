import {
  prepareStripPlotData,
  calculateClusterStats,
} from "../data/clustering.js";

/**
 * Extract strip plot data from metrics for a specific period
 * @param {Object} metricData - Raw metrics data for a period
 * @param {string} period - Period identifier ('Pre-AI', 'Recent-AI')
 * @param {Object} options - Configuration options
 * @returns {Object} - Formatted strip plot data
 */
export function extractStripPlotValues(metricData, period, options = {}) {
  if (!metricData || !metricData.metrics) {
    return {
      commits: [],
      repositories: [],
      clusters: [],
      connections: [],
      period: period,
      metadata: { totalCommits: 0 },
    };
  }

  // Extract raw commit data - we need to reconstruct commit objects from the metrics
  // This assumes we have access to the raw commit data in the metrics structure
  const rawCommits = extractCommitsFromMetrics(metricData);

  if (!rawCommits || rawCommits.length === 0) {
    return {
      commits: [],
      repositories: [],
      clusters: [],
      connections: [],
      period: period,
      metadata: { totalCommits: 0 },
    };
  }

  // Use the clustering module to prepare the data
  return prepareStripPlotData(rawCommits, period, options);
}

/**
 * Extract commit objects from metrics data structure
 * @param {Object} metricData - Raw metrics data
 * @returns {Array} - Array of commit objects
 */
function extractCommitsFromMetrics(metricData) {
  // This function needs to reconstruct commit data from the aggregated metrics
  // The exact implementation depends on how the raw commit data is stored

  if (metricData.rawCommits) {
    // If raw commits are directly available
    return metricData.rawCommits;
  }

  // If we need to reconstruct from aggregated data
  // This is a fallback - ideally we'd have access to raw commit data
  const commits = [];

  // Extract from daily aggregated data if available
  const codeMetrics = metricData.metrics?.code;
  if (codeMetrics && codeMetrics.commits) {
    codeMetrics.commits.forEach((dayData) => {
      // Create synthetic commit entries based on daily aggregations
      // This is less ideal than having raw commit data
      for (let i = 0; i < dayData.commits; i++) {
        commits.push({
          sha: `synthetic-${dayData.date}-${i}`,
          date: dayData.date,
          timestamp: new Date(dayData.date + "T12:00:00Z"), // Noon as default
          repo: "unknown", // We lose repo information in aggregation
          additions: 0,
          deletions: 0,
          private: false,
          isFork: false,
          isDocOnly: false,
        });
      }
    });
  }

  return commits;
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
 * Prepare complete visualization data for both periods
 * @param {Object} preAIData - Pre-AI period metrics
 * @param {Object} recentAIData - Recent-AI period metrics
 * @param {Object} options - Configuration options
 * @returns {Object} - Complete visualization dataset
 */
export function prepareVisualizationData(
  preAIData,
  recentAIData,
  options = {}
) {
  const defaultOptions = {
    clusterThreshold: 30,
    groupCount: 4,
    ...options,
  };

  // Process both periods
  const preAIStripData = extractStripPlotValues(
    preAIData,
    "Pre-AI",
    defaultOptions
  );
  const recentAIStripData = extractStripPlotValues(
    recentAIData,
    "Recent-AI",
    defaultOptions
  );

  // Calculate comparative statistics
  const preAIStats = calculateClusterStats(preAIStripData.clusters);
  const recentAIStats = calculateClusterStats(recentAIStripData.clusters);

  return {
    preAI: preAIStripData,
    recentAI: recentAIStripData,
    comparison: {
      clusterStats: {
        preAI: preAIStats,
        recentAI: recentAIStats,
      },
      repositoryStats: {
        preAI: calculateRepositoryStats(preAIStripData.commits),
        recentAI: calculateRepositoryStats(recentAIStripData.commits),
      },
    },
    options: defaultOptions,
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
 * Normalize commit data for consistent visualization
 * @param {Array} commits - Raw commit data
 * @returns {Array} - Normalized commit data
 */
export function normalizeCommitData(commits) {
  if (!commits || commits.length === 0) {
    return [];
  }

  return commits.map((commit) => ({
    ...commit,
    // Ensure consistent data types
    timestamp: new Date(commit.timestamp),
    date:
      typeof commit.date === "string"
        ? commit.date
        : commit.date.toISOString().split("T")[0],
    additions: Number(commit.additions) || 0,
    deletions: Number(commit.deletions) || 0,
    // Calculate commit size
    commitSize:
      (Number(commit.additions) || 0) + (Number(commit.deletions) || 0),
    // Ensure boolean types
    isDocOnly: Boolean(commit.isDocOnly),
    private: Boolean(commit.private),
    isFork: Boolean(commit.isFork),
  }));
}

/**
 * Generate color palette for repository groups
 * @param {number} groupCount - Number of groups
 * @returns {Array} - Array of color values
 */
export function generateGroupColors(groupCount = 4) {
  const baseColors = [
    "#1f77b4", // blue
    "#2ca02c", // green
    "#d62728", // red
    "#9467bd", // purple
    "#ff7f0e", // orange
    "#8c564b", // brown
    "#e377c2", // pink
    "#7f7f7f", // gray
  ];

  return baseColors.slice(0, groupCount);
}

/**
 * Generate shape definitions for repositories
 * @returns {Array} - Array of SVG path strings for different shapes
 */
export function generateShapeDefinitions() {
  return [
    "M0,-5A5,5,0,1,1,0,5A5,5,0,1,1,0,-5Z", // Circle
    "M-4,-4L4,-4L4,4L-4,4Z", // Square
    "M0,-5L4.33,2.5L-4.33,2.5Z", // Triangle
    "M0,-6L4.24,-1.85L2.63,4.85L-2.63,4.85L-4.24,-1.85Z", // Pentagon
    "M-3,-3L3,-3L6,0L3,3L-3,3L-6,0Z", // Hexagon
  ];
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
