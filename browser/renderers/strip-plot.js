import { createStripPlotSpec } from "../specs/strip-plot.js";
import { applyDaisyUIThemeVega } from "../themes/daisyui.js"; // Add this import
import { prepareStripPlotData } from "../../core/data/strip-plot.js";

/**
 * Prepare periods data with raw commits for strip plot rendering
 * @param {Array} periodsRawData - Array of {period, commits, color} objects where commits is raw commit array
 * @param {string} targetPeriod - Name of the period to render
 * @param {Object} options - Options including periodConfigs
 * @returns {Object} - Prepared strip plot data for the target period
 */
export function preparePeriodsForStripPlot(
  periodsRawData,
  targetPeriod,
  options = {}
) {
  const { periodConfigs = {}, userConfig = {} } = options;
  const periodData = periodsRawData.find((p) => p.period === targetPeriod);
  if (!periodData) {
    throw new Error(`Period "${targetPeriod}" not found in provided data`);
  }
  const config = periodConfigs[targetPeriod] || {};
  const stripPlotData = prepareStripPlotData(periodData.commits, targetPeriod, {
    sessions: periodData.sessions || [],
    clusterThreshold: 30,
    groupCount: 4,
    periodStart: config.start,
    periodEnd: config.end,
    userConfig: userConfig,
  });
  return {
    period: targetPeriod,
    stripPlotData,
    color: periodData.color,
  };
}

/**
 * Render strip plot visualization
 * @param {HTMLElement} container - Container element
 * @param {Array} periodsRawData - Array of {period, data, color} objects where data is commits array
 * @param {Object} options - Rendering options including targetPeriod
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderStripPlot(container, periodsRawData, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const defaultOptions = {
    showTooltips: false,
    showSessionLines: false,
    isDark: false,
    targetPeriod: null,
    periodConfigs: {},
    userConfig: {
      timezone_offset_hours: 0,
      coding_day_start_hour: 4,
    },
    ...options,
  };
  if (!defaultOptions.targetPeriod) {
    throw new Error("targetPeriod must be specified in options");
  }
  try {
    const preparedData = preparePeriodsForStripPlot(
      periodsRawData,
      defaultOptions.targetPeriod,
      defaultOptions
    );
    const spec = createStripPlotSpec(
      preparedData.stripPlotData,
      defaultOptions
    );
    const themedSpec = applyDaisyUIThemeVega(spec, {
      isDark: defaultOptions.isDark,
    });
    const runtime = vega.parse(themedSpec);
    const view = new vega.View(runtime)
      .renderer("canvas")
      .initialize(container)
      .width(container.clientWidth)
      .height(container.clientHeight)
      .run();
    container._vegaView = view;
    container._stripPlotData = preparedData.stripPlotData;
    return view;
  } catch (error) {
    console.error("Error rendering strip plot:", error);
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
    throw error;
  }
}

/**
 * Cleanup strip plot resources
 * @param {HTMLElement} container - Container element
 */
export function cleanupStripPlot(container) {
  if (!container) return;
  if (container._vegaView) {
    container._vegaView.finalize();
    container._vegaView = null;
  }
  if (container._stripPlotData) {
    container._stripPlotData = null;
  }
  container.innerHTML = "";
}
