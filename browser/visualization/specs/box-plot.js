import { createBaseVegaSpec } from "./vega-base.js";

/**
 * Create side-by-side vertical box plots in a single unified spec
 * @param {Array} periodsData - Array of {period, values, color} objects
 * @param {Object} options - Visualization options
 * @returns {Object} - Vega-Lite specification with side-by-side box plots
 */
export function createSideBySideBoxPlotSpec(periodsData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const defaultOptions = {
    width: "container",
    height: 400,
    useLogScale: false,
    ...options,
  };
  const combinedData = [];
  periodsData.forEach((periodData) => {
    periodData.values.forEach((value) => {
      combinedData.push({
        period: periodData.period,
        value: value,
      });
    });
  });
  return {
    ...baseSpec,
    width: defaultOptions.width,
    height: defaultOptions.height,
    data: { values: combinedData },
    mark: {
      type: "boxplot",
      extent: "min-max",
    },
    encoding: {
      x: {
        field: "period",
        type: "nominal",
        axis: null,
        sort: periodsData.map((p) => p.period),
      },
      y: {
        field: "value",
        type: "quantitative",
        title: options.yLabel || "Value",
        scale: {
          type: defaultOptions.useLogScale ? "log" : "linear",
          ...(defaultOptions.useLogScale && { base: 10 }),
          nice: !defaultOptions.useLogScale,
        },
        axis: {
          grid: true,
          ...(defaultOptions.useLogScale && { format: "~s" }),
        },
      },
      color: {
        field: "period",
        type: "nominal",
        scale: {
          domain: periodsData.map((p) => p.period),
          range: periodsData.map((p) => p.color),
        },
        legend: null,
      },
    },
  };
}
