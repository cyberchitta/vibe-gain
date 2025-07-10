import { createBaseVegaSpec } from "./vega-base.js";
import {
  TIME_DURATION_METRICS,
  createNaturalBins,
  hasNaturalBuckets,
} from "../../core/data/bucketing.js";

function shouldUseIntegerBinning(values, maxIntegerBins = 50) {
  const uniqueValues = [...new Set(values)];
  const allIntegers = uniqueValues.every((val) => Number.isInteger(val));
  return allIntegers && uniqueValues.length <= maxIntegerBins;
}

function createHistogramBins(values, metricId) {
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
  } else if (shouldUseIntegerBinning(values)) {
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
    showHistogram: true,
    histogramWidth: 0.3,
    whiskerColor: "#666",
    medianColor: "#000",
    percentileStroke: "#666",
    percentileFill: "white",
    labelColor: "#333",
    ...options,
  };
  const boxPlotData = [];
  const histogramData = [];
  periodsData.forEach((periodData, periodIndex) => {
    const sortedValues = [...periodData.values].sort((a, b) => a - b);
    const n = sortedValues.length;
    if (n === 0) return;
    const q1Index = Math.floor(0.25 * (n - 1));
    const q2Index = Math.floor(0.5 * (n - 1));
    const q3Index = Math.floor(0.75 * (n - 1));
    const p5Index = Math.floor(0.05 * (n - 1));
    const p95Index = Math.floor(0.95 * (n - 1));
    const q1 = sortedValues[q1Index];
    const median = sortedValues[q2Index];
    const q3 = sortedValues[q3Index];
    const p5 = sortedValues[p5Index];
    const p95 = sortedValues[p95Index];
    const min = sortedValues[0];
    const max = sortedValues[n - 1];
    const lowerWhisker = min;
    const upperWhisker = max;
    boxPlotData.push({
      period: periodData.period,
      periodIndex: periodIndex,
      q1: q1,
      median: median,
      q3: q3,
      p5: p5,
      p95: p95,
      lowerWhisker: lowerWhisker,
      upperWhisker: upperWhisker,
      min: min,
      max: max,
      color: periodData.color,
    });
    if (defaultOptions.showHistogram) {
      const bins = createHistogramBins(periodData.values, options.metricId);
      const allBins = [];
      periodsData.forEach((pd) => {
        if (pd.values.length > 0) {
          allBins.push(...createHistogramBins(pd.values, options.metricId));
        }
      });
      const globalMaxPercentage =
        allBins.length > 0 ? Math.max(...allBins.map((b) => b.percentage)) : 1;
      bins.forEach((bin) => {
        const normalizedWidth =
          (bin.percentage / globalMaxPercentage) *
          defaultOptions.histogramWidth;
        histogramData.push({
          period: periodData.period,
          periodIndex: periodIndex,
          binStart: bin.binStart,
          binEnd: bin.binEnd,
          percentage: bin.percentage,
          count: bin.count,
          barLeft: periodIndex - normalizedWidth / 2,
          barRight: periodIndex + normalizedWidth / 2,
          color: periodData.color,
        });
      });
    }
  });
  const layers = [];
  layers.push({
    data: { values: boxPlotData },
    mark: {
      type: "rect",
      opacity: 0.6,
      stroke: "white",
      strokeWidth: 1,
      width: 40,
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
      },
      y: {
        field: "q1",
        type: "quantitative",
      },
      y2: {
        field: "q3",
        type: "quantitative",
      },
      fill: {
        field: "color",
        type: "nominal",
        scale: null,
      },
    },
  });
  if (defaultOptions.showHistogram) {
    layers.push({
      data: { values: histogramData },
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
        },
        x2: {
          field: "barRight",
          type: "quantitative",
        },
        y: {
          field: "binStart",
          type: "quantitative",
        },
        y2: {
          field: "binEnd",
          type: "quantitative",
        },
        fill: {
          field: "color",
          type: "nominal",
          scale: null,
        },
        tooltip: [
          { field: "period", title: "Period" },
          { field: "binStart", title: "Range Start" },
          { field: "binEnd", title: "Range End" },
          { field: "count", title: "Count" },
          { field: "percentage", title: "Percentage", format: ".1f" },
        ],
      },
    });
  } 
  layers.push({
    data: { values: boxPlotData },
    mark: {
      type: "rule",
      strokeWidth: 1,
      color: defaultOptions.whiskerColor,
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
      },
      y: {
        field: "lowerWhisker",
        type: "quantitative",
      },
      y2: {
        field: "q1",
        type: "quantitative",
      },
    },
  });
  layers.push({
    data: { values: boxPlotData },
    mark: {
      type: "rule",
      strokeWidth: 1,
      color: defaultOptions.whiskerColor,
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
      },
      y: {
        field: "q3",
        type: "quantitative",
      },
      y2: {
        field: "upperWhisker",
        type: "quantitative",
      },
    },
  });
  layers.push({
    data: { values: boxPlotData },
    mark: {
      type: "tick",
      strokeWidth: 1,
      color: defaultOptions.whiskerColor,
      size: 20,
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
      },
      y: {
        field: "lowerWhisker",
        type: "quantitative",
      },
    },
  });
  layers.push({
    data: { values: boxPlotData },
    mark: {
      type: "tick",
      strokeWidth: 1,
      color: defaultOptions.whiskerColor,
      size: 20,
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
      },
      y: {
        field: "upperWhisker",
        type: "quantitative",
      },
    },
  });
  layers.push({
    data: { values: boxPlotData },
    mark: {
      type: "point",
      shape: "square",
      size: 60,
      strokeWidth: 0,
      opacity: 1.0,
      filled: true,
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
      },
      y: {
        field: "median",
        type: "quantitative",
      },
      fill: { value: defaultOptions.medianColor },
    },
  });
  if (defaultOptions.showPercentiles) {
    layers.push({
      data: { values: boxPlotData },
      mark: {
        type: "point",
        shape: "cross",
        size: 60,
        strokeWidth: 2,
        filled: true,
        opacity: 1.0,
      },
      encoding: {
        x: {
          field: "periodIndex",
          type: "ordinal",
        },
        y: {
          field: "p5",
          type: "quantitative",
        },
        fill: { value: defaultOptions.percentileFill },
        stroke: { value: defaultOptions.percentileStroke },
      },
    });
    layers.push({
      data: { values: boxPlotData },
      mark: {
        type: "point",
        shape: "cross",
        size: 60,
        strokeWidth: 2,
        filled: true,
        opacity: 1.0,
      },
      encoding: {
        x: {
          field: "periodIndex",
          type: "ordinal",
        },
        y: {
          field: "p95",
          type: "quantitative",
        },
        fill: { value: defaultOptions.percentileFill },
        stroke: { value: defaultOptions.percentileStroke },
      },
    });
  }
  return {
    ...baseSpec,
    width: defaultOptions.width,
    height: defaultOptions.height,
    layer: layers,
    resolve: {
      scale: { x: "shared", y: "shared" },
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
        scale: {
          domain: periodsData.map((_, i) => i),
        },
        axis: {
          labels: false,
          title: null,
          ticks: false,
          domain: false,
        },
      },
      y: {
        field: "median",
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
          ...(defaultOptions.useLogScale &&
            TIME_DURATION_METRICS.includes(options.metricId) && {
              labelExpr: `
          datum.value < 1 ? round(datum.value * 60) + ' sec' :
          datum.value < 60 ? round(datum.value * 10)/10 + ' min' : 
          round(datum.value/60 * 10)/10 + ' hr'
        `,
            }),
        },
      },
    },
  };
}
