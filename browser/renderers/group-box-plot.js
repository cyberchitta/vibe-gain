import { createGroupBoxPlotSpec } from "../specs/group-box-plot.js";
import { applyDaisyUIThemeVegaLite, getThemeColors } from "../themes/daisyui.js";

/** @typedef {import("../specs/chart-data.js").BoxGroup} BoxGroup */

/**
 * Vega and Vega-Lite, as loaded by the page (script tags or an import map).
 * @typedef {object} VegaGlobals
 * @property {any} vega - the libraries ship no types for this global use
 * @property {any} vegaLite
 */

/**
 * Render a group box plot into a container, themed from the page the way
 * `renderBoxPlot` themes vibe-gain's own charts: colours from the DaisyUI
 * theme, unless `options.colors` overrides them.
 * @param {HTMLElement & { _vegaView?: any }} container
 * @param {readonly BoxGroup[]} groups
 * @param {import("../specs/group-box-plot.js").GroupBoxPlotOptions & { isDark?: boolean }} [options]
 * @returns {Promise<any>} the Vega view
 */
export async function renderGroupBoxPlot(container, groups, options = {}) {
  const { isDark, ...specOptions } = options;
  const { vega, vegaLite } = /** @type {VegaGlobals} */ (/** @type {unknown} */ (globalThis));
  container.innerHTML = "";
  try {
    const spec = createGroupBoxPlotSpec(groups, {
      ...specOptions,
      colors: { ...themeColors(isDark), ...specOptions.colors },
    });
    const themed = applyDaisyUIThemeVegaLite(spec, { isDark: isDark ?? false });
    const view = await new vega.View(vega.parse(vegaLite.compile(themed).spec))
      .renderer("canvas")
      .initialize(container)
      .runAsync();
    container._vegaView = view;
    return view;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${escapeHtml(message)}</div>`;
    throw error;
  }
}

/**
 * The page's theme as chart colours, matching `renderBoxPlot`'s choices.
 * @param {boolean | undefined} isDark
 * @returns {Partial<import("../specs/chart-colors.js").ChartColors>}
 */
function themeColors(isDark) {
  const t = getThemeColors(isDark);
  return { fg: t.medianColor, muted: t.labelColor, bg: "transparent", grid: t.gridColor };
}

/** @param {string} text */
function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Release the view `renderGroupBoxPlot` mounted and empty the container.
 * @param {HTMLElement & { _vegaView?: any }} container
 */
export function cleanupGroupBoxPlot(container) {
  container._vegaView?.finalize();
  container._vegaView = undefined;
  container.innerHTML = "";
}
