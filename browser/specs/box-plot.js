import { createBaseVegaSpec } from "./vega-base.js";

/**
 * Create side-by-side vertical box plots in a single unified spec
 * @param {Array} periodsData - Array of {period, values, color} objects
 * @param {Object} options - Visualization options
 * @returns {Object} - Vega-Lite specification with side-by-side box plots
 */
export function createBoxPlotSpec(periodsData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const defaultOptions = {
    width: "container",
    height: 400,
    useLogScale: false,
    showPercentiles: true,
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
  const xEncoding = {
    field: "period",
    type: "nominal",
    axis: null,
    sort: periodsData.map((p) => p.period),
    scale: {
      type: "band",
    },
  };
  const yEncoding = {
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
  };
  const colorEncoding = {
    field: "period",
    type: "nominal",
    scale: {
      domain: periodsData.map((p) => p.period),
      range: periodsData.map((p) => p.color),
    },
    legend: null,
  };
  if (!defaultOptions.showPercentiles) {
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
        x: xEncoding,
        y: yEncoding,
        color: colorEncoding,
      },
    };
  }
  const percentileData = [];
  periodsData.forEach((periodData) => {
    const sortedValues = [...periodData.values].sort((a, b) => a - b);
    const n = sortedValues.length;
    const p5Index = Math.floor(0.05 * (n - 1));
    const p95Index = Math.floor(0.95 * (n - 1));
    percentileData.push({
      period: periodData.period,
      p5: sortedValues[p5Index],
      p95: sortedValues[p95Index],
    });
  });
  return {
    ...baseSpec,
    width: defaultOptions.width,
    height: defaultOptions.height,
    datasets: {
      values: combinedData,
      percentiles: percentileData,
    },
    resolve: {
      scale: {
        x: "shared",
      },
    },
    layer: [
      {
        data: { name: "values" },
        mark: {
          type: "boxplot",
          extent: "min-max",
          outliers: false,
        },
        encoding: {
          x: xEncoding,
          y: yEncoding,
          color: colorEncoding,
        },
      },
      {
        data: { name: "percentiles" },
        layer: [
          {
            mark: {
              type: "tick",
              size: 15,
              thickness: 2,
              opacity: 0.8,
            },
            encoding: {
              x: xEncoding,
              y: { field: "p5", type: "quantitative" },
              color: colorEncoding,
            },
          },
          {
            mark: {
              type: "tick",
              size: 15,
              thickness: 2,
              opacity: 0.8,
            },
            encoding: {
              x: xEncoding,
              y: { field: "p95", type: "quantitative" },
              color: colorEncoding,
            },
          },
        ],
      },
    ],
  };
}
