import { extractValues } from "../../core/data/transforms.js";
import { createBoxPlotSpec } from "../specs/box-plot.js";
import { applyDaisyUITheme, getThemeColors } from "../themes/daisyui.js";

/**
 * Prepare raw periods data for box plot rendering
 * @param {Array} periodsRawData - Array of {period, data, color} objects
 * @param {string} metricId - Metric identifier
 * @returns {Array} - Array of {period, values, color} objects for createBoxPlotSpec
 */
export function preparePeriodsForBoxPlot(periodsRawData, metricId) {
  return periodsRawData.map(({ period, data, color }) => ({
    period,
    values: extractValues(data, metricId),
    color,
  }));
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
