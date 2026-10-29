import { formatNumber } from "../../core/utils/format.js";
import { getBaseVegaLiteSpec } from "./vega-base.js";

/**
 * Side-by-side vertical box plots with an optional histogram overlay, drawn
 * from figures and bins each period carries (`periodGroup` computes them).
 * The drawing behind `createBoxPlotSpec`, kept as published charts show it.
 * @param {Array} groups - {label, color, figures (null: no values), bins} per period
 * @param {Object} options - Visualization options; `durationAxis` labels a
 *   log axis in sec / min / hr
 * @returns {Object} - Vega-Lite specification with box plots and optional histogram bars
 */
export function createPeriodBoxPlotSpec(groups, options = {}) {
  const baseSpec = getBaseVegaLiteSpec();
  const defaultOptions = {
    width: "container",
    height: "container",
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
    showValues: true,
    durationAxis: false,
    ...options,
  };
  const boxPlotData = [];
  const histogramData = [];
  let globalMin = Infinity;
  let globalMax = -Infinity;
  const allBins = groups.flatMap((g) => g.bins);
  const globalMaxPercentage =
    allBins.length > 0 ? Math.max(...allBins.map((b) => b.share * 100)) : 1;
  groups.forEach((group, periodIndex) => {
    const stats = group.figures;
    if (!stats) return;
    boxPlotData.push({
      period: group.label,
      periodIndex: periodIndex,
      q1: stats.q1,
      median: stats.median,
      q3: stats.q3,
      p5: stats.p5,
      p95: stats.p95,
      lowerWhisker: stats.min,
      upperWhisker: stats.max,
      min: stats.min,
      max: stats.max,
      color: group.color,
    });
    boxPlotData.forEach((box, index) => {
      const baseBoxWidth = 0.125;
      const bandWidth = 1.0;
      const boxWidth = baseBoxWidth * bandWidth;
      box.boxLeft = index - boxWidth / 2;
      box.boxRight = index + boxWidth / 2;
    });
    const periodMin = stats.min;
    const periodMax = stats.max;
    globalMin = Math.min(globalMin, periodMin);
    globalMax = Math.max(globalMax, periodMax);
    if (defaultOptions.showHistogram) {
      group.bins.forEach((bin) => {
        const percentage = bin.share * 100;
        let binStartClamped = bin.lo;
        let binEndClamped = bin.hi === Infinity ? periodMax * 2 : bin.hi;
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
          (percentage / globalMaxPercentage) * defaultOptions.histogramWidth;
        histogramData.push({
          period: group.label,
          periodIndex: periodIndex,
          binStart: binStartClamped,
          binEnd: binEndClamped,
          percentage: percentage,
          count: bin.count,
          barLeft: periodIndex - normalizedWidth / 2,
          barRight: periodIndex + normalizedWidth / 2,
          color: group.color,
        });
      });
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
          domain: [-0.5, groups.length - 0.5],
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
            domain: [-0.5, groups.length - 0.5],
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
        const periodIndex = groups.findIndex(
          (g) => g.label === refLine.period
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
                  domain: [-0.5, groups.length - 0.5],
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
                  domain: [-0.5, groups.length - 0.5],
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
      const pct = (val) => (defaultOptions.showPercentiles ? val : null);
      const values = [
        box.min,
        pct(box.p5),
        box.q1,
        box.median,
        box.q3,
        pct(box.p95),
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
        color: defaultOptions.labelColor,
      },
      encoding: {
        x: {
          field: "lineStart",
          type: "quantitative",
          scale: {
            domain: [-0.5, groups.length - 0.5],
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
        color: defaultOptions.labelColor,
      },
      encoding: {
        x: {
          field: "lineEnd",
          type: "quantitative",
          scale: {
            domain: [-0.5, groups.length - 0.5],
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
  if (defaultOptions.showValues && defaultOptions.showHistogram) {
    const histogramValueData = histogramData
      .filter((bin) => bin.count > 0)
      .map((bin) => ({
        ...bin,
        labelValue:
          bin.percentage > 0
            ? bin.percentage.toFixed(1) + "%"
            : bin.count.toString(),
        labelX: bin.periodIndex + 0.18,
        labelY: defaultOptions.useLogScale
          ? Math.sqrt(bin.binStart * bin.binEnd)
          : (bin.binStart + bin.binEnd) / 2,
      }));
    layers.push({
      data: { values: histogramValueData },
      mark: {
        type: "text",
        align: "left",
        baseline: "middle",
        fontSize: 9,
        fontWeight: "normal",
        color: defaultOptions.labelColor,
      },
      encoding: {
        x: {
          field: "labelX",
          type: "quantitative",
          scale: {
            domain: [-0.5, groups.length - 0.5],
            range: "width",
          },
        },
        y: {
          field: "labelY",
          type: "quantitative",
          scale: {
            type: defaultOptions.useLogScale ? "log" : "linear",
            ...(defaultOptions.useLogScale && { base: 10 }),
            nice: !defaultOptions.useLogScale,
          },
        },
        text: {
          field: "labelValue",
          type: "nominal",
        },
        tooltip: null,
      },
    });
  }
  return {
    ...baseSpec,
    width: "container",
    height: "container",
    layer: layers,
    resolve: {
      scale: { x: "shared", y: "shared" },
    },
    encoding: {
      x: {
        field: "periodIndex",
        type: "ordinal",
        scale: {
          domain: groups.map((_, i) => i),
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
          nice: !defaultOptions.useLogScale,
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
            defaultOptions.durationAxis && {
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
