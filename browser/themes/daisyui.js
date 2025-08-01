/**
 * Detect dark mode based on DOM state
 * @returns {boolean} - Whether dark mode is active
 */
export function detectDarkMode() {
  return (
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark"
  );
}

/**
 * Get theme colors based on current theme state
 * @param {boolean} isDark - Whether to use dark theme colors
 * @returns {Object} - Theme color object
 */
export function getThemeColors(isDark = null) {
  if (isDark === null) {
    isDark = detectDarkMode();
  }
  const computedStyle = getComputedStyle(document.documentElement);
  return {
    isDark,
    baseTextColor: isDark
      ? computedStyle.getPropertyValue("--tw-prose-body").trim() || "#E5E7EB"
      : computedStyle.getPropertyValue("--tw-prose-body").trim() || "#333333",
    primaryColor:
      computedStyle.getPropertyValue("--primary").trim() || "#3A86FF",
    backgroundColor: isDark
      ? computedStyle.getPropertyValue("--base-100").trim() || "#1F2937"
      : computedStyle.getPropertyValue("--base-100").trim() || "#ffffff",
    gridColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    axisColor: isDark ? "rgba(229,231,235,0.7)" : "rgba(51,51,51,0.7)",
    whiskerColor: isDark ? "#ffffff" : "#000000",
    medianColor: isDark ? "#ffffff" : "#000000",
    percentileStroke: isDark ? "#ffffff" : "#000000",
    percentileFill: isDark
      ? computedStyle.getPropertyValue("--base-100").trim() || "#1F2937"
      : computedStyle.getPropertyValue("--base-100").trim() || "#ffffff",
    labelColor: isDark ? "#E5E7EB" : "#333333",
    sessionLineColor: isDark ? "#ffffff" : "#000000",
    sessionLineOpacity: 0.8,
    sessionLineWidth: 1,
    fontSans: (() => {
      const fontSans =
        computedStyle.getPropertyValue("--font-sans").trim() ||
        "Open Sans, sans-serif";
      return (
        fontSans.replace(/var\([^)]+\),?\s*/g, "").trim() ||
        "Open Sans, sans-serif"
      );
    })(),
  };
}

/**
 * Apply DaisyUI theme to Vega-Lite specifications
 * @param {Object} spec - Vega-Lite specification
 * @param {Object} options - Theming options
 * @returns {Object} - Themed Vega-Lite specification
 */
export function applyDaisyUIThemeVegaLite(spec, options = {}) {
  const colors = getThemeColors(options.isDark);
  const themedSpec = {
    ...spec,
    config: {
      ...(spec.config || {}),
      view: { stroke: null },
      axis: {
        gridColor: colors.gridColor,
        gridOpacity: 1,
        domainColor: colors.axisColor,
        tickColor: colors.axisColor,
        labelColor: colors.baseTextColor,
        titleColor: colors.baseTextColor,
        labelFont: colors.fontSans,
        titleFont: colors.fontSans,
        labelFontSize: 10,
        titleFontSize: 12,
      },
      style: {
        "guide-label": {
          fill: colors.baseTextColor,
          font: colors.fontSans,
          fontSize: 10,
        },
        "guide-title": {
          fill: colors.baseTextColor,
          font: colors.fontSans,
          fontSize: 12,
        },
      },
      mark: {
        color: colors.primaryColor,
      },
      boxplot: {
        median: { color: colors.medianColor, strokeWidth: 2 },
        whisker: { color: colors.medianColor, strokeWidth: 1 },
        rule: { color: colors.medianColor, strokeWidth: 1 },
      },
    },
  };
  if (spec.encoding) {
    themedSpec.encoding = {
      ...spec.encoding,
      ...(spec.encoding.x && {
        x: {
          ...spec.encoding.x,
          axis: {
            ...spec.encoding.x.axis,
            labelColor: colors.baseTextColor,
            titleColor: colors.baseTextColor,
            gridColor: colors.gridColor,
            domainColor: colors.axisColor,
            tickColor: colors.axisColor,
            labelFont: colors.fontSans,
            titleFont: colors.fontSans,
          },
        },
      }),
      ...(spec.encoding.y && {
        y: {
          ...spec.encoding.y,
          axis: {
            ...spec.encoding.y.axis,
            labelColor: colors.baseTextColor,
            titleColor: colors.baseTextColor,
            gridColor: colors.gridColor,
            domainColor: colors.axisColor,
            tickColor: colors.axisColor,
            labelFont: colors.fontSans,
            titleFont: colors.fontSans,
          },
        },
      }),
      ...(spec.encoding.color &&
        spec.encoding.color.scale && {
          color: {
            ...spec.encoding.color,
            scale: {
              ...spec.encoding.color.scale,
              range: spec.encoding.color.scale.range || [colors.primaryColor],
            },
          },
        }),
    };
  }
  if (spec.layer && Array.isArray(spec.layer)) {
    themedSpec.layer = spec.layer.map((layer) => {
      if (layer.data && layer.data.name === "medians") {
        return {
          ...layer,
          encoding: {
            ...layer.encoding,
            fill: { value: colors.medianColor },
          },
        };
      }
      return layer;
    });
  }
  return themedSpec;
}

