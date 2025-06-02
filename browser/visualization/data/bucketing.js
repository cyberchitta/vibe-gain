const NATURAL_BUCKETS = {
  time_between_commits: [
    { min: 0, max: 5, label: "< 5 min", logCenter: 2.5 },
    { min: 5, max: 15, label: "5-15 min", logCenter: 10 },
    { min: 15, max: 60, label: "15-60 min", logCenter: 37.5 },
    { min: 60, max: 240, label: "1-4 hours", logCenter: 150 },
    { min: 240, max: 1440, label: "4-24 hours", logCenter: 840 },
    { min: 1440, max: 10080, label: "1-7 days", logCenter: 5760 },
    { min: 10080, max: Infinity, label: "> 1 week", logCenter: 20160 },
  ],

  commits_per_hour: [
    { min: 0, max: 0.1, label: "< 0.1", logCenter: 0.05 },
    { min: 0.1, max: 0.5, label: "0.1-0.5", logCenter: 0.3 },
    { min: 0.5, max: 1, label: "0.5-1", logCenter: 0.75 },
    { min: 1, max: 3, label: "1-3", logCenter: 2 },
    { min: 3, max: 10, label: "3-10", logCenter: 6.5 },
    { min: 10, max: Infinity, label: "> 10", logCenter: 15 },
  ],

  commits: [
    { min: 1, max: 2, label: "1", logCenter: 1 },
    { min: 2, max: 6, label: "2-5", logCenter: 3.5 },
    { min: 6, max: 11, label: "6-10", logCenter: 8 },
    { min: 11, max: 21, label: "11-20", logCenter: 15.5 },
    { min: 21, max: Infinity, label: "> 20", logCenter: 30 },
  ],

  hours: [
    { min: 0.1, max: 1, label: "< 1", logCenter: 0.5 },
    { min: 1, max: 2, label: "1-2", logCenter: 1.5 },
    { min: 2, max: 4, label: "2-4", logCenter: 3 },
    { min: 4, max: 8, label: "4-8", logCenter: 6 },
    { min: 8, max: 12, label: "8-12", logCenter: 10 },
    { min: 12, max: 16, label: "12-16", logCenter: 14 },
    { min: 16, max: Infinity, label: "> 16", logCenter: 20 },
  ],

  loc: [
    { min: 1, max: 50, label: "1-50", logCenter: 25 },
    { min: 50, max: 200, label: "50-200", logCenter: 125 },
    { min: 200, max: 500, label: "200-500", logCenter: 350 },
    { min: 500, max: 1000, label: "500-1000", logCenter: 750 },
    { min: 1000, max: 2000, label: "1000-2000", logCenter: 1500 },
    { min: 2000, max: 5000, label: "2000-5000", logCenter: 3500 },
    { min: 5000, max: Infinity, label: "> 5000", logCenter: 7500 },
  ],

  repos: [
    // repos per day
    { min: 1, max: 1, label: "1", logCenter: 1 },
    { min: 2, max: 3, label: "2-3", logCenter: 2.5 },
    { min: 4, max: Infinity, label: "4+", logCenter: 6 },
  ],

  gaps: [
    // average gap minutes per day (same as time_between_commits but different context)
    { min: 0, max: 5, label: "< 5 min", logCenter: 2.5 },
    { min: 5, max: 15, label: "5-15 min", logCenter: 10 },
    { min: 15, max: 60, label: "15-60 min", logCenter: 37.5 },
    { min: 60, max: 240, label: "1-4 hours", logCenter: 150 },
    { min: 240, max: 1440, label: "4-24 hours", logCenter: 840 },
    { min: 1440, max: 10080, label: "1-7 days", logCenter: 5760 },
    { min: 10080, max: Infinity, label: "> 1 week", logCenter: 20160 },
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
      metricId === "time_between_commits" &&
      item["avg_time_between_commits"] !== undefined
    ) {
      value = item["avg_time_between_commits"];
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
    bucketDef: bucket, // Keep reference for violin plots
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
