import { createBaseVegaSpec } from "./vega-base.js";

/**
 * Create side-by-side vertical box plots with optional dot overlay
 * @param {Array} periodsData - Array of {period, values, color} objects
 * @param {Object} options - Visualization options
 * @returns {Object} - Vega-Lite specification with box plots and optional dots
 */
export function createBoxPlotSpec(periodsData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const defaultOptions = {
    width: "container",
    height: 400,
    useLogScale: false,
    showPercentiles: true,
    showDots: false,
    dotOptions: {},
    ...options,
  };
  const combinedDataWithPosition = [];
  periodsData.forEach((periodData, periodIndex) => {
    periodData.values.forEach((value) => {
      combinedDataWithPosition.push({
        period: periodData.period,
        periodIndex: periodIndex,
        value: value,
      });
    });
  });
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
  const sharedXEncoding = {
    field: "period",
    type: "nominal",
    sort: periodsData.map((p) => p.period),
    axis: null,
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
  const layers = [];
  if (defaultOptions.showDots) {
    layers.push({
      data: { name: "values" },
      mark: {
        type: "point",
        size: defaultOptions.dotOptions.dotSize || 6,
        opacity: defaultOptions.dotOptions.opacity || 0.3,
        filled: true,
      },
      transform: [
        {
          calculate: `datum.periodIndex + (random() - 0.5) * 0.3`,
          as: "jitteredX",
        },
      ],
      encoding: {
        x: {
          field: "jitteredX",
          type: "quantitative",
          scale: {
            domain: [-0.5, periodsData.length - 0.5],
            range: "width",
          },
          axis: null,
        },
        y: { field: "value", type: "quantitative" },
        color: { field: "period", type: "nominal" },
      },
    });
  }
  layers.push({
    data: { name: "values" },
    mark: {
      type: "boxplot",
      extent: "min-max",
      outliers: false,
    },
    encoding: {
      x: sharedXEncoding,
      y: yEncoding,
      color: colorEncoding,
    },
  });
  layers.push({
    data: { name: "percentiles" },
    layer: [
      {
        mark: {
          type: "point",
          shape: "cross",
          size: 40,
          stroke: 1,
          opacity: 0.8,
        },
        encoding: {
          x: sharedXEncoding,
          y: { field: "p5", type: "quantitative" },
          stroke: colorEncoding,
        },
      },
      {
        mark: {
          type: "point",
          shape: "cross",
          size: 40,
          stroke: 1,
          opacity: 0.8,
        },
        encoding: {
          x: sharedXEncoding,
          y: { field: "p95", type: "quantitative" },
          stroke: colorEncoding,
        },
      },
    ],
  });
  return {
    ...baseSpec,
    width: defaultOptions.width,
    height: defaultOptions.height,
    datasets: {
      values: combinedDataWithPosition,
      percentiles: percentileData,
    },
    layer: layers,
  };
}
