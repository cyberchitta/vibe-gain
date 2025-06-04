import { createBaseVegaSpec } from "./vega-base.js";

/**
 * Create Vega-Lite specification for a single box plot (for one period)
 * @param {Object} periodData - {period, values, color} object
 * @param {Object} options - Visualization options
 * @returns {Object} - Vega-Lite specification for single box plot
 */
export function createSingleBoxPlotSpec(periodData, options = {}) {
  const baseSpec = createBaseVegaSpec();
  const defaultOptions = {
    width: 600,
    height: 60,
    boxHeight: 20,
    yPosition: 30, // Center position
    ...options,
  };

  const boxPlotData = periodData.values.map((v) => ({
    value: v,
    period: periodData.period,
    yPosition: defaultOptions.yPosition,
    yTop: defaultOptions.yPosition + defaultOptions.boxHeight / 2,
    yBottom: defaultOptions.yPosition - defaultOptions.boxHeight / 2,
  }));

  return {
    ...baseSpec,
    width: defaultOptions.width,
    height: defaultOptions.height,
    data: { values: boxPlotData },
    layer: [
      // Box (Q1 to Q3)
      {
        transform: [
          {
            aggregate: [
              { op: "q1", field: "value", as: "q1" },
              { op: "q3", field: "value", as: "q3" },
            ],
          },
        ],
        mark: {
          type: "bar",
          height: defaultOptions.boxHeight,
          color: periodData.color,
          opacity: 0.8,
        },
        encoding: {
          x: {
            field: "q1",
            type: "quantitative",
            axis: null,
            scale: options.xScale || {},
          },
          x2: { field: "q3", type: "quantitative" },
          y: { value: defaultOptions.yPosition },
        },
      },
      // Median line
      {
        transform: [
          {
            aggregate: [{ op: "median", field: "value", as: "median" }],
          },
        ],
        mark: {
          type: "rule",
          color: "#2c3e50",
          strokeWidth: 2,
        },
        encoding: {
          x: { field: "median", type: "quantitative" },
          y: { value: defaultOptions.yPosition - defaultOptions.boxHeight / 2 },
          y2: {
            value: defaultOptions.yPosition + defaultOptions.boxHeight / 2,
          },
        },
      },
      // Whiskers
      {
        transform: [
          {
            aggregate: [
              { op: "min", field: "value", as: "min" },
              { op: "q1", field: "value", as: "q1" },
              { op: "q3", field: "value", as: "q3" },
              { op: "max", field: "value", as: "max" },
            ],
          },
        ],
        layer: [
          // Left whisker
          {
            mark: {
              type: "rule",
              color: periodData.color,
              strokeWidth: 1,
            },
            encoding: {
              x: { field: "min", type: "quantitative" },
              x2: { field: "q1", type: "quantitative" },
              y: { value: defaultOptions.yPosition },
            },
          },
          // Right whisker
          {
            mark: {
              type: "rule",
              color: periodData.color,
              strokeWidth: 1,
            },
            encoding: {
              x: { field: "q3", type: "quantitative" },
              x2: { field: "max", type: "quantitative" },
              y: { value: defaultOptions.yPosition },
            },
          },
        ],
      },
    ],
  };
}

/**
 * Create Vega-Lite specification for box plots (legacy - for backward compatibility)
 */
export function createBoxPlotSpec(periodsData, options = {}) {
  // For backward compatibility, create a combined spec
  const defaultOptions = {
    width: 600,
    height: 150,
    boxHeight: 20,
    spacing: 40,
    ...options,
  };

  const boxPlotData = periodsData
    .map((periodData, index) => {
      const yPos = index * defaultOptions.spacing + defaultOptions.spacing / 2;
      const values = periodData.values.map((v) => ({
        value: v,
        period: periodData.period,
        yPosition: yPos,
        yTop: yPos + defaultOptions.boxHeight / 2,
        yBottom: yPos - defaultOptions.boxHeight / 2,
      }));
      return values;
    })
    .flat();

  const baseSpec = createBaseVegaSpec();
  return {
    ...baseSpec,
    width: defaultOptions.width,
    height:
      periodsData.length * defaultOptions.spacing + defaultOptions.spacing,
    data: { values: boxPlotData },
    layer: [
      // Box plots for all periods
      ...periodsData
        .map((periodData, index) => {
          const yPos =
            index * defaultOptions.spacing + defaultOptions.spacing / 2;
          return createSingleBoxPlotSpec(periodData, {
            ...defaultOptions,
            yPosition: yPos,
            height: defaultOptions.spacing,
          }).layer;
        })
        .flat(),
    ],
  };
}
