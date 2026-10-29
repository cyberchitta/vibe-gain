import { TIME_DURATION_METRICS } from "../../core/data/bucketing.js";
import { periodGroup } from "../../core/data/period-group.js";
import { createPeriodBoxPlotSpec } from "./period-box-plot.js";

/**
 * Create side-by-side vertical box plots with optional histogram overlay:
 * figures and bins computed per period, then drawn.
 * @param {Array} periodsData - Array of {period, values, color} objects
 * @param {Object} options - Visualization options; `metricId` picks the
 *   histogram buckets and, on a log axis, duration labels
 * @returns {Object} - Vega-Lite specification with box plots and optional histogram bars
 */
export function createBoxPlotSpec(periodsData, options = {}) {
  return createPeriodBoxPlotSpec(
    periodsData.map((p) => periodGroup(p, options.metricId)),
    { durationAxis: TIME_DURATION_METRICS.includes(options.metricId), ...options },
  );
}
