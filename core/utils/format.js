/**
 * A figure as text, the one format every chart and table uses: whole
 * numbers as they are, then three decimals below 0.1, one below 100, none
 * from 100 (153, 300.5 → "301", 48.83 → "48.8", 0.178 → "0.2").
 * @param {number | null | undefined} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return "N/A";
  if (Number.isInteger(num)) return String(num);
  if (num < 0.1) return num.toFixed(3);
  if (num < 10) return num.toFixed(1);
  if (num < 100) return String(Math.round(num * 10) / 10);
  return String(Math.round(num));
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
