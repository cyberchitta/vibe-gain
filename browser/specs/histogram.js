import { getBaseVegaLiteSpec } from "./vega-base.js";
import { TIME_DURATION_METRICS } from "../../core/data/bucketing.js";

/**
 * Create a Vega-Lite specification for overlaid charts using natural buckets with bin edges
 * @param {Array} chartData - Array of prepared chart data from prepareHistogramData
 * @param {Object} options - Rendering options
 * @returns {Object} - Vega-Lite specification for overlaid charts
 */
export function createHistogramSpec(chartData, options = {}) {
  const baseSpec = getBaseVegaLiteSpec();
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
  let yDomain = null;
  if (combinedData.length > 0) {
    const minValue = Math.min(...combinedData.map((d) => d.xStart));
    const maxValue = Math.max(...combinedData.map((d) => d.xEnd));
    const maxYValue = Math.max(...combinedData.map((d) => d[yField]));
    if (options.useLogScale) {
      const logMin = Math.max(0.1, minValue);
      const logMax = maxValue;
      xDomain = [logMin, logMax];
    } else {
      const linearMin = Math.min(0, minValue);
      xDomain = [linearMin, maxValue];
    }
    yDomain =
      options.viewMode === "percentage"
        ? options.yDomain || [0, 100]
        : options.yDomain || [0, maxYValue];
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
  if (options.useLogScale && TIME_DURATION_METRICS.includes(options.metricId)) {
    xAxisConfig.axis.labelExpr = `
      datum.value < 60 ? datum.value + ' min' : 
      datum.value < 1440 ? round(datum.value/60 * 10)/10 + ' hr' : 
      round(datum.value/1440 * 10)/10 + ' day'
    `;
  }
  const yAxisConfig = {
    field: yField,
    type: "quantitative",
    title: options.yLabel,
    axis: {
      grid: true,
      labels: true,
      format: yField === "percentageCount" ? ".1f" : "d",
    },
    scale: {
      domain: yDomain,
      nice: options.viewMode !== "percentage",
    },
  };
  const layers = [];
  layers.push({
    data: { values: combinedData },
    mark: {
      type: "bar",
      opacity: 0.7,
      cornerRadiusEnd: 2,
    },
    encoding: {
      x: xAxisConfig,
      x2: {
        field: "xEnd",
      },
      y: yAxisConfig,
      color: {
        field: "period",
        type: "nominal",
        scale: {
          domain: chartData.map((chart) => chart.period),
          range: chartData.map((chart) => chart.color),
        },
        legend:
          options.showLegend === false
            ? null
            : {
                title: "Period",
                orient: "top-right",
              },
      },
      tooltip: null,
    },
  });
  if (options.referenceLines && options.referenceLines.length > 0) {
    options.referenceLines.forEach((refLine) => {
      if (refLine.value !== undefined && refLine.value !== null) {
        const lineEndPercent = 25;
        const labelPercent = 27;
        const yMin = yDomain ? yDomain[0] : 0;
        const yMax = yDomain ? yDomain[1] : 100;
        const yRange = yMax - yMin;
        const lineEndValue = yMin + (yRange * lineEndPercent) / 100;
        const labelValue = yMin + (yRange * labelPercent) / 100;
        layers.push({
          data: {
            values: [
              {
                refValue: refLine.value,
                yStart: yMin,
                yEnd: lineEndValue,
              },
            ],
          },
          mark: {
            type: "rule",
            color: refLine.color || "#666",
            strokeWidth: refLine.strokeWidth || 2,
            strokeDash: refLine.style === "dashed" ? [5, 5] : [],
            opacity: refLine.opacity || 0.8,
          },
          encoding: {
            x: {
              field: "refValue",
              type: "quantitative",
              scale: xAxisConfig.scale,
            },
            y: {
              field: "yStart",
              type: "quantitative",
              scale: yAxisConfig.scale,
            },
            y2: {
              field: "yEnd",
              type: "quantitative",
            },
            tooltip: null,
          },
        });
        if (refLine.label) {
          layers.push({
            data: {
              values: [
                {
                  refValue: refLine.value,
                  labelY: labelValue,
                  labelText: refLine.label,
                },
              ],
            },
            mark: {
              type: "text",
              align: "center",
              baseline: "bottom",
              fontSize: refLine.fontSize || 10,
              fontWeight: refLine.fontWeight || "bold",
              color: refLine.color || "#666",
            },
            encoding: {
              x: {
                field: "refValue",
                type: "quantitative",
                scale: xAxisConfig.scale,
              },
              y: {
                field: "labelY",
                type: "quantitative",
                scale: yAxisConfig.scale,
              },
              text: {
                field: "labelText",
                type: "nominal",
              },
              tooltip: null,
            },
          });
        }
      }
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
  };
}
