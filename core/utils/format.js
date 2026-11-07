/**
 * A figure as a chart label, rounded to fit beside a box: whole numbers as
 * they are, then three decimals below 0.1, two below 1, one below 100, none
 * from 100 (153, 300.5 → "301", 48.83 → "48.8", 0.178 → "0.18"). Text
 * forms print figures in full with `formatPrecise`.
 * @param {number | null | undefined} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return "N/A";
  if (Number.isInteger(num)) return String(num);
  if (num < 0.1) return num.toFixed(3);
  if (num < 1) return num.toFixed(2);
  if (num < 10) return num.toFixed(1);
  if (num < 100) return String(Math.round(num * 10) / 10);
  return String(Math.round(num));
}

/**
 * `formatNumber` with en-US thousands separators, for labels beside prose
 * that writes them (1735656 → "1,735,656", -1500 → "-1,500", 999.6 →
 * "1,000"). Separators go on the rounded text, so they never depend on the
 * runtime's locale. Pass it to a chart as `format`.
 * @param {number | null | undefined} num
 * @returns {string}
 */
export function formatNumberGrouped(num) {
  const [whole, ...fraction] = formatNumber(num).split(".");
  return [whole.replace(/\B(?=(\d{3})+$)/g, ","), ...fraction].join(".");
}

/**
 * A figure in at most four characters or so, for labels in a narrow column:
 * thousands with one decimal and "k", two decimals below 10 with trailing
 * zeros dropped, whole numbers between (0 → "0", 12968 → "13.0k", 0.426 →
 * "0.43", 48.8 → "49").
 * @param {number} v
 * @returns {string}
 */
export function formatCompact(v) {
  if (v === 0) return "0";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v < 10) return `${+v.toFixed(2)}`;
  return `${Math.round(v)}`;
}

/**
 * A figure as text in full, for the text forms a reader or an LLM takes as
 * measured: up to two decimals with trailing zeros dropped, and three
 * significant figures below 0.01 so a small figure never reads as 0
 * (300.5, 12, 0.15, 1.25, 0.00472 → "0.00472").
 * @param {number} num
 * @returns {string}
 */
export function formatPrecise(num) {
  if (Number.isInteger(num)) return String(num);
  if (Math.abs(num) < 0.01) return String(Number(num.toPrecision(3)));
  return String(Number(num.toFixed(2)));
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
