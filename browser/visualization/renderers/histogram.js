import { createBaseVegaSpec } from "./vega-base.js";

/**
 * Create a Vega-Lite specification for a histogram
 * @param {Object} histogramData - Histogram data from prepareHistogramData
 * @param {Object} options - Rendering options
 * @returns {Object} - Vega-Lite specification
 */
export function createHistogramSpec(histogramData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const yField =
    options.viewMode === "percentage" ? "percentageCount" : "count";
  return {
    ...baseSpec,
    width: options.width || "container",
    height: options.height || 180,
    data: { values: histogramData.bins },
    mark: {
      type: "bar",
      opacity: 0.8,
      cornerRadiusEnd: 2,
    },
    encoding: {
      x: {
        field: "binStart",
        type: "quantitative",
        title: options.xLabel || null,
        bin: false,
        scale: {
          domain: histogramData.range,
          nice: false,
        },
      },
      x2: { field: "binEnd" },
      y: {
        field: yField,
        type: "quantitative",
        title: options.yLabel || null,
        scale: {
          domain: options.viewMode === "percentage" ? [0, 100] : undefined,
          nice: false,
        },
      },
    },
  };
}
