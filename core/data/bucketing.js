export const TIME_DURATION_METRICS = ["commit_intervals", "time", "gaps"];

const NATURAL_BUCKETS = {
  commit_intervals: [
    { min: 0.1, max: 0.316, label: "< 20 sec", logCenter: 0.178 },
    { min: 0.316, max: 1, label: "20-60 sec", logCenter: 0.562 },
    { min: 1, max: 2, label: "1-2 min", logCenter: 1.4 },
    { min: 2, max: 5, label: "2-5 min", logCenter: 3.2 },
    { min: 5, max: 10, label: "5-10 min", logCenter: 7.1 },
    { min: 10, max: 15, label: "10-15 min", logCenter: 12.2 },
    { min: 15, max: 20, label: "15-20 min", logCenter: 17.3 },
    { min: 20, max: 30, label: "20-30 min", logCenter: 24.5 },
    { min: 30, max: 45, label: "30-45 min", logCenter: 36.7 },
    { min: 45, max: 60, label: "45-60 min", logCenter: 51.9 },
    { min: 60, max: 90, label: "60-90 min", logCenter: 73.5 },
    { min: 90, max: 120, label: "90-120 min", logCenter: 104 },
    { min: 120, max: 180, label: "2-3 hours", logCenter: 147 },
    { min: 180, max: 240, label: "3-4 hours", logCenter: 208 },
    { min: 240, max: 360, label: "4-6 hours", logCenter: 294 },
    { min: 360, max: 480, label: "6-8 hours", logCenter: 416 },
    { min: 480, max: 720, label: "8-12 hours", logCenter: 589 },
    { min: 720, max: 1440, label: "12-24 hours", logCenter: 1014 },
  ],
  commits: [
    { min: 1, max: 2, label: "1", logCenter: 1 },
    { min: 2, max: 3, label: "2", logCenter: 2 },
    { min: 3, max: 5, label: "3-4", logCenter: 3.5 },
    { min: 5, max: 10, label: "5-9", logCenter: 7 },
    { min: 10, max: 20, label: "10-19", logCenter: 14 },
    { min: 20, max: 50, label: "20-49", logCenter: 32 },
    { min: 50, max: Infinity, label: "50+", logCenter: 75 },
  ],
  coding_time: [
    { min: 0.1, max: 1, label: "< 1 min", logCenter: 0.5 },
    { min: 1, max: 2, label: "1-2 min", logCenter: 1.4 },
    { min: 2, max: 5, label: "2-5 min", logCenter: 3.2 },
    { min: 5, max: 10, label: "5-10 min", logCenter: 7.1 },
    { min: 10, max: 15, label: "10-15 min", logCenter: 12.2 },
    { min: 15, max: 20, label: "15-20 min", logCenter: 17.3 },
    { min: 20, max: 30, label: "20-30 min", logCenter: 24.5 },
    { min: 30, max: 45, label: "30-45 min", logCenter: 36.7 },
    { min: 45, max: 60, label: "45-60 min", logCenter: 51.9 },
    { min: 60, max: 90, label: "60-90 min", logCenter: 73.5 },
    { min: 90, max: 120, label: "90-120 min", logCenter: 104 },
    { min: 120, max: 180, label: "2-3 hours", logCenter: 147 },
    { min: 180, max: 240, label: "3-4 hours", logCenter: 208 },
    { min: 240, max: 360, label: "4-6 hours", logCenter: 294 },
    { min: 360, max: 480, label: "6-8 hours", logCenter: 416 },
    { min: 480, max: 720, label: "8-12 hours", logCenter: 589 },
    { min: 720, max: 1440, label: "12-24 hours", logCenter: 1014 },
  ],
  loc: [
    { min: 1, max: 2, label: "1", logCenter: 1.4 },
    { min: 2, max: 5, label: "2-4", logCenter: 2.8 },
    { min: 5, max: 10, label: "5-9", logCenter: 7.1 },
    { min: 10, max: 25, label: "10-24", logCenter: 16 },
    { min: 25, max: 50, label: "25-49", logCenter: 35 },
    { min: 50, max: 100, label: "50-99", logCenter: 71 },
    { min: 100, max: 200, label: "100-199", logCenter: 141 },
    { min: 200, max: 500, label: "200-499", logCenter: 316 },
    { min: 500, max: 1000, label: "500-999", logCenter: 707 },
    { min: 1000, max: 2000, label: "1000-1999", logCenter: 1414 },
    { min: 2000, max: 5000, label: "2000-4999", logCenter: 3162 },
    { min: 5000, max: 10000, label: "5000-9999", logCenter: 7071 },
    { min: 10000, max: Infinity, label: "10000+", logCenter: 14142 },
  ],
  repos: [
    { min: 1, max: 1, label: "1", logCenter: 1 },
    { min: 2, max: 2, label: "2", logCenter: 2 },
    { min: 3, max: 3, label: "3", logCenter: 3 },
    { min: 4, max: 5, label: "4-5", logCenter: 4.5 },
    { min: 6, max: Infinity, label: "6+", logCenter: 8 },
  ],
  hourly_commit_distribution: [
    { min: 1, max: 2, label: "1", logCenter: 1 },
    { min: 2, max: 3, label: "2", logCenter: 2 },
    { min: 3, max: 5, label: "3-4", logCenter: 3.5 },
    { min: 5, max: 10, label: "5-9", logCenter: 7 },
    { min: 10, max: 20, label: "10-19", logCenter: 14 },
    { min: 20, max: Infinity, label: "20+", logCenter: 28 },
  ],
  session_durations: [
    { min: 1, max: 5, label: "1-5 min", logCenter: 2.8 },
    { min: 5, max: 15, label: "5-15 min", logCenter: 8.7 },
    { min: 15, max: 30, label: "15-30 min", logCenter: 21.2 },
    { min: 30, max: 60, label: "30-60 min", logCenter: 42.4 },
    { min: 60, max: 120, label: "1-2 hours", logCenter: 84.9 },
    { min: 120, max: 240, label: "2-4 hours", logCenter: 169.7 },
    { min: 240, max: 480, label: "4-8 hours", logCenter: 339.4 },
    { min: 480, max: Infinity, label: "8+ hours", logCenter: 678.8 },
  ],
  sessions_per_day: [
    { min: 1, max: 1, label: "1", logCenter: 1 },
    { min: 2, max: 2, label: "2", logCenter: 2 },
    { min: 3, max: 3, label: "3", logCenter: 3 },
    { min: 4, max: 5, label: "4-5", logCenter: 4.5 },
    { min: 6, max: Infinity, label: "6+", logCenter: 8 },
  ],
  session_time: [
    { min: 1, max: 30, label: "< 30 min", logCenter: 15.5 },
    { min: 30, max: 60, label: "30-60 min", logCenter: 42.4 },
    { min: 60, max: 120, label: "1-2 hours", logCenter: 84.9 },
    { min: 120, max: 240, label: "2-4 hours", logCenter: 169.7 },
    { min: 240, max: 480, label: "4-8 hours", logCenter: 339.4 },
    { min: 480, max: 720, label: "8-12 hours", logCenter: 589.0 },
    { min: 720, max: Infinity, label: "12+ hours", logCenter: 1018.0 },
  ],
  session_commit_intensity: [
    { min: 0.1, max: 0.5, label: "< 0.5/hr", logCenter: 0.28 },
    { min: 0.5, max: 1, label: "0.5-1/hr", logCenter: 0.71 },
    { min: 1, max: 2, label: "1-2/hr", logCenter: 1.41 },
    { min: 2, max: 4, label: "2-4/hr", logCenter: 2.83 },
    { min: 4, max: 8, label: "4-8/hr", logCenter: 5.66 },
    { min: 8, max: 16, label: "8-16/hr", logCenter: 11.31 },
    { min: 16, max: Infinity, label: "16+/hr", logCenter: 22.63 },
  ],
  session_intervals: [
    { min: 5, max: 15, label: "5-15 min", logCenter: 9.49 },
    { min: 15, max: 30, label: "15-30 min", logCenter: 21.2 },
    { min: 30, max: 60, label: "30-60 min", logCenter: 42.4 },
    { min: 60, max: 120, label: "1-2 hours", logCenter: 84.9 },
    { min: 120, max: 240, label: "2-4 hours", logCenter: 169.7 },
    { min: 240, max: 480, label: "4-8 hours", logCenter: 339.4 },
    { min: 480, max: Infinity, label: "8+ hours", logCenter: 678.8 },
  ],
  intra_session_intervals: [
    { min: 0.1, max: 0.5, label: "< 30 sec", logCenter: 0.28 },
    { min: 0.5, max: 1, label: "30-60 sec", logCenter: 0.71 },
    { min: 1, max: 2, label: "1-2 min", logCenter: 1.41 },
    { min: 2, max: 5, label: "2-5 min", logCenter: 3.16 },
    { min: 5, max: 10, label: "5-10 min", logCenter: 7.07 },
    { min: 10, max: 20, label: "10-20 min", logCenter: 14.14 },
    { min: 20, max: 45, label: "20-45 min", logCenter: 30.0 },
    { min: 45, max: Infinity, label: "45+ min", logCenter: 63.64 },
  ],
};

