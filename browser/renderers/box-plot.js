import { createBoxPlotSpec } from "../specs/box-plot.js";
import { applyDaisyUITheme, getThemeColors } from "../themes/daisyui.js";

/**
 * Prepare raw periods data for box plot rendering
 * @param {Array} periodsRawData - Array of {period, data, color} objects
 * @param {string} metricId - Metric identifier
 * @returns {Array} - Array of {period, values, color} objects for createBoxPlotSpec
 */
export function preparePeriodsForBoxPlot(periodsRawData, metricId) {
  return periodsRawData.map(({ period, data, color }) => {
    let values;
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "number") {
      values = data.filter((val) => val !== null && !isNaN(val) && val > 0);
    } else if (metricId === "hourly_commit_distribution") {
      values = Array.isArray(data) ? data.filter((val) => val > 0) : [];
    } else if (metricId === "hourly_loc_distribution") {
      values = Array.isArray(data) ? data.filter((val) => val > 0) : [];
    } else if (Array.isArray(data)) {
      values = data
        .map((item) => {
          if (
            (metricId === "commit_intervals" ||
              metricId === "intra_session_intervals") &&
            item.interval_minutes !== undefined
          ) {
            return item.interval_minutes;
          } else if (
            metricId === "sessions_per_day" &&
            item.sessions_count !== undefined
          ) {
            return item.sessions_count;
          } else if (
            metricId === "session_time" &&
            item.session_time !== undefined
          ) {
            return item.session_time;
          } else if (
            metricId === "active_hours" &&
            item.active_hours !== undefined
          ) {
            return item.active_hours;
          } else if (item[metricId] !== undefined) {
            return item[metricId];
          }
          return null;
        })
        .filter((val) => val !== null && !isNaN(val) && val > 0);
    } else {
      console.warn(`Unexpected data structure for ${metricId}:`, data);
      values = [];
    }
    return {
      period,
      values,
      color,
    };
  });
}

/**
 * Render box plot visualization with optional dot overlay
 * @param {HTMLElement} container - Container element
 * @param {Array} periodsRawData - Array of {period, data, color} objects
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderBoxPlot(container, periodsRawData, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const colors = getThemeColors(options.isDark);
  const defaultOptions = {
    width: container.clientWidth || 400,
    height: 250,
    useLogScale: false,
    showPercentiles: true,
    histogramWidth: 0.3,
    yLabel: "Value",
    whiskerColor: colors.whiskerColor,
    medianColor: colors.medianColor,
    percentileStroke: colors.percentileStroke,
    percentileFill: colors.percentileFill,
    labelColor: colors.labelColor,
    ...options,
  };
  const periodsData = preparePeriodsForBoxPlot(
    periodsRawData,
    options.metricId
  );
  try {
    const spec = createBoxPlotSpec(periodsData, defaultOptions);
    const themedSpec = applyDaisyUITheme(spec, {
      isDark: options.isDark || false,
    });
    const vegaSpec = vegaLite.compile(themedSpec).spec;
    const runtime = vega.parse(vegaSpec);
    const view = await new vega.View(runtime)
      .renderer("canvas")
      .initialize(container)
      .width(defaultOptions.width)
      .height(defaultOptions.height)
      .run();
    container._vegaView = view;
    return view;
  } catch (error) {
    console.error("Error rendering box plot:", error);
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
    throw error;
  }
}

/**
 * Cleanup box plot resources
 * @param {HTMLElement} container - Container element
 */
export function cleanupBoxPlot(container) {
  if (!container) return;
  if (container._vegaView) {
    container._vegaView.finalize();
    container._vegaView = null;
  }
  container.innerHTML = "";
}
