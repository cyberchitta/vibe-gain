import { createHistogramSpec } from "../specs/histogram.js";
import {
  prepareNaturalBucketData,
  hasNaturalBuckets,
} from "../../core/data/bucketing.js";
import { applyDaisyUITheme } from "../themes/daisyui.js";

/**
 * Prepare overlay data using natural buckets when available
 * @param {Array} periodsData - Array of {period, metricData, color} objects
 * @param {string} metricId - Metric identifier
 * @param {Object} options - Options for bucketing and display
 * @returns {Array} - Array of prepared chart data with natural buckets
 */
export function prepareHistogramData(periodsData, metricId, options = {}) {
  const useNaturalBuckets =
    options.useNaturalBuckets !== false && hasNaturalBuckets(metricId);
  if (!useNaturalBuckets) {
    throw new Error(
      `Natural buckets not available for metric: ${metricId}. Please define natural buckets first.`
    );
  }
  return periodsData.map((periodData) => {
    const bucketData = prepareNaturalBucketData(
      periodData.metricData,
      metricId,
      options
    );
    return {
      period: periodData.period,
      bucketData: bucketData,
      color: periodData.color,
      metricId: metricId,
    };
  });
}

/**
 * Prepare hour-of-day data for histogram visualization
 * @param {Array} periodsData - Array of {period, hourlyData, color} objects where hourlyData is 24-element array
 * @param {Object} options - Options for display
 * @returns {Array} - Array of prepared chart data for hour-of-day histograms
 */
export function prepareHourOfDayData(periodsData, options = {}) {
  return periodsData.map((periodData) => {
    const bins = periodData.hourlyData.map((count, hour) => ({
      binStart: hour,
      binEnd: hour + 1,
      binLabel: `${hour}:00`,
      xStart: hour,
      xEnd: hour + 1,
      count: count,
      percentageCount: 0,
      period: periodData.period,
      metricId: "hour_of_day",
    }));
    const total = periodData.hourlyData.reduce((sum, count) => sum + count, 0);
    bins.forEach((bin) => {
      bin.percentageCount = total > 0 ? (bin.count / total) * 100 : 0;
    });
    return {
      period: periodData.period,
      bucketData: {
        bins: bins,
        metricId: "hour_of_day",
      },
      color: periodData.color,
      metricId: "hour_of_day",
    };
  });
}

/**
 * Render overlay plot
 * @param {HTMLElement} container - Container element
 * @param {Array} chartData - Prepared chart data
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderHistogram(container, chartData, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const spec = createHistogramSpec(chartData, options);
  const themedSpec = applyDaisyUITheme(spec, options);
  try {
    const view = new vega.View(vega.parse(themedSpec))
      .renderer("canvas")
      .initialize(container);
    await view.runAsync();
    container._vegaView = view;
    return view;
  } catch (error) {
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
    throw error;
  }
}

/**
 * Render hour-of-day histogram
 * @param {HTMLElement} container - Container element
 * @param {Array} periodsData - Array of {period, hourlyData, color} objects
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderHourOfDayHistogram(container, periodsData, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const chartData = prepareHourOfDayData(periodsData, options);
  let yDomain = undefined;
  if (options.viewMode === 'percentage') {
    const allPercentages = chartData.flatMap(chart => 
      chart.bucketData.bins.map(bin => bin.percentageCount)
    );
    const maxPercentage = Math.max(...allPercentages);
    const minPercentage = Math.min(...allPercentages.filter(p => p > 0)); // Exclude zeros
    const range = maxPercentage - 0;
    const padding = Math.max(range * 0.1, 1);
    yDomain = [0, maxPercentage + padding];
    console.log(`Percentage range: 0% to ${maxPercentage.toFixed(1)}%, setting domain to [0, ${(maxPercentage + padding).toFixed(1)}]`);
  }
  const spec = createHistogramSpec(chartData, {
    ...options,
    xLabel: options.xLabel || 'Hour of Day',
    yLabel: options.yLabel || 'Total Commits',
    yDomain: yDomain
  });
  const themedSpec = applyDaisyUITheme(spec, options);
  try {
    const view = new vega.View(vega.parse(vegaLite.compile(themedSpec).spec))
      .renderer("canvas")
      .initialize(container);
    await view.runAsync();
    container._vegaView = view;
    return view;
  } catch (error) {
    console.error("Error rendering hour-of-day histogram:", error);
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
    throw error;
  }
}

/**
 * Cleanup overlay resources
 * @param {HTMLElement} container - Container element
 */
export function cleanupHistogram(container) {
  if (!container) return;
  if (container._vegaView) {
    container._vegaView.finalize();
    container._vegaView = null;
  }
  container.innerHTML = "";
}
