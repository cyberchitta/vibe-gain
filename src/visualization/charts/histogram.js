const { getDynamicRange, createHistogramBins } = require("./utils");

/**
 * Configure a histogram from metrics data
 * @param {string} id - Unique identifier for the histogram
 * @param {string} title - Display title for the histogram
 * @param {string} key - Data key to extract values from
 * @param {Array} data - Data array from metrics
 * @param {string} xLabel - Label for x-axis
 * @param {Array} fallbackRange - Fallback range if data is empty
 * @param {number} defaultBins - Default number of bins
 * @returns {Object} - Histogram configuration object
 */
function configureHistogram(
  id,
  title,
  key,
  data,
  xLabel,
  fallbackRange,
  defaultBins
) {
  const values = data.map((d) => d[key]);
  const range = getDynamicRange(data, key, fallbackRange);
  const bins = Math.min(
    defaultBins,
    Math.ceil((range[1] - range[0]) / (key.includes("commits") ? 1 : 10))
  );
  const histogramData = createHistogramBins(values, range, bins);
  return {
    id,
    title,
    key,
    xLabel,
    range,
    bins,
    data: histogramData,
    rawData: values,
    metadata: {
      count: values.length,
      mean:
        values.length > 0
          ? values.reduce((sum, val) => sum + val, 0) / values.length
          : 0,
      median:
        values.length > 0
          ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
          : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
      min: values.length > 0 ? Math.min(...values) : 0,
    },
  };
}

/**
 * Create configuration objects for all histograms from metrics
 * @param {Object} metrics - Metrics object from computeMetrics
 * @param {number} defaultBins - Default number of bins for histograms
 * @returns {Array} - Array of histogram configuration objects
 */
function createHistogramConfigurations(metrics, defaultBins) {
  const histogramDefinitions = [
    {
      id: "commits",
      title: "Commits per Active Day",
      key: "commits",
      data: metrics.commits,
      xLabel: "Commits",
      fallbackRange: [0, 20],
    },
    {
      id: "loc",
      title: "LOC per Active Day",
      key: "loc",
      data: metrics.loc,
      xLabel: "LOC (Additions + Deletions)",
      fallbackRange: [0, 1000],
    },
    {
      id: "repos",
      title: "Repos per Active Day",
      key: "repos",
      data: metrics.repos,
      xLabel: "Unique Repos",
      fallbackRange: [1, 5],
    },
    {
      id: "hours",
      title: "Estimated Hours per Active Day",
      key: "hours",
      data: metrics.hours,
      xLabel: "Hours",
      fallbackRange: [0, 8],
    },
    {
      id: "gaps",
      title: "Avg Time Between Commit Groups",
      key: "avg_gap_minutes",
      data: metrics.gaps,
      xLabel: "Minutes",
      fallbackRange: [0, 120],
    },
    {
      id: "commits_per_hour",
      title: "Commits per Hour",
      key: "commits_per_hour",
      data: metrics.commits_per_hour,
      xLabel: "Commits per Hour",
      fallbackRange: [0, 10],
    },
    {
      id: "time_between_commits",
      title: "Avg Time Between Commits",
      key: "avg_time_between_commits",
      data: metrics.time_between_commits,
      xLabel: "Minutes",
      fallbackRange: [0, 60],
    },
  ];
  return histogramDefinitions.map((hd) =>
    configureHistogram(
      hd.id,
      hd.title,
      hd.key,
      hd.data,
      hd.xLabel,
      hd.fallbackRange,
      defaultBins
    )
  );
}

module.exports = {
  configureHistogram,
  createHistogramConfigurations,
};
