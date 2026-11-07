import { formatCompact } from "../../core/utils/format.js";
import { DEFAULT_COLORS } from "./chart-colors.js";
import { defined } from "./defined.js";

/** @typedef {import("./chart-data.js").LinkedRow} LinkedRow */
/** @typedef {import("./chart-data.js").LinkedColumn} LinkedColumn */
/** @typedef {import("./chart-data.js").LinkedGroup} LinkedGroup */
/** @typedef {import("./chart-colors.js").ChartColors} ChartColors */

/**
 * @typedef {object} LinkedColumnsOptions
 * @property {number | "container"} [width]
 * @property {number | "container"} [height]
 * @property {(v: number) => string} [format] - tick labels and tooltips (default `formatCompact`)
 * @property {Partial<ChartColors>} [colors] - `fg` headings, `muted` column
 *   rules and tick labels, `bg` the halo behind tick labels (the page's background)
 */

/**
 * The selection that lights a subject while the pointer is over one of its dots.
 * Each is a point selection on the field `id`.
 */
export const HOVER_PARAM = "hov";
/** The selection that keeps a subject lit after a click or tap on one of its dots. */
export const PIN_PARAM = "pin";

/** Where a log column draws its zeros, which the log scale cannot place: a band below it. */
const ZERO = -0.1;
const TOP = 1.14;

/**
 * Headings are 11px semibold. Vega cannot measure text in an expression, so
 * a heading's width is estimated per character, with a margin to the next.
 */
const HEADING_CHAR_PX = 6.8;
const HEADING_GAP_PX = 10;

/**
 * Linked columns: one row of numbers per subject, each column on its own
 * scale, a dot per subject per column. Hovering a dot draws that subject's
 * line across the columns; a click or tap pins it. Headings wrap onto two
 * lines when a column is narrower than its heading.
 * @param {readonly LinkedRow[]} rows
 * @param {readonly LinkedColumn[]} columns
 * @param {readonly LinkedGroup[]} groups - the colour of each group the rows name
 * @param {LinkedColumnsOptions} [options]
 */
export function createLinkedColumnsSpec(rows, columns, groups, options = {}) {
  const values = parse(rows, columns, groups);
  const colors = { ...DEFAULT_COLORS, ...defined(options.colors ?? {}) };
  const { width = "container", height = "container", format = formatCompact } = defined(options);
  const marks = columns.map((c, x) => columnMarks(rows, c, values[x], x, format));
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width,
    height,
    background: null,
    config: { view: { stroke: null } },
    layer: layers(
      marks.flatMap((m) => m.points),
      marks.flatMap((m) => m.ticks),
      columns,
      groups,
      colors,
    ),
  };
}

/**
 * Each column's values, checked against what the chart can draw.
 * @param {readonly LinkedRow[]} rows
 * @param {readonly LinkedColumn[]} columns
 * @param {readonly LinkedGroup[]} groups
 * @returns {number[][]}
 */
function parse(rows, columns, groups) {
  if (rows.length === 0) fail("there are no rows");
  if (columns.length === 0) fail("there are no columns");
  const keys = new Set(groups.map((g) => g.key));
  const ids = new Set();
  rows.forEach((r) => {
    if (ids.has(r.id)) fail(`row id "${r.id}" appears twice; ids pick out a subject's line`);
    ids.add(r.id);
    if (!keys.has(r.group)) fail(`row "${r.id}" has group "${r.group}", which is not among the groups`);
  });
  return columns.map((c) => columnValues(rows, c));
}

/**
 * @param {readonly LinkedRow[]} rows
 * @param {LinkedColumn} column
 * @returns {number[]}
 */
function columnValues(rows, column) {
  if (column.scale !== "log" && column.scale !== "linear") {
    fail(`column "${column.key}" has scale "${column.scale}"; use "log" or "linear"`);
  }
  const values = rows.map((r) => {
    const v = r[column.key];
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`row "${r.id}" has no number for column "${column.key}"`);
    if (column.scale === "log" && v < 0) fail(`row "${r.id}" has ${v} in log column "${column.key}"`);
    return v;
  });
  const span = column.scale === "log" ? values.filter((v) => v > 0) : [Math.min(0, ...values), ...values];
  if (span.length === 0 || Math.min(...span) === Math.max(...span)) {
    fail(
      column.scale === "log"
        ? `log column "${column.key}" needs two different values above 0 to set its scale`
        : `linear column "${column.key}" has no span: every value is ${values[0]}`,
    );
  }
  return values;
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new Error(`createLinkedColumnsSpec: ${message}`);
}

/**
 * A column's place for each value, 0 at the bottom and 1 at the top.
 * @param {LinkedColumn} column
 * @param {readonly number[]} values
 * @returns {(v: number) => number}
 */
function placer(column, values) {
  if (column.scale !== "log") {
    const lo = Math.min(0, ...values);
    const hi = Math.max(...values);
    return (v) => (v - lo) / (hi - lo);
  }
  const positive = values.filter((v) => v > 0);
  const lo = Math.log(Math.min(...positive));
  const hi = Math.log(Math.max(...positive));
  return (v) => (v <= 0 ? ZERO : (Math.log(v) - lo) / (hi - lo));
}