/**
 * Extract relevant values from metric data
 * @param {Array} metricData - Array of metric data objects
 * @param {string} metricId - Metric identifier
 * @returns {Array} - Array of numeric values
 */
export function extractValues(metricData, metricId) {
  const values = [];
  if (!Array.isArray(metricData)) return values;
  metricData.forEach((item) => {
    let value = null;
    if (
      metricId === "commit_intervals" &&
      item["interval_minutes"] !== undefined
    ) {
      value = item["interval_minutes"];
    } else if (
      metricId === "commits_per_hour" &&
      item["commits_per_hour"] !== undefined
    ) {
      value = item["commits_per_hour"];
    } else if (metricId === "gaps" && item["avg_gap_minutes"] !== undefined) {
      value = item["avg_gap_minutes"];
    } else if (item[metricId] !== undefined) {
      value = item[metricId];
    }
    if (value !== null && !isNaN(value)) {
      values.push(value);
    }
  });
  return values;
}

/**
 * Create bins using natural/semantic ranges
 * @param {Array} values - Array of numeric values
 * @param {string} metricId - Metric identifier for bucket lookup
 * @returns {Array} - Array of bin objects with natural ranges
 */
export function createNaturalBins(values, metricId) {
  const bucketDef = NATURAL_BUCKETS[metricId];
  if (!bucketDef) {
    throw new Error(`No natural buckets defined for metric: ${metricId}`);
  }
  const bins = bucketDef.map((bucket) => ({
    binStart: bucket.min,
    binEnd: bucket.max === Infinity ? bucket.min * 2 : bucket.max,
    binCenter: bucket.logCenter,
    binLabel: bucket.label,
    count: 0,
    naturalBucket: true,
    bucketDef: bucket,
  }));
  values.forEach((val) => {
    const bucketIndex = bucketDef.findIndex(
      (bucket) =>
        val >= bucket.min && (bucket.max === Infinity ? true : val < bucket.max)
    );
    if (bucketIndex >= 0) {
      bins[bucketIndex].count++;
    }
  });
  if (values.length > 0) {
    bins.forEach((bin) => {
      bin.percentageCount = (bin.count / values.length) * 100;
    });
  }
  return bins;
}

/**
 * Prepare data for visualization using natural buckets
 * @param {Array} metricData - Array of data objects containing the metric
 * @param {string} metricId - Metric identifier
 * @param {Object} options - Additional options
 * @returns {Object} - Bucketed data object
 */
export function prepareNaturalBucketData(metricData, metricId, options = {}) {
  const values = extractValues(metricData, metricId);
  if (values.length === 0) {
    return {
      bins: [],
      metricId,
      metadata: { count: 0 },
    };
  }
  const bins = createNaturalBins(values, metricId);
  return {
    bins,
    metricId,
    metadata: {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((sum, val) => sum + val, 0) / values.length,
      usingNaturalBuckets: true,
    },
  };
}

/**
 * Check if natural buckets are available for a metric
 * @param {string} metricId - Metric identifier
 * @returns {boolean} - Whether natural buckets are defined
 */
export function hasNaturalBuckets(metricId) {
  return NATURAL_BUCKETS[metricId] !== undefined;
}

/**
 * Get the natural bucket definition for a metric
 * @param {string} metricId - Metric identifier
 * @returns {Array|null} - Bucket definition array or null
 */
export function getNaturalBuckets(metricId) {
  return NATURAL_BUCKETS[metricId] || null;
}
