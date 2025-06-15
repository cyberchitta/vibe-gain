export {
  computeVizData,
  computeVizDataForType,
  computeAggregateVizData,
  formatVizDataForExport,
} from "../core/data/viz-data.js";

export {
  assignRepositoryGroups,
  prepareStripPlotData,
} from "../core/data/strip-plot.js";

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
  preparePeriodsForHistogram,
  prepareHistogramData,
  renderHistogram,
  cleanupHistogram,
} from "./renderers/histogram.js";

export {
  preparePeriodsForBoxPlot,
  renderBoxPlot,
  cleanupBoxPlot,
} from "./renderers/box-plot.js";

export {
  detectDarkMode,
  getThemeColors,
  applyDaisyUITheme,
} from "./themes/daisyui.js";
