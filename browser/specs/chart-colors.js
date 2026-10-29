/**
 * Colours a chart draws with, passed in by the caller so that a page with
 * its own theme (no DaisyUI) can use the specs as they are.
 * @typedef {object} ChartColors
 * @property {string} fg - medians, axis titles
 * @property {string} muted - box outlines, whiskers, labels
 * @property {string} bg - the inside of percentile crosses
 * @property {string} grid - grid lines and axis lines
 * @property {string} highlight - the ring round a highlighted value
 */

/** @type {Readonly<ChartColors>} */
export const DEFAULT_COLORS = Object.freeze({
  fg: "#333333",
  muted: "#666666",
  bg: "#ffffff",
  grid: "rgba(0,0,0,0.08)",
  highlight: "#d4a017",
});

/**
 * Vega-Lite config that themes axes from the colours. A caller that themes
 * the spec afterwards (`applyDaisyUIThemeVegaLite`) replaces it.
 * @param {ChartColors} colors
 */
export function axisConfig(colors) {
  return {
    view: { stroke: null },
    axis: {
      labelColor: colors.muted,
      titleColor: colors.fg,
      gridColor: colors.grid,
      domainColor: colors.grid,
      tickColor: colors.grid,
    },
    legend: { labelColor: colors.muted, titleColor: colors.fg },
  };
}
