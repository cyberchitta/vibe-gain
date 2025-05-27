export function applyDaisyUITheme(spec, options = {}) {
  const isDark = options.isDark;
  const computedStyle = getComputedStyle(document.documentElement);
  const baseTextColor = isDark 
    ? computedStyle.getPropertyValue('--tw-prose-body').trim() || "#E5E7EB"
    : computedStyle.getPropertyValue('--tw-prose-body').trim() || "#333333";
  const primaryColor = computedStyle.getPropertyValue('--primary').trim() || "#3A86FF";
  const fontSans = computedStyle.getPropertyValue('--font-sans').trim() || "Open Sans, sans-serif";
  const resolvedFont = fontSans.replace(/var\([^)]+\),?\s*/g, '').trim() || "Open Sans, sans-serif";
  const gridColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";
  const axisColor = isDark ? "rgba(229,231,235,0.7)" : "rgba(51,51,51,0.7)";
  const themedSpec = {
    ...spec,
    config: {
      ...(spec.config || {}),
      view: { stroke: null },
      axis: {
        gridColor: gridColor,
        gridOpacity: 1,
        domainColor: axisColor,
        tickColor: axisColor,
        labelColor: baseTextColor,
        titleColor: baseTextColor,
        labelFont: resolvedFont,
        titleFont: resolvedFont,
        labelFontSize: 10,
        titleFontSize: 12,
      },
      style: {
        "guide-label": {
          fill: baseTextColor,
          font: resolvedFont,
          fontSize: 10,
        },
        "guide-title": {
          fill: baseTextColor,
          font: resolvedFont,
          fontSize: 12,
        },
      },
      mark: {
        color: primaryColor,
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
            labelColor: baseTextColor,
            titleColor: baseTextColor,
            gridColor: gridColor,
            domainColor: axisColor,
            tickColor: axisColor,
            labelFont: resolvedFont,
            titleFont: resolvedFont,
          }
        }
      }),
      ...(spec.encoding.y && {
        y: {
          ...spec.encoding.y,
          axis: {
            ...spec.encoding.y.axis,
            labelColor: baseTextColor,
            titleColor: baseTextColor,
            gridColor: gridColor,
            domainColor: axisColor,
            tickColor: axisColor,
            labelFont: resolvedFont,
            titleFont: resolvedFont,
          }
        }
      }),
      ...(spec.encoding.color && spec.encoding.color.scale && {
        color: {
          ...spec.encoding.color,
          scale: {
            ...spec.encoding.color.scale,
            range: spec.encoding.color.scale.range?.map(color => 
              color === "var(--primary)" ? primaryColor : color
            ) || [primaryColor]
          }
        }
      })
    };
  }
 return themedSpec;
}
