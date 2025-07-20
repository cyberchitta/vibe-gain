import { extractValues } from "../../core/data/transforms.js";
import { createBoxPlotSpec } from "../specs/box-plot.js";
import {
  applyDaisyUIThemeVegaLite,
  getThemeColors,
} from "../themes/daisyui.js";

/**
 * Prepare periods data with processed metrics for box plot rendering
 * @param {Array} periodsMetricsData - Array of {period, metrics, color} objects
 * @param {string} metricId - Metric identifier
 * @returns {Array} - Array of {period, values, color} objects for createBoxPlotSpec
 */
export function preparePeriodsForBoxPlot(periodsMetricsData, metricId) {
  return periodsMetricsData.map(({ period, metrics, color }) => ({
    period,
    values: extractValues(metrics[metricId], metricId),
    color,
  }));
}

/**
 * Render box plot visualization with processed metrics
 * @param {HTMLElement} container - Container element
 * @param {Array} periodsMetricsData - Array of {period, metrics, color} objects
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderBoxPlot(
  container,
  periodsMetricsData,
  options = {}
) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const colors = getThemeColors(options.isDark);
  const defaultOptions = {
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
    periodsMetricsData,
    options.metricId
  );
  try {
    const spec = createBoxPlotSpec(periodsData, defaultOptions);
    const themedSpec = applyDaisyUIThemeVegaLite(spec, {
      isDark: options.isDark || false,
    });
    const vegaSpec = vegaLite.compile(themedSpec).spec;
    const runtime = vega.parse(vegaSpec);
    const view = await new vega.View(runtime)
      .renderer("canvas")
      .initialize(container)
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