/**
 * Apply DaisyUI theme to raw Vega specifications
 * @param {Object} spec - Vega specification
 * @param {Object} options - Theming options
 * @returns {Object} - Themed Vega specification
 */
export function applyDaisyUIThemeVega(spec, options = {}) {
  const colors = getThemeColors(options.isDark);
  const themedSpec = {
    ...spec,
    background: colors.backgroundColor,
    config: {
      ...(spec.config || {}),
      axis: {
        gridColor: colors.gridColor,
        gridOpacity: 1,
        domainColor: colors.axisColor,
        tickColor: colors.axisColor,
        labelColor: colors.baseTextColor,
        titleColor: colors.baseTextColor,
        labelFont: colors.fontSans,
        titleFont: colors.fontSans,
        labelFontSize: 10,
        titleFontSize: 12,
      },
      style: {
        "guide-label": {
          fill: colors.baseTextColor,
          font: colors.fontSans,
          fontSize: 10,
        },
        "guide-title": {
          fill: colors.baseTextColor,
          font: colors.fontSans,
          fontSize: 12,
        },
      },
    },
  };
  if (spec.axes && Array.isArray(spec.axes)) {
    themedSpec.axes = spec.axes.map((axis) => ({
      ...axis,
      gridColor: colors.gridColor,
      gridOpacity: 1,
      domainColor: colors.axisColor,
      tickColor: colors.axisColor,
      labelColor: colors.baseTextColor,
      titleColor: colors.baseTextColor,
      labelFont: colors.fontSans,
      titleFont: colors.fontSans,
    }));
  }
  if (spec.marks && Array.isArray(spec.marks)) {
    themedSpec.marks = spec.marks.map((mark) => {
      if (mark.name === "multiCommitSessionLines") {
        return {
          ...mark,
          encode: {
            ...mark.encode,
            enter: {
              ...mark.encode.enter,
              stroke: { value: colors.sessionLineColor },
              strokeWidth: { value: colors.sessionLineWidth },
              opacity: { value: colors.sessionLineOpacity },
            },
          },
        };
      }
      return mark;
    });
  }
  return themedSpec;
}

/**
 * Auto-detect spec type and apply appropriate theming
 * @param {Object} spec - Vega or Vega-Lite specification
 * @param {Object} options - Theming options
 * @returns {Object} - Themed specification
 */
export function applyDaisyUITheme(spec, options = {}) {
  if (spec.encoding || spec.mark || spec.layer) {
    return applyDaisyUIThemeVegaLite(spec, options);
  } else if (
    spec.scales ||
    (spec.marks && Array.isArray(spec.marks)) ||
    spec.axes
  ) {
    return applyDaisyUIThemeVega(spec, options);
  }
  console.warn("Unknown spec type, applying Vega-Lite theming as fallback");
  return applyDaisyUIThemeVegaLite(spec, options);
}
