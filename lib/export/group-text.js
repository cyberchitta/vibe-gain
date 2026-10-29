import { formatNumber } from "../../core/utils/format.js";

/** @typedef {import("../../browser/specs/chart-data.js").BoxGroup} BoxGroup */

const ROWS = /** @type {const} */ ([
  ["N", "n"],
  ["Median", "median"],
  ["Min", "min"],
  ["Max", "max"],
  ["Q1", "q1"],
  ["Q3", "q3"],
  ["P5", "p5"],
  ["P95", "p95"],
]);

/**
 * The text form of a group box plot: one column per group, named from its
 * label, one row per figure.
 * @param {readonly BoxGroup[]} groups
 * @param {(v: number) => string} [format]
 * @returns {string}
 */
export function formatGroupFigureTable(groups, format = formatNumber) {
  const header = `| Figure | ${groups.map((g) => g.label).join(" | ")} |`;
  const rule = `|--------|${groups.map((g) => "-".repeat(g.label.length + 2)).join("|")}|`;
  const rows = ROWS.map(
    ([name, key]) => `| ${name} | ${groups.map((g) => format(g.figures[key])).join(" | ")} |`,
  );
  return [header, rule, ...rows].join("\n") + "\n";
}

/**
 * Every value, one line per group, smallest first, highlights noted, then
 * the median: for small groups, where the list says more than a table.
 * @param {readonly BoxGroup[]} groups - each with values
 * @param {(v: number) => string} [format]
 * @returns {string}
 */
export function formatGroupValueLines(groups, format = formatNumber) {
  return groups.map((g) => valueLine(g, format)).join("\n") + "\n";
}

/**
 * @param {BoxGroup} g
 * @param {(v: number) => string} format
 */
function valueLine(g, format) {
  if (!g.values) throw new Error(`formatGroupValueLines: "${g.label}" has no values`);
  const notes = new Map((g.highlights ?? []).map((h) => [h.value, h.note]));
  const sorted = [...g.values].sort((a, b) => a - b);
  const items = sorted.map((v, i) => {
    const note = sorted.indexOf(v) === i ? notes.get(v) : undefined;
    return note ? `${format(v)} (${note})` : format(v);
  });
  return `- ${g.label} (${g.values.length}): ${items.join(", ")}; median ${format(g.figures.median)}`;
}
