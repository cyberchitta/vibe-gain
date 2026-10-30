import { TIME_DURATION_METRICS } from "../../core/data/bucketing.js";
import { periodGroup } from "../../core/data/period-group.js";
import { createGroupBoxPlotSpec } from "./group-box-plot.js";

/** A log axis's tick labels for metrics in minutes: sec below 1, hr from 60. */
const DURATION_LABELS = `
  datum.value < 1 ? round(datum.value * 60) + ' sec' :
  datum.value < 60 ? round(datum.value * 10)/10 + ' min' :
  round(datum.value/60 * 10)/10 + ' hr'`;

/**
 * Side-by-side box plots, one per period, with an optional histogram
 * overlay: vibe-gain's own binning per period, drawn by
 * `createGroupBoxPlotSpec`. Periods without values are left out.
 * @param {Array} periodsData - Array of {period, values, color} objects
 * @param {Object} options - Visualization options; `metricId` picks the
 *   histogram buckets and, on a log axis, duration labels;
 *   `referenceLines` ({period, value}) mark a value across a period's box
 * @returns {Object} - Vega-Lite specification
 */
export function createBoxPlotSpec(periodsData, options = {}) {
  const o = {
    useLogScale: false,
    showPercentiles: true,
    showHistogram: true,
    histogramWidth: 0.3,
    showStats: true,
    showValues: true,
    ...options,
  };
  const groups = periodsData
    .filter((p) => p.values.length > 0)
    .map((p) => ({ ...periodGroup(p, o.metricId), references: references(o.referenceLines, p.period) }));
  return createGroupBoxPlotSpec(groups, defined({
    width: o.width,
    height: o.height,
    yLabel: o.yLabel,
    log: o.useLogScale,
    ...(o.useLogScale && { floor: 0.1 }),
    ...(o.useLogScale && TIME_DURATION_METRICS.includes(o.metricId) && { yAxis: { labelExpr: DURATION_LABELS } }),
    showPercentiles: o.showPercentiles,
    showHistogram: o.showHistogram,
    showShares: o.showValues,
    showFigures: o.showStats,
    histogramWidth: o.histogramWidth,
    colors: defined({ fg: o.medianColor, muted: o.labelColor, bg: o.percentileFill }),
  }));
}

/**
 * The old reference lines that belong to one period, as the chart's references.
 * @param {Array} [lines] - {period, value} each
 * @param {string} period
 */
function references(lines = [], period) {
  return lines
    .filter((r) => r.period === period && r.value > 0)
    .map((r) => ({ value: r.value, label: `${r.value}min` }));
}

/** Options the caller left unset are left out, so the chart's defaults apply. */
function defined(options) {
  return Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
}
