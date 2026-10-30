import { extractValues } from "./transforms.js";
import { createNaturalBins, hasNaturalBuckets } from "./bucketing.js";

/** @typedef {import("../../browser/specs/chart-data.js").Bin} Bin */

/**
 * One period's histogram bins, as the old llms.txt histogram table has
 * always counted them, because published tables print them: for
 * `commits_by_hour_of_day` (24 counts) one bin per hour; for a metric with
 * natural buckets every bucket, empty ones included; else none.
 * @param {unknown} metricData - the period's `metrics[metricId]`
 * @param {string} metricId
 * @returns {Bin[]}
 */
export function periodHistogramBins(metricData, metricId) {
  if (metricId === "commits_by_hour_of_day") {
    return hourBins(/** @type {number[]} */ (metricData));
  }
  if (!hasNaturalBuckets(metricId)) return [];
  return naturalBins(extractValues(/** @type {any[]} */ (metricData), metricId), metricId);
}

/**
 * Natural buckets keep their quirks: the top bucket ends at twice its
 * start, and values below the first bucket are dropped. No values, no bins:
 * an empty period prints "-", not a row of zeros.
 * @param {readonly number[]} values
 * @param {string} metricId - must have natural buckets
 * @returns {Bin[]}
 */
export function naturalBins(values, metricId) {
  if (values.length === 0) return [];
  return createNaturalBins(values, metricId).map((b) => ({
    lo: b.binStart,
    hi: b.binEnd,
    label: b.binLabel,
    count: b.count,
    share: b.count / values.length,
  }));
}

/**
 * @param {readonly number[]} counts - one per hour, 0 to 23
 * @returns {Bin[]}
 */
function hourBins(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((count, hour) => ({
    lo: hour,
    hi: hour + 1,
    label: `${hour}:00-${hour + 1}:00`,
    count,
    share: total > 0 ? count / total : 0,
  }));
}
