import { createStripPlotSpec } from "../specs/commit-strip-plot.js";
import { applyDaisyUITheme } from "../themes/daisyui.js";

/**
 * Render strip plot visualization
 * @param {HTMLElement} container - Container element
 * @param {Object} data - Strip plot data from prepareStripPlotData
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderStripPlot(container, data, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const defaultOptions = {
    width: container.clientWidth || 800,
    height: options.height || 400,
    showTooltips: false,
    isDark: false,
    ...options,
  };
  try {
    const spec = createStripPlotSpec(data, defaultOptions);
    const themedSpec = applyDaisyUITheme(spec, {
      isDark: defaultOptions.isDark,
    });
    const runtime = vega.parse(themedSpec);
    const view = new vega.View(runtime)
      .renderer("canvas")
      .initialize(container)
      .width(defaultOptions.width)
      .height(defaultOptions.height)
      .hover()
      .run();
    container._vegaView = view;
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
  container.innerHTML = "";
}
