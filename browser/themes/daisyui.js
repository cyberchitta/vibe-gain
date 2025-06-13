/**
 * Detect dark mode based on DOM state
 * @returns {boolean} - Whether dark mode is active
 */
export function detectDarkMode() {
  return (
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    (window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
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
    gridColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    axisColor: isDark ? "rgba(229,231,235,0.7)" : "rgba(51,51,51,0.7)",
    medianColor:
      computedStyle.getPropertyValue("--base-content").trim() ||
      (isDark ? "#E5E7EB" : "#333333"),
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

export function applyDaisyUITheme(spec, options = {}) {
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
