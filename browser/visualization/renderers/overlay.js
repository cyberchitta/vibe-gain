import { createBaseVegaSpec } from "./vega-base.js";

/**
 * Create a Vega-Lite specification for overlaid histograms
 * @param {Array} chartData - Array of prepared histogram data with period information
 * @param {Object} options - Rendering options
 * @returns {Object} - Vega-Lite specification for overlaid charts
 */
export function createOverlaySpec(chartData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const yField =
    options.viewMode === "percentage" ? "percentageCount" : "count";
  const combinedData = [];
  chartData.forEach((chart) => {
    const periodData = chart.histogram.bins.map((bin) => ({
      ...bin,
      period: chart.period,
    }));
    combinedData.push(...periodData);
  });
  return {
    ...baseSpec,
    width: options.width || "container",
    height: options.height || 180,
    data: { values: combinedData },
    layer: chartData.map((chart) => ({
      mark: {
        type: "bar",
        opacity: 0.6,
        cornerRadiusEnd: 2,
      },
      encoding: {
        x: {
          field: "binStart",
          type: "quantitative",
          title: null,
          bin: false,
          scale: {
            domain: options.range,
            nice: false,
          },
          axis: {
            grid: false,
            labels: true,
            labelOverlap: true,
          },
        },
        x2: { field: "binEnd" },
        y: {
          field: yField,
          type: "quantitative",
          title: null,
          axis: {
            grid: true,
            labels: true,
            format: yField === "percentageCount" ? ".0f" : "d",
          },
          scale: {
            domain:
              options.viewMode === "percentage" ? [0, 100] : options.yDomain,
            nice: false,
          },
        },
        color: {
          datum: chart.period,
        },
      },
      transform: [
        {
          filter: `datum.period === '${chart.period}'`,
        },
      ],
    })),
    encoding: {
      color: {
        field: "period",
        type: "nominal",
        scale: {
          domain: chartData.map((chart) => chart.period),
          range: chartData.map((chart) => chart.color || "var(--primary)"),
        },
        legend: null,
      },
    },
  };
}
