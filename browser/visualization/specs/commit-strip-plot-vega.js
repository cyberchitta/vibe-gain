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
    padding: { left: 60, right: 20, top: 20, bottom: 60 },
    groupCount: 4,
    showDocOnlyIndicators: true,
    ...options,
  };

  const colors = generateGroupColors(defaultOptions.groupCount);
  const shapes = generateShapeDefinitions();

  return {
    $schema: "https://vega.github.io/schema/vega/v6.json",
    description:
      "Commit activity strip plot with clustering and repository encoding",
    width: defaultOptions.width,
    height: defaultOptions.height,
    padding: defaultOptions.padding,
    autosize: "none",

    data: [
      {
        name: "commits",
        values: data.commits || [],
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

    scales: [
      {
        name: "xScale",
        type: "time",
        domain: [
          { signal: "datetime(2022, 5, 1)" }, // June 1, 2022 (month is 0-indexed)
          { signal: "datetime(2022, 10, 30)" }, // November 30, 2022
        ],
        range: [0, defaultOptions.width],
        nice: false,
      },
      {
        name: "yScale",
        type: "linear",
        domain: [0, 24],
        range: [0, defaultOptions.height],
        nice: false,
        zero: false,
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
        type: "log", // Changed from "linear"
        domain: [1, 1000], // Changed from [0, 1000] - log scale needs >0
        range: [0.3, 1.0], // Changed from [0.5, 1.0] for better contrast
        clamp: true,
      },
    ],

    marks: [
      // Main commit markers
      {
        name: "commitMarks",
        type: "symbol",
        from: { data: "commits" },
        encode: {
          enter: {
            x: { scale: "xScale", field: "dayTimestamp" },
            y: {
              scale: "yScale",
              signal: "hours(datum.timeOfDay) + minutes(datum.timeOfDay)/60",
            },
            fill: { scale: "colorScale", field: "repoGroup" },
            stroke: { value: "#333333" },
            strokeWidth: { value: 0.5 },
            size: { value: 4 },
            opacity: { scale: "opacityScale", field: "commitSize" },
          },
          update: {
            shape: { scale: "shapeScale", field: "repoShape" },
          },
          hover: {
            strokeWidth: { value: 2 },
            stroke: { value: "#000000" },
          },
        },
      },

      // Documentation-only commit indicators
      ...(defaultOptions.showDocOnlyIndicators
        ? [
            {
              name: "docOnlyIndicators",
              type: "symbol",
              from: {
                data: "docOnlyCommits",
              },
              encode: {
                enter: {
                  x: { scale: "xScale", field: "dayTimestamp" },
                  y: {
                    scale: "yScale",
                    signal:
                      "hours(datum.timeOfDay) + minutes(datum.timeOfDay)/60",
                  },
                  fill: { value: "black" },
                  size: { value: 10 },
                  shape: { value: "circle" },
                  strokeWidth: { value: 0 },
                },
              },
            },
          ]
        : []),
    ],

    axes: [
      {
        orient: "bottom",
        scale: "xScale",
        title: "Date",
        titlePadding: 10,
        labelAngle: -45,
        labelAlign: "right",
        labelBaseline: "middle",
        labelPadding: 5,
        tickCount: 10,
        format: "%b %d",
        grid: true,
        gridOpacity: 0.2,
      },
      {
        orient: "left",
        scale: "yScale",
        title: "Hour of Day",
        titlePadding: 10,
        tickCount: 12,
        grid: true,
        gridOpacity: 0.2,
        values: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
        format: ".0f",
      },
    ],

    signals: [
      {
        name: "tooltip",
        value: {},
        on: [
          {
            events: "symbol:mouseover",
            update: "datum",
          },
          {
            events: "symbol:mouseout",
            update: "{}",
          },
        ],
      },
    ],
  };
}

/**
 * Create specification for side-by-side comparison
 * @param {Object} preAIData - Pre-AI period data
 * @param {Object} recentAIData - Recent-AI period data
 * @param {Object} options - Visualization options
 * @returns {Object} - Combined Vega specification for comparison
 */
export function createComparisonSpec(preAIData, recentAIData, options = {}) {
  const plotOptions = {
    width: (options.width || 1200) / 2 - 40,
    height: options.height || 400,
    ...options,
  };

  // Create individual specs
  const preAISpec = createStripPlotSpec(preAIData, plotOptions);
  const recentAISpec = createStripPlotSpec(recentAIData, plotOptions);

  // Update the date domains with proper Vega datetime signals
  preAISpec.scales[0].domain = [
    { signal: "datetime(2022, 5, 1)" }, // June 1, 2022
    { signal: "datetime(2022, 10, 30)" }, // November 30, 2022
  ];

  recentAISpec.scales[0].domain = [
    { signal: "datetime(2024, 10, 1)" }, // November 1, 2024
    { signal: "datetime(2025, 3, 30)" }, // April 30, 2025
  ];

  return {
    $schema: "https://vega.github.io/schema/vega/v6.json",
    description: "Side-by-side comparison of commit patterns",
    width: options.width || 1200,
    height: options.height || 400,
    padding: 20,
    autosize: "none",

    layout: {
      padding: 20,
      columns: 2,
      bounds: "full",
    },

    data: [
      // Pre-AI data
      {
        name: "preAICommits",
        values: preAIData.commits || [],
      },
      {
        name: "preAIRepositories",
        values: preAIData.repositories || [],
      },
      // Recent-AI data
      {
        name: "recentAICommits",
        values: recentAIData.commits || [],
      },
      {
        name: "recentAIRepositories",
        values: recentAIData.repositories || [],
      },
    ],

    marks: [
      // Pre-AI period plot
      {
        type: "group",
        title: {
          text: `Pre-AI Period (${
            preAIData.metadata?.totalCommits || 0
          } commits)`,
          fontSize: 14,
          fontWeight: "bold",
          anchor: "start",
        },
        encode: {
          enter: {
            width: { value: plotOptions.width },
            height: { value: plotOptions.height },
          },
        },
        marks: adaptMarksForGroup(preAISpec.marks, "preAI"),
        scales: preAISpec.scales,
        axes: preAISpec.axes,
      },

      // Recent-AI period plot
      {
        type: "group",
        title: {
          text: `Recent-AI Period (${
            recentAIData.metadata?.totalCommits || 0
          } commits)`,
          fontSize: 14,
          fontWeight: "bold",
          anchor: "start",
        },
        encode: {
          enter: {
            width: { value: plotOptions.width },
            height: { value: plotOptions.height },
          },
        },
        marks: adaptMarksForGroup(recentAISpec.marks, "recentAI"),
        scales: recentAISpec.scales,
        axes: recentAISpec.axes,
      },
    ],
  };
}

/**
 * Adapt marks to use group-specific data sources
 * @param {Array} marks - Original marks array
 * @param {string} prefix - Data prefix for this group
 * @returns {Array} - Adapted marks array
 */
function adaptMarksForGroup(marks, prefix) {
  return marks.map((mark) => {
    if (mark.from && mark.from.data) {
      return {
        ...mark,
        from: {
          ...mark.from,
          data: `${prefix}${mark.from.data
            .charAt(0)
            .toUpperCase()}${mark.from.data.slice(1)}`,
        },
      };
    }
    return mark;
  });
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
