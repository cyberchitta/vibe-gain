/**
 * Extract relevant values from metric data
 * @param {Array} metricData - Array of metric data objects
 * @param {string} metricId - Metric identifier
 * @returns {Array} - Array of numeric values
 */
export function extractValues(metricData, metricId) {
  const values = [];
  if (!Array.isArray(metricData)) return values;
  metricData.forEach((item) => {
    let value = null;
    if (
      metricId === "time_between_commits" &&
      item["avg_time_between_commits"] !== undefined
    ) {
      value = item["avg_time_between_commits"];
    } else if (
      metricId === "commits_per_hour" &&
      item["commits_per_hour"] !== undefined
    ) {
      value = item["commits_per_hour"];
    } else if (item[metricId] !== undefined) {
      value = item[metricId];
    }
    if (value !== null && !isNaN(value)) {
      values.push(value);
    }
  });
  return values;
}

/**
 * Get dynamic range for chart data
 * @param {Array} values - Array of numeric values
 * @param {Array} fallbackRange - Fallback range to use if data is empty
 * @returns {Array} - [min, max] range with padding
 */
export function getDynamicRange(values, fallbackRange = [0, 10]) {
  if (!values || values.length === 0) return fallbackRange;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [Math.max(0, min - 1), max + 1];
  }
  const padding = (max - min) * 0.05;
  return [Math.floor(min - padding), Math.ceil(max + padding)];
}

/**
 * Calculate appropriate bin count based on data range and metric type
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} metricId - Metric identifier
 * @returns {number} - Number of bins to create
 */
export function calculateBinCount(min, max, metricId) {
  let binCount = 10;
  if (metricId === "commits") {
    binCount = Math.min(15, Math.max(max - min + 1, 5));
  } else if (metricId === "hours") {
    binCount = Math.min(12, Math.max(Math.ceil((max - min) / 0.5), 6));
  } else {
    const range = max - min;
    binCount = Math.min(15, Math.max(Math.ceil(range / 10), 5));
  }
  return Math.max(binCount, 5);
}

/**
 * Create histogram bins from values
 * @param {Array} values - Array of numeric values
 * @param {Array} range - [min, max] range for binning
 * @param {number} binCount - Number of bins
 * @returns {Array} - Array of bin objects
 */
export function createHistogramBins(values, range, binCount) {
  const [min, max] = range;
  const binSize = Math.max((max - min) / binCount, 0.01);
  const bins = Array(binCount)
    .fill(0)
    .map((_, i) => {
      const binStart = min + i * binSize;
      const binEnd = min + (i + 1) * binSize;
      return {
        binStart: binStart,
        binEnd: binEnd,
        binCenter: (binStart + binEnd) / 2,
        binLabel: `${binStart.toFixed(1)} - ${binEnd.toFixed(1)}`,
        count: 0,
      };
    });
  values.forEach((val) => {
    if (val >= min && val <= max) {
      const binIndex = Math.min(
        Math.floor((val - min) / binSize),
        binCount - 1
      );
      if (binIndex >= 0 && binIndex < bins.length) {
        bins[binIndex].count++;
      }
    }
  });
  if (values.length > 0) {
    bins.forEach((bin) => {
      bin.percentageCount = (bin.count / values.length) * 100;
    });
  }
  return bins;
}

/**
 * Create histogram data from metrics
 * @param {Array} metricData - Array of data objects containing the metric
 * @param {string} metricId - Metric identifier
 * @param {Object} options - Additional options
 * @returns {Object} - Histogram data object
 */
export function prepareHistogramData(metricData, metricId, options = {}) {
  const values = extractValues(metricData, metricId);
  if (values.length === 0) {
    return {
      bins: [],
      range: options.range || [0, 10],
      metadata: { count: 0 },
    };
  }
  const range = options.range || getDynamicRange(values);
  const binCount =
    options.binCount || calculateBinCount(range[0], range[1], metricId);
  const bins = createHistogramBins(values, range, binCount);
  return {
    bins,
    range,
    metadata: {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((sum, val) => sum + val, 0) / values.length,
    },
  };
}
