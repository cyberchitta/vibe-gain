/**
 * Format numbers for display with appropriate precision
 * @param {number} num - Number to format
 * @returns {string} - Formatted number string
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return "N/A";
  if (Number.isInteger(num)) {
    return num.toString();
  }
  if (num < 0.1) {
    return num.toFixed(3);
  } else if (num < 10) {
    return num.toFixed(1);
  } else if (num < 100) {
    return Math.round(num * 10) / 10;
  } else {
    return Math.round(num);
  }
}

/**
 * Format metrics data for export with metadata
 * @param {Object} metricsData - Metrics data object
 * @param {string} periodName - Name of the period
 * @returns {Object} - Formatted export object with metadata
 */
export function formatMetricsDataForExport(metricsData, periodName) {
  return {
    period_name: periodName,
    generated_at: new Date().toISOString(),
    metrics_data: metricsData,
  };
}
