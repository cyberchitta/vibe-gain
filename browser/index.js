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
} from "./visualization/charts/commit-strip-plot.js";

export {
  createStripPlotSpec,
  getShapeDefinitions,
  getColorScale,
} from "./visualization/specs/commit-strip-plot.js";

export {
  renderStripPlot,
  handleResize,
  addInteractivity,
  cleanup,
  refreshVisualization,
} from "./visualization/renderers/commit-strip-plot.js";

export { createBaseVegaSpec } from "./visualization/specs/vega-base.js";
export { createSideBySideBoxPlotSpec } from "./visualization/specs/box-plot.js";
export { createOverlaySpec } from "./visualization/specs/overlay.js";

export {
  prepareOverlayData,
  renderOverlay,
  cleanupOverlay,
} from "./visualization/renderers/overlay.js";

export {
  detectDarkMode,
  getThemeColors,
  applyDaisyUITheme,
} from "./visualization/themes/daisyui.js";
