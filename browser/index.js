export { prepareHistogramData } from "./visualization/charts/histogram.js";
export { createBaseVegaSpec } from "./visualization/renderers/vega-base.js";
export { createHistogramSpec } from "./visualization/renderers/histogram.js";
export { applyDaisyUITheme } from "./visualization/themes/daisyui.js";

export {
  extractStripPlotValues,
  prepareVisualizationData,
  calculateRepositoryStats,
  normalizeCommitData,
  createTimeRange,
  generateGroupColors,
  generateShapeDefinitions,
} from "./visualization/charts/commit-strip-plot.js";

export {
  createStripPlotSpec,
  createComparisonSpec,
  getShapeDefinitions,
  getColorScale,
} from "./visualization/specs/commit-strip-plot-vega.js";

export {
  renderStripPlot,
  applyTheme,
  handleResize,
  addInteractivity,
  cleanup,
  refreshVisualization,
} from "./visualization/renderers/commit-strip-plot.js";

export {
  identifyCommitClusters,
  assignRepositoryGroups,
  prepareStripPlotData,
  calculateClusterStats,
  prepareLegendData,
} from "./visualization/data/clustering.js";
