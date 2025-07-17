import { formatNumber } from "../../core/utils/format.js";
import { calculateBoxPlotStats } from "../../core/utils/array.js";
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
          binStart: i - 0.5,
          binEnd: i + 0.5,
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
    showStats: true,
    ...options,
  };
  const boxPlotData = [];
  const histogramData = [];
  let globalMin = Infinity;
  let globalMax = -Infinity;
  periodsData.forEach((periodData, periodIndex) => {
    const stats = calculateBoxPlotStats(periodData.values);
    if (!stats) return;
    boxPlotData.push({
      period: periodData.period,
      periodIndex: periodIndex,
      q1: stats.p25,
      median: stats.median,
      q3: stats.p75,
      p5: stats.p5,
      p95: stats.p95,
      lowerWhisker: stats.min,
      upperWhisker: stats.max,
      min: stats.min,
      max: stats.max,
      color: periodData.color,
    });
    boxPlotData.forEach((box, index) => {
      const baseBoxWidth = 0.125;
      const bandWidth = 1.0;
      const boxWidth = baseBoxWidth * bandWidth;
      box.boxLeft = index - boxWidth / 2;
      box.boxRight = index + boxWidth / 2;
    });
    if (periodData.values.length > 0) {
      const periodMin = Math.min(...periodData.values);
      const periodMax = Math.max(...periodData.values);
      globalMin = Math.min(globalMin, periodMin);
      globalMax = Math.max(globalMax, periodMax);
      if (defaultOptions.showHistogram) {
        const bins = createHistogramBins(periodData.values, options.metricId);
        const allBins = [];
        periodsData.forEach((pd) => {
          if (pd.values.length > 0) {
            allBins.push(...createHistogramBins(pd.values, options.metricId));
          }
        });
        const globalMaxPercentage =
          allBins.length > 0
            ? Math.max(...allBins.map((b) => b.percentage))
            : 1;
        bins.forEach((bin) => {
          let binStartClamped = bin.binStart;
          let binEndClamped =
            bin.binEnd === Infinity ? periodMax * 2 : bin.binEnd;
          if (binStartClamped < periodMin) binStartClamped = periodMin;
          if (binEndClamped > periodMax) binEndClamped = periodMax;
          if (binStartClamped >= binEndClamped) {
            if (periodMin === periodMax) {
              if (defaultOptions.useLogScale) {
                binEndClamped = binStartClamped * 1.01;
              } else {
                binEndClamped = binStartClamped + 1;
              }
            } else {
              return;
            }
          }
          const normalizedWidth =
            (bin.percentage / globalMaxPercentage) *
            defaultOptions.histogramWidth;
          histogramData.push({
            period: periodData.period,
            periodIndex: periodIndex,
            binStart: binStartClamped,
            binEnd: binEndClamped,
            percentage: bin.percentage,
            count: bin.count,
            barLeft: periodIndex - normalizedWidth / 2,
            barRight: periodIndex + normalizedWidth / 2,
            color: periodData.color,
          });
        });
      }
    }
  });
  const layers = [];
  layers.push({
    data: { values: boxPlotData },
    mark: {
      type: "rect",
      opacity: 1.0,
      stroke: { value: defaultOptions.whiskerColor },
      strokeWidth: 2,
    },
    encoding: {
      x: {
        field: "boxLeft",
        type: "quantitative",
        scale: {
          domain: [-0.5, periodsData.length - 0.5],
          range: "width",
        },
      },
      x2: {
        field: "boxRight",
        type: "quantitative",
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
        tooltip: null,
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
        strokeWidth: 1,
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
        strokeWidth: 1,
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
  if (options.referenceLines && options.referenceLines.length > 0) {
    options.referenceLines.forEach((refLine) => {
      if (refLine.value && refLine.value > 0) {
        const periodIndex = periodsData.findIndex(
          (p) => p.period === refLine.period
        );
        if (periodIndex >= 0) {
          layers.push({
            data: {
              values: [
                {
                  refValue: refLine.value,
                  period: refLine.period,
                  lineStart: periodIndex - 0.2,
                  lineEnd: periodIndex + 0.2,
                },
              ],
            },
            mark: {
              type: "rule",
              color: refLine.color || "#666",
              strokeWidth: 2,
              strokeDash: refLine.style === "dashed" ? [5, 5] : [],
              opacity: 0.8,
            },
            encoding: {
              x: {
                field: "lineStart",
                type: "quantitative",
                scale: {
                  domain: [-0.5, periodsData.length - 0.5],
                  range: "width",
                },
                axis: null,
              },
              x2: {
                field: "lineEnd",
                type: "quantitative",
              },
              y: {
                field: "refValue",
                type: "quantitative",
                scale: {
                  type: defaultOptions.useLogScale ? "log" : "linear",
                  ...(defaultOptions.useLogScale && { base: 10 }),
                  nice: !defaultOptions.useLogScale,
                },
              },
              tooltip: null,
            },
          });
          layers.push({
            data: {
              values: [
                {
                  refValue: refLine.value,
                  period: refLine.period,
                  labelX: periodIndex + 0.25,
                  labelText: `${refLine.value}min`,
                },
              ],
            },
            mark: {
              type: "text",
              align: "left",
              baseline: "middle",
              dx: 5,
              fontSize: 10,
              fontWeight: "bold",
              color: refLine.color || "#666",
            },
            encoding: {
              x: {
                field: "labelX",
                type: "quantitative",
                scale: {
                  domain: [-0.5, periodsData.length - 0.5],
                  range: "width",
                },
                axis: null,
              },
              y: {
                field: "refValue",
                type: "quantitative",
                scale: {
                  type: defaultOptions.useLogScale ? "log" : "linear",
                  ...(defaultOptions.useLogScale && { base: 10 }),
                  nice: !defaultOptions.useLogScale,
                },
              },
              text: {
                field: "labelText",
                type: "nominal",
              },
            },
          });
        }
      }
    });
  }
  if (defaultOptions.showStats) {
    const referenceLineData = [];
    boxPlotData.forEach((box, periodIndex) => {
      const values = [
        box.min,
        box.p5,
        box.q1,
        box.median,
        box.q3,
        box.p95,
        box.max,
      ].filter((val) => val !== null && val !== undefined);
      const uniqueValues = [...new Set(values)];
      uniqueValues.forEach((value) => {
        referenceLineData.push({
          periodIndex,
          value: value,
          label: formatNumber(value),
          lineStart: periodIndex,
          lineEnd: periodIndex + 0.2,
        });
      });
    });
    layers.push({
      data: { values: referenceLineData },
      mark: {
        type: "rule",
        strokeWidth: 1,
        strokeDash: [2, 2],
        opacity: 0.7,
        color: defaultOptions.labelColor || "#666",
      },
      encoding: {
        x: {
          field: "lineStart",
          type: "quantitative",
          scale: {
            domain: [-0.5, periodsData.length - 0.5],
            range: "width",
          },
        },
        x2: {
          field: "lineEnd",
          type: "quantitative",
        },
        y: {
          field: "value",
          type: "quantitative",
        },
      },
    });
    layers.push({
      data: { values: referenceLineData },
      mark: {
        type: "text",
        align: "left",
        baseline: "middle",
        dx: 5,
        fontSize: 9,
        fontWeight: "normal",
        color: defaultOptions.labelColor || "#666",
      },
      encoding: {
        x: {
          field: "lineEnd",
          type: "quantitative",
          scale: {
            domain: [-0.5, periodsData.length - 0.5],
            range: "width",
          },
        },
        y: {
          field: "value",
          type: "quantitative",
        },
        text: {
          field: "label",
          type: "nominal",
        },
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
        title: options.yLabel,
        scale: {
          type: defaultOptions.useLogScale ? "log" : "linear",
          ...(defaultOptions.useLogScale && { base: 10 }),
          nice: false,
          domain:
            globalMin === Infinity
              ? [0, 1]
              : defaultOptions.useLogScale
              ? [Math.max(0.1, globalMin), globalMax]
              : [globalMin, globalMax],
        },
        axis: {
          grid: true,
          ...(defaultOptions.useLogScale && {
            format: "~s",
          }),
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
