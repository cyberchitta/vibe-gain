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
  return countInto(values, buckets, values.length);
}

/**
 * Bin only the values from `floor` up, over the buckets from `floor` up,
 * where small values would dwarf every other bar. Shares stay shares of all
 * the values, so the bars sum to `1 - below`.
 * @param {readonly number[]} values - non-empty
 * @param {readonly Bucket[]} buckets
 * @param {number} floor - the `lo` of one of the buckets
 * @returns {{ bins: Bin[], below: number }} `below`: the fraction of values under `floor`
 */
export function binFrom(values, buckets, floor) {
  if (!buckets.some((b) => b.lo === floor)) {
    const edges = buckets.map((b) => b.lo).join(", ");
    throw new Error(`binFrom: floor ${floor} is not a bucket edge; pass one of ${edges}`);
  }
  const rest = values.filter((v) => v >= floor);
  return {
    bins: countInto(rest, buckets.filter((b) => b.lo >= floor), values.length),
    below: 1 - rest.length / values.length,
  };
}

/**
 * @param {readonly number[]} values
 * @param {readonly Bucket[]} buckets
 * @param {number} total - what each share is a share of
 * @returns {Bin[]}
 */
function countInto(values, buckets, total) {
  const counts = buckets.map(() => 0);
  values.forEach((v) => {
    const i = buckets.findIndex((b) => v >= b.lo && v < b.hi);
    if (i < 0) {
      const range = `${buckets[0]?.lo} to ${buckets.at(-1)?.hi}`;
      throw new Error(`binValues: ${v} is outside the buckets (${range}); pass buckets that cover every value`);
    }
    counts[i] += 1;
  });
  return buckets.map((b, i) => ({ ...b, count: counts[i], share: counts[i] / total }));
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

/**
 * Half-octave buckets for integer values of 1 or more (line counts, say):
 * edges 1, 2, 3, 4, 6, 8, 12 … (powers of two, and 1.5× each from 2 up),
 * each about 1.4× the last, so bars read evenly on a log axis. The last
 * bucket, from `top`, is open. Labels name integers (`4–5`, `2`, `3072+`),
 * so they misread non-integer data; values below 1 fit no bucket.
 * @param {number} top - the last edge; must itself be a half-octave edge
 * @returns {Bucket[]}
 */
export function halfOctaveBuckets(top) {
  if (!Number.isInteger(top) || halfOctaveEdges(top).at(-1) !== top) {
    throw new Error(`halfOctaveBuckets: top ${top} is not a half-octave edge; pass one of 1, 2, 3, 4, 6, 8, 12, 16 …`);
  }
  const edges = halfOctaveEdges(top);
  return edges.map((lo, i) => bucketFrom(lo, edges[i + 1] ?? Infinity));
}

/**
 * @param {number} top
 * @returns {number[]} every half-octave edge up to `top`
 */
function halfOctaveEdges(top) {
  const powers = Array.from({ length: Math.max(0, Math.floor(Math.log2(top)) + 1) }, (_, k) => 2 ** k);
  return powers.flatMap((p) => (p === 1 ? [p] : [p, p * 1.5])).filter((e) => e <= top);
}

/**
 * @param {number} lo
 * @param {number} hi
 * @returns {Bucket}
 */
function bucketFrom(lo, hi) {
  const label = hi === lo + 1 ? `${lo}` : hi === Infinity ? `${lo}+` : `${lo}–${hi - 1}`;
  return { lo, hi, label };
}
