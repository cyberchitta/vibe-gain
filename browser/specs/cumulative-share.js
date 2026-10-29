import { DEFAULT_COLORS, axisConfig } from "./chart-colors.js";
import { getBaseVegaLiteSpec } from "./vega-base.js";

/** @typedef {import("./chart-data.js").ShareGroup} ShareGroup */

/**
 * @typedef {object} CumulativeShareOptions
 * @property {number | "container"} [width]
 * @property {number | "container"} [height]
 * @property {string} [xLabel]
 * @property {boolean} [log] - log x axis
 * @property {number} [floor] - values below it are drawn at it; needed on a
 *   log axis when any value is 0 or less
 * @property {[number, number]} [xDomain] - default: the smallest to the largest value
 * @property {object} [xAxis] - Vega-Lite axis properties merged over ours
 * @property {Partial<import("./chart-colors.js").ChartColors>} [colors]
 */

/**
 * Cumulative shares, one stepped line per group, all on one chart: the
 * share of each group's values at or below each value. Compares groups
 * where side-by-side boxes do not.
 * @param {readonly ShareGroup[]} groups
 * @param {CumulativeShareOptions} [options]
 */
export function createCumulativeShareSpec(groups, options = {}) {
  const colors = { ...DEFAULT_COLORS, ...options.colors };
  const log = options.log ?? false;
  const at = (/** @type {number} */ v) => (options.floor === undefined ? v : Math.max(v, options.floor));
  const rows = groups.flatMap((g) => curveRows(g, at));
  const xs = rows.map((r) => r.x);
  const lowest = Math.min(...xs);
  if (log && lowest <= 0) {
    throw new Error(`createCumulativeShareSpec: a log axis cannot show ${lowest}; pass a floor above 0`);
  }
  const domain = options.xDomain ?? [lowest, Math.max(...xs)];
  return {
    ...getBaseVegaLiteSpec(),
    width: options.width ?? "container",
    height: options.height ?? "container",
    config: axisConfig(colors),
    data: { values: rows },
    mark: { type: "line", interpolate: "step-after", strokeWidth: 1.5 },
    encoding: {
      x: {
        field: "x", type: "quantitative", title: options.xLabel ?? null,
        scale: { type: log ? "log" : "linear", domain, nice: false, ...(!log && { zero: false }) },
        axis: { ...(log && { format: "~s" }), ...options.xAxis },
      },
      y: {
        field: "share", type: "quantitative", title: "share at or below",
        scale: { domain: [0, 1] }, axis: { format: "%" },
      },
      color: {
        field: "group", type: "nominal", title: null,
        scale: { domain: groups.map((g) => g.label), range: groups.map((g) => g.color) },
        legend: { orient: "bottom" },
      },
      order: { field: "x", type: "quantitative" },
      tooltip: [{ field: "group" }, { field: "value" }, { field: "share", format: ".1%" }],
    },
  };
}

/**
 * A curve's rows, starting from share 0 at its lowest value.
 * @param {ShareGroup} g
 * @param {(v: number) => number} at
 */
function curveRows(g, at) {
  if (g.shares.length === 0) throw new Error(`createCumulativeShareSpec: "${g.label}" has no points`);
  const start = { group: g.label, value: g.shares[0].value, x: at(g.shares[0].value), share: 0 };
  return [start, ...g.shares.map((p) => ({ group: g.label, value: p.value, x: at(p.value), share: p.share }))];
}
