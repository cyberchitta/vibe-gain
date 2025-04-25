/**
 * Get dynamic range for chart data
 * @param {Array} data - Array of data objects
 * @param {string} key - Key to extract values from data objects
 * @param {Array} fallbackRange - Fallback range to use if data is empty
 * @returns {Array} - [min, max] range with padding
 */
function getDynamicRange(data, key, fallbackRange) {
  if (!data || data.length === 0) return fallbackRange;
  const values = data.map((d) => d[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [Math.max(0, min - 1), max + 1];
  }
  const padding = (max - min) * 0.05;
  return [Math.floor(min - padding), Math.ceil(max + padding)];
}

/**
 * Calculate histogram bins from data
 * @param {Array} data - Array of values
 * @param {Array} range - [min, max] range for the histogram
 * @param {number} bins - Number of bins to create
 * @returns {Array} - Array of bin objects with count and range
 */
function createHistogramBins(data, range, bins) {
  const [min, max] = range;
  const step = (max - min) / bins;
  const binArray = Array(bins).fill(0);
  data.forEach((val) => {
    if (val >= min && val <= max) {
      const binIndex = Math.min(Math.floor((val - min) / step), bins - 1);
      binArray[binIndex]++;
    }
  });
  return binArray.map((count, i) => {
    const binStart = min + i * step;
    const binEnd = binStart + step;
    return {
      count: count,
      binStart: binStart,
      binEnd: binEnd,
      binCenter: binStart + step / 2,
      binLabel: `${binStart.toFixed(1)} - ${binEnd.toFixed(1)}`,
    };
  });
}

module.exports = {
  getDynamicRange,
  createHistogramBins,
};
