import { quantile } from "./quantile.js";

/** @typedef {import("../../browser/specs/chart-data.js").BoxFigures} BoxFigures */

/**
 * Box figures of a list of values.
 * @param {readonly number[]} values - non-empty
 * @param {import("./quantile.js").QuantileMethod} [method] - "lower" (the
 *   default) matches every figure vibe-gain has published
 * @returns {BoxFigures}
 */
export function boxFigures(values, method = "lower") {
  if (values.length === 0) {
    throw new Error("boxFigures: no values; a box needs at least one");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const at = (/** @type {number} */ q) => quantile(sorted, q, method);
  return {
    n: sorted.length,
    min: sorted[0],
    p5: at(0.05),
    q1: at(0.25),
    median: at(0.5),
    q3: at(0.75),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
}
