import { formatPrecise } from "../../core/utils/format.js";

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
export function formatGroupFigureTable(groups, format = formatPrecise) {
  const rows = ROWS.map(
    ([name, key]) => `| ${name} | ${groups.map((g) => format(g.figures[key])).join(" | ")} |`,
  );
  return [...tableHead("Figure", groups), ...rows].join("\n") + "\n";
}

/**
 * The text form of the groups' histograms: one column per group, named from
 * its label, one row per bin label in the order first seen, each cell that
 * group's count, or "-" where the group has no such bin.
 * @param {readonly Pick<BoxGroup, "label" | "bins">[]} groups - each with bins
 * @param {(v: number) => string} [format]
 * @returns {string}
 */
export function formatGroupBinTable(groups, format = formatPrecise) {
  const binsOf = groups.map((g) => {
    if (!g.bins) throw new Error(`formatGroupBinTable: "${g.label}" has no bins`);
    return new Map(g.bins.map((b) => [b.label, b.count]));
  });
  const labels = [...new Set(binsOf.flatMap((m) => [...m.keys()]))];
  const rows = labels.map((label) => {
    const cells = binsOf.map((m) => {
      const count = m.get(label);
      return count === undefined ? "-" : format(count);
    });
    return `| ${label} | ${cells.join(" | ")} |`;
  });
  return [...tableHead("Bin", groups), ...rows].join("\n") + "\n";
}

/**
 * A markdown table's header and separator: the first column, then one per
 * group, named from its label.
 * @param {string} first
 * @param {readonly { label: string }[]} groups
 * @returns {string[]}
 */
export function tableHead(first, groups) {
  return headLines([first, ...groups.map((g) => g.label)]);
}

/**
 * @param {readonly string[]} names
 * @returns {string[]} a header row and its separator, dashes as wide as each name
 */
function headLines(names) {
  return [`| ${names.join(" | ")} |`, `|${names.map((n) => "-".repeat(n.length + 2)).join("|")}|`];
}

/** @typedef {keyof BoxGroup["figures"]} FigureKey */

/**
 * A column of the row table: one of the group's figures, or a cell the
 * caller computes, from the group and its index in `groups`.
 * @typedef {{ name: string, figure: FigureKey } | { name: string, value: (group: BoxGroup, index: number) => string }} RowColumn
 */

/** @type {readonly RowColumn[]} */
const ROW_COLUMNS = /** @type {const} */ (["n", "median", "p95", "max"]).map((key) => ({
  name: ROWS.find(([, k]) => k === key)?.[0] ?? key,
  figure: key,
}));

/**
 * The text form of a group box plot, one row per group: for many groups,
 * where a column each would run off the page. The first column is the
 * group's label; the rest are `columns`, by default n, median, p95 and max,
 * the figures that say how many, how typical and how far.
 * @param {readonly BoxGroup[]} groups
 * @param {(v: number) => string} [format] - for figure cells; computed cells come formatted
 * @param {{ first?: string, columns?: readonly RowColumn[] }} [options]
 * @returns {string}
 */
export function formatGroupRowTable(groups, format = formatPrecise, { first = "Group", columns = ROW_COLUMNS } = {}) {
  const rows = groups.map((g, i) => {
    const cells = columns.map((c) => ("figure" in c ? format(g.figures[c.figure]) : c.value(g, i)));
    return `| ${[g.label, ...cells].join(" | ")} |`;
  });
  return [...headLines([first, ...columns.map((c) => c.name)]), ...rows].join("\n") + "\n";
}

/**
 * Every value, one line per group, smallest first, highlights noted, then
 * the median: for small groups, where the list says more than a table.
 * @param {readonly BoxGroup[]} groups - each with values
 * @param {(v: number) => string} [format]
 * @returns {string}
 */
export function formatGroupValueLines(groups, format = formatPrecise) {
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
