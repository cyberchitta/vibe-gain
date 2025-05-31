import { createBaseVegaSpec } from "./vega-base.js";
import {
  prepareNaturalBucketData,
  hasNaturalBuckets,
} from "../data/bucketing.js";

/**
 * Prepare overlay data using natural buckets when available
 * @param {Array} periodsData - Array of {period, metricData, color} objects
 * @param {string} metricId - Metric identifier
 * @param {Object} options - Options for bucketing and display
 * @returns {Array} - Array of prepared chart data with natural buckets
 */
export function prepareOverlayData(periodsData, metricId, options = {}) {
  const useNaturalBuckets =
    options.useNaturalBuckets !== false && hasNaturalBuckets(metricId);
  if (!useNaturalBuckets) {
    // Fallback to existing logic for metrics without natural buckets
    throw new Error(
      `Natural buckets not available for metric: ${metricId}. Please define natural buckets first.`
    );
  }
  return periodsData.map((periodData) => {
    const bucketData = prepareNaturalBucketData(
      periodData.metricData,
      metricId,
      options
    );
    return {
      period: periodData.period,
      bucketData: bucketData,
      color: periodData.color,
      metricId: metricId,
    };
  });
}

/**
 * Create a Vega-Lite specification for overlaid charts using natural buckets with bin edges
 * @param {Array} chartData - Array of prepared chart data from prepareOverlayData
 * @param {Object} options - Rendering options
 * @returns {Object} - Vega-Lite specification for overlaid charts
 */
export function createOverlaySpec(chartData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const yField =
    options.viewMode === "percentage" ? "percentageCount" : "count";
  const combinedData = [];
  chartData.forEach((chart) => {
    const periodData = chart.bucketData.bins.map((bin) => ({
      ...bin,
      period: chart.period,
      metricId: chart.metricId,
      xStart: bin.binStart,
      xEnd: bin.binEnd === Infinity ? bin.binStart * 3 : bin.binEnd,
    }));
    combinedData.push(...periodData);
  });
  let xDomain = null;
  if (combinedData.length > 0) {
    const minValue = Math.min(...combinedData.map((d) => d.xStart));
    const maxValue = Math.max(...combinedData.map((d) => d.xEnd));
    if (options.useLogScale) {
      const logMin = Math.max(0.1, minValue);
      const logMax = maxValue;
      xDomain = [logMin, logMax];
    } else {
      const linearMin = Math.min(0, minValue);
      xDomain = [linearMin, maxValue];
    }
  }
  const xAxisConfig = {
    field: "xStart",
    type: "quantitative",
    title: options.xLabel,
    scale: {
      type: options.useLogScale ? "log" : "linear",
      ...(options.useLogScale && { base: 10 }),
      ...(xDomain && { domain: xDomain }),
      nice: !options.useLogScale,
    },
    axis: {
      grid: true,
      labels: true,
      ...(options.tickValues && { values: options.tickValues }),
      ...(options.useLogScale && {
        format: "~s",
        labelAngle: -45,
        labelAlign: "right",
        labelBaseline: "middle",
      }),
    },
  };
  if (
    options.useLogScale &&
    options.xLabel &&
    options.xLabel.toLowerCase().includes("time")
  ) {
    xAxisConfig.axis.labelExpr = `
      datum.value < 60 ? datum.value + ' min' : 
      datum.value < 1440 ? round(datum.value/60 * 10)/10 + ' hr' : 
      round(datum.value/1440 * 10)/10 + ' day'
    `;
  }
  return {
    ...baseSpec,
    width: options.width || "container",
    height: options.height || 180,
    data: { values: combinedData },
    encoding: {
      x: xAxisConfig,
      x2: {
        field: "xEnd",
      },
      y: {
        field: yField,
        type: "quantitative",
        title: options.yLabel,
        axis: {
          grid: true,
          labels: true,
          format: yField === "percentageCount" ? ".1f" : "d",
        },
        scale: {
          domain:
            options.viewMode === "percentage" ? [0, 100] : options.yDomain,
          nice: options.viewMode !== "percentage",
        },
      },
      color: {
        field: "period",
        type: "nominal",
        scale: {
          domain: chartData.map((chart) => chart.period),
          range: chartData.map((chart) => chart.color),
        },
        legend: {
          title: "Period",
          orient: "top-right",
        },
      },
      tooltip: [
        { field: "binLabel", title: "Range" },
        { field: "period", title: "Period" },
        {
          field: yField,
          title: options.yLabel,
          format: yField === "percentageCount" ? ".1f" : "d",
        },
      ],
    },
    mark: {
      type: "bar",
      opacity: 0.7,
      cornerRadiusEnd: 2,
    },
  };
}
