/** @typedef {import("../../browser/specs/chart-data.js").SharePoint} SharePoint */

/**
 * Cumulative shares of a list of values, one point per distinct value.
 * @param {readonly number[]} values - non-empty
 * @returns {SharePoint[]}
 */
export function cumulativeShares(values) {
  if (values.length === 0) {
    throw new Error("cumulativeShares: no values");
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted
    .map((value, i) => ({ value, share: (i + 1) / sorted.length }))
    .filter((p, i) => sorted[i + 1] !== p.value);
}
