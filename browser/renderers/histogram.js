import { createHistogramSpec } from "../specs/histogram.js";
import {
  prepareNaturalBucketData,
  hasNaturalBuckets,
} from "../../core/data/bucketing.js";
import { applyDaisyUIThemeVegaLite } from "../themes/daisyui.js";

/**
 * Prepare raw periods data for histogram rendering by structuring it correctly
 * @param {Array} periodsRawData - Array of {period, data, color} objects
 * @param {string} metricId - Metric identifier
 * @returns {Array} - Properly structured periods data for prepareHistogramData
 */
export function preparePeriodsForHistogram(periodsRawData, metricId) {
  return periodsRawData.map(({ period, data, color }) => {
    if (metricId === "commits_by_hour_of_day") {
      return { period, hourlyData: data, color };
    } else {
      return { period, metricData: data, color };
    }
  });
}

/**
 * Unified data preparation for all histogram types
 * @param {Array} periodsData - Array of period data objects
 * @param {Object} options - Options for bucketing and display
 * @returns {Array} - Array of prepared chart data
 */
export function prepareHistogramData(periodsData, options = {}) {
  if (!periodsData || periodsData.length === 0) {
    throw new Error("periodsData is required and must not be empty");
  }
  const firstPeriod = periodsData[0];
  if (firstPeriod.hourlyData && Array.isArray(firstPeriod.hourlyData)) {
    return prepareHourOfDayData(periodsData, options);
  }
  if (firstPeriod.metricData && options.metricId) {
    return prepareNaturalBucketsData(periodsData, options.metricId, options);
  }
  if (
    options.metricId === "hour_of_day" ||
    options.metricId === "commits_by_hour_of_day"
  ) {
    const hourOfDayPeriodsData = periodsData.map((p) => ({
      period: p.period,
      hourlyData: p.metricData || p.hourlyData,
      color: p.color,
    }));
    return prepareHourOfDayData(hourOfDayPeriodsData, options);
  }
  throw new Error(
    "Unable to determine data type. Provide either hourlyData or metricData with metricId"
  );
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
 * Prepare natural buckets data for histogram visualization
 * @param {Array} periodsData - Array of {period, metricData, color} objects
 * @param {string} metricId - Metric identifier
 * @param {Object} options - Options for bucketing and display
 * @returns {Array} - Array of prepared chart data with natural buckets
 */
function prepareNaturalBucketsData(periodsData, metricId, options = {}) {
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
 * Unified histogram renderer - handles both natural buckets and hour-of-day data
 * @param {HTMLElement} container - Container element
 * @param {Array} periodsData - Array of period data objects
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderHistogram(container, periodsRawData, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const periodsData = preparePeriodsForHistogram(
    periodsRawData,
    options.metricId
  );
  const chartData = prepareHistogramData(periodsData, options);
  let yDomain = undefined;
  if (
    options.viewMode === "percentage" &&
    chartData.length > 0 &&
    chartData[0].metricId === "hour_of_day"
  ) {
    const allPercentages = chartData.flatMap((chart) =>
      chart.bucketData.bins.map((bin) => bin.percentageCount)
    );
    const maxPercentage = Math.max(...allPercentages);
    const range = maxPercentage - 0;
    const padding = Math.max(range * 0.1, 1);
    yDomain = [0, maxPercentage + padding];
    console.log(
      `Percentage range: 0% to ${maxPercentage.toFixed(
        1
      )}%, setting domain to [0, ${(maxPercentage + padding).toFixed(1)}]`
    );
  }
  const isHourOfDay =
    chartData.length > 0 && chartData[0].metricId === "hour_of_day";
  const finalOptions = {
    xLabel: isHourOfDay ? "Hour of Day" : options.xLabel,
    yLabel: isHourOfDay
      ? options.viewMode === "percentage"
        ? "Percentage of Commits"
        : "Total Commits"
      : options.yLabel,
    yDomain: yDomain,
    ...options,
  };
  const spec = createHistogramSpec(chartData, finalOptions);
  const themedSpec = applyDaisyUIThemeVegaLite(spec, finalOptions);
  try {
    const view = new vega.View(vega.parse(vegaLite.compile(themedSpec).spec))
      .renderer("canvas")
      .initialize(container);
    await view.runAsync();
    container._vegaView = view;
    return view;
  } catch (error) {
    console.error("Error rendering histogram:", error);
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
    throw error;
  }
}

/**
 * Cleanup histogram resources
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
