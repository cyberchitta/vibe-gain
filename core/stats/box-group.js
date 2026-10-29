import { boxFigures } from "./box-figures.js";
import { binValues } from "./bins.js";

/** @typedef {import("../../browser/specs/chart-data.js").Highlight} Highlight */
/** @typedef {import("../../browser/specs/chart-data.js").BoxGroup} BoxGroup */

/**
 * Build a group from its raw values.
 * @param {object} spec
 * @param {string} spec.label
 * @param {string} spec.color
 * @param {readonly number[]} spec.values - non-empty
 * @param {import("./quantile.js").QuantileMethod} [spec.method] - default "lower"
 * @param {readonly import("./bins.js").Bucket[]} [spec.buckets] - bins the values when given
 * @param {readonly Highlight[]} [spec.highlights] - each must be one of the values
 * @returns {BoxGroup}
 */
export function boxGroup({ label, color, values, method = "lower", buckets, highlights = [] }) {
  const missing = highlights.find((h) => !values.includes(h.value));
  if (missing) {
    throw new Error(`boxGroup: highlight ${missing.value} (${missing.note}) is not among the values of "${label}"`);
  }
  return {
    label,
    color,
    values,
    figures: boxFigures(values, method),
    ...(buckets && { bins: binValues(values, buckets) }),
    highlights,
  };
}
