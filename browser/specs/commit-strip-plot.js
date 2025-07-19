import {
  generateGroupColors,
  generateShapeDefinitions,
} from "../charts/commit-strip-plot.js";

/**
 * Create complete Vega specification for commit strip plot
 * @param {Object} data - Prepared strip plot data
 * @param {Object} options - Visualization options
 * @returns {Object} - Complete Vega specification
 */
export function createStripPlotSpec(data, options = {}) {
  const defaultOptions = {
    width: 800,
    height: 400,
    groupCount: 4,
    showDocOnlyIndicators: true,
    showSessionLines: true,
    sessionLineWidth: 2,
    sessionLineOpacity: 0.8,
    orientation: "landscape", // 'landscape' | 'portrait'
    xLabel: undefined,
    yLabel: undefined,
    dateFormat: "%b %d",
    isDark: false,
    ...options,
  };
  const sessionLineColor = defaultOptions.isDark ? "#ffffff" : "#000000";
  const colors = generateGroupColors(defaultOptions.groupCount);
  const shapes = generateShapeDefinitions();
  const isPortrait = defaultOptions.orientation === "portrait";
  const getXLabel = () => {
    if (defaultOptions.xLabel === null) return null;
    if (defaultOptions.xLabel !== undefined) return defaultOptions.xLabel;
    return isPortrait ? "Hour of Day" : "Date";
  };
  const getYLabel = () => {
    if (defaultOptions.yLabel === null) return null;
    if (defaultOptions.yLabel !== undefined) return defaultOptions.yLabel;
    return isPortrait ? "Date" : "Hour of Day";
  };
  const timeDomain = [
    {
      signal: `datetime(${data.metadata.periodRange.start.getFullYear()}, ${data.metadata.periodRange.start.getMonth()}, ${data.metadata.periodRange.start.getDate()})`,
    },
    {
      signal: `datetime(${data.metadata.periodRange.end.getFullYear()}, ${data.metadata.periodRange.end.getMonth()}, ${data.metadata.periodRange.end.getDate()})`,
    },
  ];
  const xConfig = isPortrait
    ? {
        type: "linear",
        domain: [0, 24],
        title: getXLabel(),
        timeField: false,
      }
    : {
        type: "time",
        domain: timeDomain,
        title: getXLabel(),
        timeField: true,
      };
  const yConfig = isPortrait
    ? {
        type: "time",
        domain: timeDomain,
        title: getYLabel(),
        timeField: true,
      }
    : {
        type: "linear",
        domain: [0, 24],
        title: getYLabel(),
        timeField: false,
      };
  const scales = [
    {
      name: "xScale",
      type: xConfig.type,
      domain: xConfig.domain,
      range: [0, { signal: "width" }],
      nice: false,
      zero: xConfig.type === "linear" ? false : undefined,
    },
    {
      name: "yScale",
      type: yConfig.type,
      domain: yConfig.domain,
      range: "height",
      reverse: true,
      nice: false,
      zero: yConfig.type === "linear" ? false : undefined,
    },
    {
      name: "colorScale",
      type: "ordinal",
      domain: ["group0", "group1", "group2", "group3"],
      range: colors,
    },
    {
      name: "shapeScale",
      type: "ordinal",
      domain: ["circle", "square", "triangle", "diamond", "cross"],
      range: shapes,
    },
    {
      name: "opacityScale",
      type: "log",
      domain: [1, 1000],
      range: [0.3, 1.0],
      clamp: true,
    },
  ];
  const xField = isPortrait
    ? { scale: "xScale", field: "hourDecimal" }
    : { scale: "xScale", field: "dayTimestamp" };
  const yField = isPortrait
    ? { scale: "yScale", field: "dayTimestamp" }
    : { scale: "yScale", field: "hourDecimal" };
  const marks = [
    {
      name: "commitMarks",
      type: "symbol",
      from: { data: "commits" },
      encode: {
        enter: {
          fill: { scale: "colorScale", field: "repoGroup" },
          stroke: { value: "#333333" },
          strokeWidth: { value: 0.5 },
          size: { value: 4 },
          opacity: { scale: "opacityScale", field: "commitSize" },
        },
        update: {
          x: xField,
          y: yField,
          shape: { scale: "shapeScale", field: "repoShape" },
        },
      },
    },
  ];
  if (defaultOptions.showDocOnlyIndicators) {
    marks.push({
      name: "docOnlyIndicators",
      type: "symbol",
      from: { data: "docOnlyCommits" },
      encode: {
        enter: {
          fill: { value: "black" },
          size: { value: 10 },
          shape: { value: "circle" },
          strokeWidth: { value: 0 },
        },
        update: {
          x: xField,
          y: yField,
        },
      },
    });
  }
  if (
    defaultOptions.showSessionLines &&
    data.sessionMarkers &&
    data.sessionMarkers.length > 0
  ) {
    marks.push({
      name: "multiCommitSessionLines",
      type: "rule",
      from: {
        data: "sessionMarkers",
        transform: [
          {
            type: "filter",
            expr: "datum.isMultiCommit",
          },
        ],
      },
      encode: {
        enter: {
          stroke: { value: sessionLineColor },
          strokeWidth: { value: defaultOptions.sessionLineWidth },
          opacity: { value: defaultOptions.sessionLineOpacity },
        },
        update: {
          x: isPortrait
            ? { scale: "xScale", field: "startHour" }
            : { scale: "xScale", field: "dayTimestamp" },
          x2: isPortrait
            ? { scale: "xScale", field: "endHour" }
            : { scale: "xScale", field: "dayTimestamp" },
          y: isPortrait
            ? { scale: "yScale", field: "dayTimestamp" }
            : { scale: "yScale", field: "startHour" },
          y2: isPortrait
            ? { scale: "yScale", field: "dayTimestamp" }
            : { scale: "yScale", field: "endHour" },
        },
      },
    });
  }
  const axes = [
    {
      orient: "bottom",
      scale: "xScale",
      title: xConfig.title,
      titlePadding: 10,
      grid: true,
      gridOpacity: 1,
      ...(xConfig.timeField
        ? {
            labelAngle: -45,
            labelAlign: "right",
            labelBaseline: "middle",
            labelPadding: 5,
            tickCount: 10,
            format: defaultOptions.dateFormat,
          }
        : {
            tickCount: 12,
            values: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
            format: ".0f",
          }),
    },
    {
      orient: "left",
      scale: "yScale",
      title: yConfig.title,
      titlePadding: 10,
      grid: true,
      gridOpacity: 1,
      ...(yConfig.timeField
        ? {
            labelAngle: 0,
            labelAlign: "right",
            labelBaseline: "middle",
            labelPadding: 5,
            tickCount: 10,
            format: defaultOptions.dateFormat,
          }
        : {
            tickCount: 12,
            values: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
            format: ".0f",
          }),
    },
  ];
  return {
    $schema: "https://vega.github.io/schema/vega/v6.json",
    description:
      "Commit activity strip plot with clustering and repository encoding",
    width: defaultOptions.width,
    height: defaultOptions.height,
    background: null,
    data: [
      {
        name: "commits",
        values: data.commits || [],
      },
      {
        name: "sessionMarkers",
        values: data.sessionMarkers || [],
      },
      {
        name: "docOnlyCommits",
        source: "commits",
        transform: [{ type: "filter", expr: "datum.isDocOnly" }],
      },
      {
        name: "repositories",
        values: data.repositories || [],
      },
    ],
    scales,
    marks,
    axes,
    signals: [
      {
        name: "chartWidth",
        update: "width",
      },
    ],
  };
}

/**
 * Get shape definitions for Vega symbols
 * @returns {Object} - Shape name to SVG path mapping
 */
export function getShapeDefinitions() {
  return {
    circle: "M0,-5A5,5,0,1,1,0,5A5,5,0,1,1,0,-5Z",
    square: "M-4,-4L4,-4L4,4L-4,4Z",
    triangle: "M0,-5L4.33,2.5L-4.33,2.5Z",
    diamond: "M0,-6L4.24,-1.85L2.63,4.85L-2.63,4.85L-4.24,-1.85Z",
    cross: "M-1,-5L1,-5L1,-1L5,-1L5,1L1,1L1,5L-1,5L-1,1L-5,1L-5,-1L-1,-1Z",
  };
}

/**
 * Get color scale configuration
 * @param {number} groupCount - Number of color groups
 * @returns {Object} - Color scale configuration
 */
export function getColorScale(groupCount = 4) {
  const colors = generateGroupColors(groupCount);
  return {
    name: "colorScale",
    type: "ordinal",
    domain: colors.map((_, i) => `group${i}`),
    range: colors,
  };
}