/**
 * @param {readonly LinkedRow[]} rows
 * @param {LinkedColumn} column
 * @param {readonly number[]} values - the rows' values in this column
 * @param {number} x
 * @param {(v: number) => string} format
 */
function columnMarks(rows, column, values, x, format) {
  const at = placer(column, values);
  const points = rows.map((r, i) => ({
    id: r.id,
    group: r.group,
    x,
    y: at(values[i]),
    value: format(values[i]),
    column: column.label,
  }));
  const zero = column.scale === "log" && values.some((v) => v <= 0) ? [{ x, y: ZERO, text: "0" }] : [];
  const ticks = [...column.ticks.map((v) => ({ x, y: at(v), text: format(v) })), ...zero];
  return { points, ticks };
}

/**
 * The heading on two lines, broken at the space or hyphen nearest its
 * middle; the label itself when it has no break point.
 * @param {string} label
 */
function twoLines(label) {
  const breaks = [...label.matchAll(/ |-/g)].map((m) => (m[0] === "-" ? m.index + 1 : m.index));
  if (breaks.length === 0) return label;
  const mid = label.length / 2;
  const at = breaks.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return `${label.slice(0, at).trimEnd()}\n${label.slice(at).trimStart()}`;
}

/**
 * @param {LinkedColumn} column
 * @param {number} x
 */
function heading(column, x) {
  const need = column.label.length * HEADING_CHAR_PX + HEADING_GAP_PX;
  return { x, y: TOP, one: column.label, two: twoLines(column.label), need };
}

/**
 * An encoding value: `on` for a subject hovered or pinned, `off` otherwise.
 * @param {number} on
 * @param {number} off
 */
const lit = (on, off) => ({
  condition: [HOVER_PARAM, PIN_PARAM].map((param) => ({ param, empty: false, value: on })),
  value: off,
});

/**
 * @param {readonly object[]} points
 * @param {readonly object[]} ticks
 * @param {readonly LinkedColumn[]} columns
 * @param {readonly LinkedGroup[]} groups
 * @param {ChartColors} colors
 */
function layers(points, ticks, columns, groups, colors) {
  const X = { field: "x", type: "quantitative", axis: null, scale: { domain: [-0.45, columns.length - 0.55] } };
  const Y = { field: "y", type: "quantitative", axis: null, scale: { domain: [ZERO - 0.04, TOP + 0.04] } };
  const color = {
    field: "group",
    type: "nominal",
    legend: null,
    scale: { domain: groups.map((g) => g.key), range: groups.map((g) => g.color) },
  };
  const at = { x: X, y: Y };
  const tickText = { ...at, text: { field: "text" } };
  return [
    {
      data: { values: columns.map((_, x) => ({ x, y: 0, y1: 1 })) },
      mark: { type: "rule", color: colors.muted, strokeWidth: 1 },
      encoding: { ...at, y2: { field: "y1" } },
    },
    {
      data: { values: points },
      mark: { type: "line" },
      encoding: {
        ...at,
        color,
        detail: { field: "id" },
        order: { field: "x" },
        opacity: lit(0.95, 0),
        strokeWidth: { value: 2.5 },
      },
    },
    { data: { values: points }, mark: { type: "circle", size: 34, opacity: 0.85 }, encoding: { ...at, color } },
    hitLayer(points, at),
    {
      data: { values: points },
      transform: [{ filter: `datum.x === ${columns.length - 1}` }],
      mark: { type: "text", align: "left", dx: 8, fontSize: 12, fontWeight: 600 },
      encoding: { ...at, color, text: { field: "id" }, opacity: lit(1, 0) },
    },
    {
      data: { values: ticks },
      mark: { type: "text", align: "right", dx: -6, fontSize: 10, color: colors.bg, stroke: colors.bg, strokeWidth: 4 },
      encoding: tickText,
    },
    {
      data: { values: ticks },
      mark: { type: "text", align: "right", dx: -6, fontSize: 10, color: colors.muted },
      encoding: tickText,
    },
    {
      // Wraps when a column (the chart's width over the column count) is narrower than its heading.
      data: { values: columns.map(heading) },
      transform: [{ calculate: `width / ${columns.length} < datum.need ? datum.two : datum.one`, as: "text" }],
      mark: { type: "text", fontSize: 11, fontWeight: 600, color: colors.fg, lineBreak: "\n", baseline: "bottom" },
      encoding: tickText,
    },
  ];
}

/**
 * Large invisible circles over the dots, which carry the hover and pin
 * selections and the tooltip: a dot is too small a target for a finger.
 * @param {readonly object[]} points
 * @param {object} at - the x and y encodings
 */
function hitLayer(points, at) {
  return {
    data: { values: points },
    mark: { type: "circle", size: 420, fillOpacity: 0.001, strokeOpacity: 0, cursor: "pointer" },
    params: [
      { name: HOVER_PARAM, select: { type: "point", on: "pointerover", clear: "pointerout", fields: ["id"] } },
      { name: PIN_PARAM, select: { type: "point", on: "click", fields: ["id"] } },
    ],
    encoding: {
      ...at,
      tooltip: [{ field: "id", title: "entry" }, { field: "column" }, { field: "value" }],
    },
  };
}
