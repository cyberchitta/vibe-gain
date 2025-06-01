import { createOverlaySpec } from "../specs/overlay.js";
import {
  prepareNaturalBucketData,
  hasNaturalBuckets,
} from "../data/bucketing.js";
import { applyDaisyUITheme } from "../themes/daisyui.js";

/**
 * Prepare overlay data using natural buckets when available
 * @param {Array} periodsData - Array of {period, metricData, color} objects
 * @param {string} metricId - Metric identifier
 * @param {Object} options - Options for bucketing and display
 * @returns {Array} - Array of prepared chart data with natural buckets
 */
export function prepareOverlayData(periodsData, metricId, options = {}) {
  const useNaturalBuckets =
    options.useNaturalBuckets !== false && hasNaturalBuckets(metricId);
  if (!useNaturalBuckets) {
    // Fallback to existing logic for metrics without natural buckets
    throw new Error(
      `Natural buckets not available for metric: ${metricId}. Please define natural buckets first.`
    );
  }
  return periodsData.map((periodData) => {
    const bucketData = prepareNaturalBucketData(
      periodData.metricData,
      metricId,
      options
    );
    return {
      period: periodData.period,
      bucketData: bucketData,
      color: periodData.color,
      metricId: metricId,
    };
  });
}

/**
 * Render overlay plot
 * @param {HTMLElement} container - Container element
 * @param {Array} chartData - Prepared chart data
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderOverlay(container, chartData, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }

  container.innerHTML = "";

  const spec = createOverlaySpec(chartData, options);
  const themedSpec = applyDaisyUITheme(spec, options);

  try {
    const view = new vega.View(vega.parse(themedSpec))
      .renderer("canvas")
      .initialize(container);

    await view.runAsync();
    container._vegaView = view;

    return view;
  } catch (error) {
    console.error("Error rendering overlay:", error);
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
    throw error;
  }
}

/**
 * Cleanup overlay resources
 * @param {HTMLElement} container - Container element
 */
export function cleanupOverlay(container) {
  if (!container) return;

  if (container._vegaView) {
    container._vegaView.finalize();
    container._vegaView = null;
  }

  container.innerHTML = "";
}
