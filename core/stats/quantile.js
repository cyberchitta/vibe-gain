/**
 * How a quantile is read off sorted values.
 * - "lower": `sorted[floor(q·(n−1))]`, the nearest rank at or below. Every
 *   figure vibe-gain has published uses it.
 * - "linear": interpolates between the two ranks around `q·(n−1)`, so the
 *   median of an even count is the mean of the middle two.
 * @typedef {"lower" | "linear"} QuantileMethod
 */

/**
 * The q-quantile of values already sorted ascending.
 * @param {readonly number[]} sorted - non-empty, ascending
 * @param {number} q - in [0, 1]
 * @param {QuantileMethod} method
 * @returns {number}
 */
export function quantile(sorted, q, method) {
  const pos = q * (sorted.length - 1);
  const below = Math.floor(pos);
  if (method === "lower" || below === pos) return sorted[below];
  return sorted[below] + (pos - below) * (sorted[below + 1] - sorted[below]);
}
