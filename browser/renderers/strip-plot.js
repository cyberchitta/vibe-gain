import { createStripPlotSpec } from "../specs/strip-plot.js";
import { applyDaisyUIThemeVega } from "../themes/daisyui.js";
import { preparePeriodsForStripPlot } from "../charts/strip-plot.js";

class StripPlotRenderer {
  static #renderers = new WeakMap();

  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.vegaView = null;
    this.stripPlotData = null;
    this.commitData = null;
  }

  static getRenderer(container) {
    return this.#renderers.get(container) || null;
  }

  static getOrCreateRenderer(container, options = {}) {
    let renderer = this.#renderers.get(container);
    if (!renderer) {
      renderer = new StripPlotRenderer(container, options);
      this.#renderers.set(container, renderer);
    }
    return renderer;
  }

  async render(periodsRawData, options = {}) {
    this.options = {
      showTooltips: false,
      showSessionLines: false,
      isDark: false,
      targetPeriod: null,
      periodConfigs: {},
      ...this.options,
      ...options,
    };
    if (!this.container) {
      throw new Error("Container element is required");
    }
    this.container.innerHTML = "";
    try {
      const preparedData = preparePeriodsForStripPlot(
        periodsRawData,
        this.options.targetPeriod,
        {
          periodConfigs: this.options.periodConfigs,
          tzConfig: this.options.tzConfig,
          repositoryMarks: this.options.repositoryMarks,
        }
      );
      const spec = createStripPlotSpec(
        preparedData.stripPlotData,
        this.options
      );
      const themedSpec = applyDaisyUIThemeVega(spec, {
        isDark: this.options.isDark,
      });
      const runtime = vega.parse(themedSpec);
      this.vegaView = new vega.View(runtime)
        .renderer("canvas")
        .initialize(this.container)
        .width(this.container.clientWidth)
        .height(this.container.clientHeight)
        .run();
      this.stripPlotData = preparedData.stripPlotData;
      this.commitData =
        periodsRawData.find((p) => p.period === this.options.targetPeriod)
          ?.commits || [];
      return this.vegaView;
    } catch (error) {
      console.error("Error rendering strip plot:", error);
      this.container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
      throw error;
    }
  }

  cleanup() {
    if (this.vegaView) {
      this.vegaView.finalize();
      this.vegaView = null;
    }
    this.stripPlotData = null;
    this.commitData = null;
    StripPlotRenderer.#renderers.delete(this.container);
  }
}

/**
 * Render strip plot visualization
 * @param {HTMLElement} container - Container element
 * @param {Array} periodsRawData - Array of {period, data, color} objects where data is commits array
 * @param {Object} options - Rendering options including targetPeriod, repositoryMarks
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderStripPlot(container, periodsRawData, options = {}) {
  if (!options.repositoryMarks) {
    throw new Error("repositoryMarks must be provided in options");
  }
  if (!options.targetPeriod) {
    throw new Error("targetPeriod must be specified in options");
  }
  const renderer = StripPlotRenderer.getOrCreateRenderer(container, options);
  return await renderer.render(periodsRawData, options);
}

/**
 * Cleanup strip plot resources
 * @param {HTMLElement} container - Container element
 */
export function cleanupStripPlot(container) {
  const renderer = StripPlotRenderer.getRenderer(container);
  if (renderer) {
    renderer.cleanup();
  }
}

export { StripPlotRenderer };
