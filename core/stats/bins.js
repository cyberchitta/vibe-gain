/**
 * A histogram bucket: values in [lo, hi). `hi` may be Infinity.
 * @typedef {object} Bucket
 * @property {number} lo
 * @property {number} hi
 * @property {string} label
 */

/** @typedef {import("../../browser/specs/chart-data.js").Bin} Bin */

/**
 * Count values into buckets. Every value must fall in one: a value outside
 * them all would vanish from the histogram while still counting in the box.
 * @param {readonly number[]} values - non-empty
 * @param {readonly Bucket[]} buckets
 * @returns {Bin[]}
 */
export function binValues(values, buckets) {
  const counts = buckets.map(() => 0);
  values.forEach((v) => {
    const i = buckets.findIndex((b) => v >= b.lo && v < b.hi);
    if (i < 0) {
      const range = `${buckets[0]?.lo} to ${buckets.at(-1)?.hi}`;
      throw new Error(`binValues: ${v} is outside the buckets (${range}); pass buckets that cover every value`);
    }
    counts[i] += 1;
  });
  return buckets.map((b, i) => ({ ...b, count: counts[i], share: counts[i] / values.length }));
}

/**
 * vibe-gain's own buckets (`getNaturalBuckets(metricId)` in
 * `core/data/bucketing.js`), in the form `binValues` takes.
 * @param {readonly { min: number, max: number, label: string }[]} natural
 * @returns {Bucket[]}
 */
export function fromNaturalBuckets(natural) {
  return natural.map((b) => ({ lo: b.min, hi: b.max, label: b.label }));
}
