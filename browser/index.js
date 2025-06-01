export { createBaseVegaSpec } from "./visualization/specs/vega-base.js";
export { applyDaisyUITheme } from "./visualization/themes/daisyui.js";

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

export {
  prepareNaturalBucketData,
  createNaturalBins,
  hasNaturalBuckets,
  getNaturalBuckets,
} from "./visualization/data/bucketing.js";

export {
  identifyCommitClusters,
  assignRepositoryGroups,
  prepareStripPlotData,
  calculateClusterStats,
} from "./visualization/data/clustering.js";
