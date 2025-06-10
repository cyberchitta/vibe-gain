import { computeVizDataForType } from "../../core/data/viz-data.js";
import { arrayFormatToCommits } from "../../core/data/formats.js";

/**
 * Load and prepare chart data from vibe-gain data files
 * @param {string} dataPath - Base path to vibe-gain data (e.g., '/assets/data/vg-progress')
 * @param {string} username - Username
 * @param {Array} periods - Array of period names
 * @param {string} metricType - 'all', 'code', or 'doc'
 * @returns {Promise<Object>} - Object with period data ready for charts
 */
export async function loadChartDataFromFiles(
  dataPath,
  username,
  periods,
  metricType = "code"
) {
  console.log(
    `Loading chart data: ${dataPath}/${username} for periods: ${periods.join(
      ", "
    )}`
  );
  const chartData = {};
  const userPath = `${dataPath}/${username}`;
  for (const period of periods) {
    try {
      const url = `${userPath}/vizdata_${period.replace(/\s+/g, "_")}.json`;
      console.log(`Fetching: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const data = await response.json();
      chartData[period] = extractChartData(data.viz_data, metricType);
      console.log(`Loaded chart data for ${period}`);
    } catch (error) {
      console.error(`Failed to load data for ${period}:`, error);
      chartData[period] = null;
    }
  }
  return chartData;
}

// In /vibe-gain/core/data/chart-adapter.js

/**
 * Load and prepare chart data from raw commit files
 * @param {string} dataPath - Base path to vibe-gain data
 * @param {string} username - Username
 * @param {Array} periods - Array of period objects with {name, start, end}
 * @param {string} metricType - 'all', 'code', or 'doc'
 * @param {Object} userConfig - User configuration with timezone info
 * @returns {Promise<Object>} - Object with period data ready for charts
 */
export async function loadChartDataFromRaw(
  dataPath,
  username,
  periods,
  metricType,
  userConfig
) {
  console.log(`Loading chart data from raw commits: ${dataPath}/${username}`);
  const chartData = {};
  const userPath = `${dataPath}/${username}`;
  for (const period of periods) {
    try {
      const url = `${userPath}/raw/commits_${period.name.replace(
        /\s+/g,
        "_"
      )}.json`;
      console.log(`Fetching raw commits: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const arrayFormat = await response.json();
      const commits = arrayFormatToCommits(arrayFormat);
      const defaultUserConfig = {
        timezone_offset_hours: 0,
        coding_day_start_hour: 4
      };
      const config = userConfig || defaultUserConfig;
      const vizData = computeVizDataForType(commits, metricType, config);
      chartData[period.name] = extractChartData(
        { [metricType]: vizData },
        metricType
      );
      console.log(`Processed ${commits.length} raw commits for ${period.name}`);
    } catch (error) {
      console.error(`Failed to process raw data for ${period.name}:`, error);
      chartData[period.name] = null;
    }
  }
  return chartData;
}

/**
 * Extract chart-ready data from viz_data
 * @param {Object} vizData - Complete viz_data object
 * @param {string} metricType - 'all', 'code', or 'doc'
 * @returns {Object} - Chart-ready data for all metrics
 */
export function extractChartData(vizData, metricType) {
  const typeData = vizData[metricType];
  if (!typeData) {
    throw new Error(`No data found for metric type: ${metricType}`);
  }
  return {
    commits: typeData.commits || [],
    loc: typeData.loc || [],
    hours: typeData.hours || [],
    repos: typeData.repos || [],
    commits_by_hour_of_day:
      typeData.commits_by_hour_of_day || new Array(24).fill(0),
    commit_intervals: (typeData.commit_intervals || []).filter(
      (interval) => interval.interval_minutes && interval.interval_minutes > 0
    ),
    commits_per_hour: deriveCommitsPerHour(
      typeData.commits || [],
      typeData.hours || []
    ),
    hourly_commit_distribution: typeData.hourly_commit_distribution || [],
    metadata: typeData.metadata || {},
  };
}

function deriveCommitsPerHour(commitsData, hoursData) {
  if (!commitsData.length || !hoursData.length) return [];
  return commitsData
    .map((commitDay, index) => {
      const hoursDay = hoursData[index];
      if (!hoursDay || hoursDay.hours === 0) return { commits_per_hour: 0 };
      return {
        date: commitDay.date,
        commits_per_hour: commitDay.commits / hoursDay.hours,
      };
    })
    .filter((day) => day.commits_per_hour > 0);
}

/**
 * Prepare period data for histogram rendering
 * @param {Object} chartData - Chart data from extractChartData
 * @param {string} period - Period name
 * @param {string} metricId - Metric identifier
 * @param {string} color - Color for this period
 * @returns {Object} - Period data ready for histogram rendering
 */
export function preparePeriodDataForHistogram(
  chartData,
  period,
  metricId,
  color
) {
  if (!chartData) {
    throw new Error(`No chart data available for period: ${period}`);
  }
  if (metricId === "commits_by_hour_of_day" || metricId === "hour_of_day") {
    return {
      period,
      hourlyData: chartData.commits_by_hour_of_day,
      color,
    };
  }
  const metricData = chartData[metricId];
  if (!metricData) {
    throw new Error(`No data found for metric ${metricId} in period ${period}`);
  }
  return {
    period,
    metricData,
    color,
  };
}
