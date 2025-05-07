/**
 * Apply DaisyUI theming to a Vega specification
 * @param {Object} spec - Base Vega specification
 * @param {Object} options - Additional options
 * @returns {Object} - Themed Vega specification
 */
export function applyDaisyUITheme(spec, options = {}) {
  const isDark = options.isDark;
  const baseTextColor = isDark
    ? "var(--tw-prose-body, #E5E7EB)"
    : "var(--tw-prose-body, #333333)";
  const gridColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";
  const axisColor = isDark ? "rgba(229,231,235,0.7)" : "rgba(51,51,51,0.7)";
  return {
    ...spec,
    config: {
      ...(spec.config || {}),
      view: { stroke: null },
      style: {
        "guide-label": {
          fill: baseTextColor,
          font: 'var(--font-sans, "Open Sans", sans-serif)',
          fontSize: 10,
        },
        "guide-title": {
          fill: baseTextColor,
          font: 'var(--font-sans, "Open Sans", sans-serif)',
          fontSize: 12,
        },
      },
      axis: {
        gridColor: gridColor,
        gridOpacity: 1,
        domainColor: axisColor,
        tickColor: axisColor,
        labelColor: baseTextColor,
      },
      mark: {
        color: "var(--primary, #3A86FF)",
      },
    },
  };
}
