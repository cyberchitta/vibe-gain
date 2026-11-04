import { quantile } from "./quantile.js";

/**
 * The 0.68 quantile ("phi"), read "lower" as every published figure was.
 * Session minutes add it once per session for the gaps a session hides.
 * @param {readonly number[]} values
 * @returns {number | null} null for no values
 */
export function phiQuantile(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.68, "lower");
}
