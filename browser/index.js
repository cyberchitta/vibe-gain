export {
  computeVizData,
  computeVizDataForType,
  computeAggregateVizData,
  formatVizDataForExport,
} from "../core/data/viz-data.js";

export {
  identifyCommitClusters,
  assignRepositoryGroups,
  prepareStripPlotData,
  calculateClusterStats,
  calculateTimeBetweenCommits,
  calculateGapsBetweenClusters,
} from "../core/data/clustering.js";

export {
  prepareNaturalBucketData,
  createNaturalBins,
  hasNaturalBuckets,
  getNaturalBuckets,
  extractValues,
} from "../core/data/bucketing.js";

export {
  commitArrayFormat,
  arrayFormatToCommits,
} from "../core/data/formats.js";

export { createDateRange } from "../core/utils/date.js";

export {
  calculateRepositoryStats,
  normalizeCommitData,
  createTimeRange,
  generateGroupColors,
  generateShapeDefinitions,
  prepareLegendData,
} from "./charts/commit-strip-plot.js";

export {
  createStripPlotSpec,
  getShapeDefinitions,
  getColorScale,
} from "./specs/commit-strip-plot.js";

export {
  renderStripPlot,
  handleResize,
  addInteractivity,
  cleanup,
  refreshVisualization,
} from "./renderers/commit-strip-plot.js";

export { createBaseVegaSpec } from "./specs/vega-base.js";
export { createBoxPlotSpec } from "./specs/box-plot.js";
export { createHistogramSpec } from "./specs/histogram.js";

export {
  prepareHistogramData,
  renderHistogram,
  cleanupHistogram,
} from "./renderers/histogram.js";

export {
  detectDarkMode,
  getThemeColors,
  applyDaisyUITheme,
} from "./themes/daisyui.js";
