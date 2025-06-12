import { createBaseVegaSpec } from "./vega-base.js";
import {
  createNaturalBins,
  hasNaturalBuckets,
} from "../../core/data/bucketing.js";

function shouldUseIntegerBinning(values, maxIntegerBins = 50) {
  const uniqueValues = [...new Set(values)];
  const allIntegers = uniqueValues.every((val) => Number.isInteger(val));
  return allIntegers && uniqueValues.length <= maxIntegerBins;
}

function createHistogramBins(values, metricId) {
  if (shouldUseIntegerBinning(values)) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bins = [];
    for (let i = min; i <= max; i++) {
      const count = values.filter((v) => v === i).length;
      if (count > 0) {
        bins.push({
          binStart: i,
          binEnd: i + 1,
          binCenter: i,
          count: count,
          percentage: (count / values.length) * 100,
        });
      }
    }
    return bins;
  } else {
    if (hasNaturalBuckets(metricId)) {
      const naturalBins = createNaturalBins(values, metricId);
      return naturalBins
        .filter((bin) => bin.count > 0)
        .map((bin) => ({
          ...bin,
          binCenter:
            bin.logCenter || bin.binCenter || (bin.binStart + bin.binEnd) / 2,
          percentage: bin.percentageCount || (bin.count / values.length) * 100,
        }));
    } else {
      const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const binWidth = (max - min) / binCount;
      const bins = [];
      for (let i = 0; i < binCount; i++) {
        const binStart = min + i * binWidth;
        const binEnd =
          i === binCount - 1 ? max + 0.001 : min + (i + 1) * binWidth;
        const count = values.filter((v) => v >= binStart && v < binEnd).length;
        if (count > 0) {
          bins.push({
            binStart,
            binEnd,
            binCenter: (binStart + binEnd) / 2,
            count,
            percentage: (count / values.length) * 100,
          });
        }
      }
      return bins;
    }
  }
}

/**
 * Create side-by-side vertical box plots with optional histogram overlay
 * @param {Array} periodsData - Array of {period, values, color} objects
 * @param {Object} options - Visualization options
 * @returns {Object} - Vega-Lite specification with box plots and optional histogram bars
 */
export function createBoxPlotSpec(periodsData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const defaultOptions = {
    width: "container",
    height: 400,
    useLogScale: false,
    showPercentiles: true,
    showHistogram: false,
    histogramWidth: 0.3,
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
  const histogramData = [];
  if (defaultOptions.showHistogram) {
    periodsData.forEach((periodData, periodIndex) => {
      const bins = createHistogramBins(periodData.values, options.metricId);
      const maxPercentage = Math.max(...bins.map((b) => b.percentage));
      bins.forEach((bin) => {
        const normalizedWidth =
          (bin.percentage / maxPercentage) * defaultOptions.histogramWidth;
        histogramData.push({
          period: periodData.period,
          periodIndex: periodIndex,
          binStart: bin.binStart,
          binEnd: bin.binEnd,
          binCenter: bin.binCenter,
          percentage: bin.percentage,
          count: bin.count,
          barLeft: periodIndex - normalizedWidth / 2,
          barRight: periodIndex,
          side: "left",
        });
        histogramData.push({
          period: periodData.period,
          periodIndex: periodIndex,
          binStart: bin.binStart,
          binEnd: bin.binEnd,
          binCenter: bin.binCenter,
          percentage: bin.percentage,
          count: bin.count,
          barLeft: periodIndex,
          barRight: periodIndex + normalizedWidth / 2,
          side: "right",
        });
      });
    });
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
  if (defaultOptions.showHistogram) {
    layers.push({
      data: { name: "histogram" },
      mark: {
        type: "rect",
        opacity: 0.6,
        stroke: "white",
        strokeWidth: 0.5,
      },
      encoding: {
        x: {
          field: "barLeft",
          type: "quantitative",
          scale: {
            domain: [-0.5, periodsData.length - 0.5],
            range: "width",
          },
          axis: null,
        },
        x2: {
          field: "barRight",
          type: "quantitative",
        },
        y: {
          field: "binStart",
          type: "quantitative",
          scale: yEncoding.scale,
        },
        y2: {
          field: "binEnd",
          type: "quantitative",
        },
        fill: colorEncoding,
        tooltip: [
          { field: "period", title: "Period" },
          { field: "binCenter", title: "Value" },
          { field: "count", title: "Count" },
          { field: "percentage", title: "Percentage", format: ".1f" },
        ],
      },
    });
  }
  layers.push({
    data: { name: "values" },
    mark: {
      type: "boxplot",
      extent: "min-max",
      outliers: false,
      size: 40,
    },
    encoding: {
      x: sharedXEncoding,
      y: yEncoding,
      color: colorEncoding,
    },
  });
  if (defaultOptions.showPercentiles) {
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
  }
  const datasets = {
    values: combinedDataWithPosition,
    percentiles: percentileData,
  };
  if (defaultOptions.showHistogram) {
    datasets.histogram = histogramData;
  }
  return {
    ...baseSpec,
    width: defaultOptions.width,
    height: defaultOptions.height,
    datasets: datasets,
    layer: layers,
  };
}
