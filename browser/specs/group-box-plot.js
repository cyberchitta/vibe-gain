import { formatNumber } from "../../core/utils/format.js";
import { DEFAULT_COLORS, axisConfig } from "./chart-colors.js";
import { defined } from "./defined.js";
import { dim, dimmedIds } from "./emphasis.js";
import { swarm } from "./swarm.js";
import { getBaseVegaLiteSpec } from "./vega-base.js";

/** @typedef {import("./chart-data.js").BoxGroup} BoxGroup */

/**
 * @typedef {object} GroupBoxPlotOptions
 * @property {number | "container"} [width]
 * @property {number | "container"} [height]
 * @property {string} [yLabel]
 * @property {boolean} [log] - log y axis
 * @property {number} [floor] - values below it are drawn at it; needed on a
 *   log axis when any value is 0 or less
 * @property {[number, number]} [yDomain] - default: the smallest to the largest value drawn.
 *   A narrower domain cuts the chart: marks stop at its edges, and a whisker
 *   that runs past one ends in a triangle labelled with its true value
 * @property {object} [yAxis] - Vega-Lite axis properties merged over ours (tick values, labelExpr)
 * @property {boolean} [showPercentiles] - crosses at p5 and p95, and their figure labels (default true)
 * @property {boolean} [showHistogram] - bars for groups that have bins (default true)
 * @property {boolean} [showShares] - each bar's share labelled beside it (default true)
 * @property {boolean} [showFigures] - each box's figures labelled beside it (default true)
 * @property {boolean} [reserveFigureSpace] - with `showFigures` off, keep the
 *   room the labels would take, so switching them on and off leaves the plot's
 *   size alone (default true). Turn off for a chart that never shows them.
 * @property {boolean} [showPoints] - a dot per value left of each box (default false; needs values)
 * @property {boolean} [labelCounts] - "label (n)" under each box (default false)
 * @property {number} [boxOpacity] - default 1
 * @property {number} [histogramWidth] - the widest bar, in box spacings (default 0.3)
 * @property {(v: number) => string} [format] - figure labels and tooltips
 * @property {(share: number) => string} [formatShare] - histogram labels; share is a fraction (default "22.2%")
 * @property {Partial<import("./chart-colors.js").ChartColors>} [colors]
 * @property {readonly string[]} [emphasize] - ids of the groups to draw as
 *   usual (a group's `id`, else its label); every mark of the others is
 *   drawn at DIM_OPACITY times its opacity (their axis labels are not: Vega
 *   sets an axis label's opacity itself). Empty or unset: nothing is dimmed
 */

const BOX_HALF = 0.0625;
const CAP_HALF = 0.04;
const LABEL_RULE = 0.2;
const POINT_OFFSET = -0.22;
/** Labels closer than this share of the axis height crowd each other: 12 px on a 300 px chart. */
const LABEL_GAP = 0.04;
/** The shortest bar, as a share of the axis height: 3 px on a 300 px chart. */
const MIN_BAR = 0.01;
/** Half the width of a reference line, in box spacings. */
const REF_HALF = 0.2;

/**
 * Box plots side by side, one per labelled group, drawn from figures the
 * groups carry. Optional layers: histogram, reference lines, figure labels,
 * dots, highlights.
 * @param {readonly BoxGroup[]} groups
 * @param {GroupBoxPlotOptions} [options]
 */
export function createGroupBoxPlotSpec(groups, options = {}) {
  const o = resolveOptions(options);
  validate(groups, o);
  const floored = clampTo(o.floor);
  const domain = o.yDomain ?? yExtent(groups, floored);
  const at = (/** @type {number} */ v) => Math.min(Math.max(floored(v), domain[0]), domain[1]);
  const inside = (/** @type {number} */ v) => floored(v) === at(v);
  const drawn = groups.map((g) => clipGroup(g, at, inside));
  const dimmed = dimmedIds("createGroupBoxPlotSpec", groups.map((g) => g.id ?? g.label), o.emphasize);
  const enc = encoders(groups, o, domain, dimmed);
  const layers = [
    ...(o.showHistogram ? histogramLayers(drawn, o, at, domain, enc) : []),
    ...boxLayers(drawn, o, at, inside, enc),
    ...referenceLayers(drawn, at, enc),
    ...(o.showFigures || o.reserveFigureSpace ? figureLayers(drawn, o, at, inside, domain, enc) : []),
    ...cutLayers(drawn, o, inside, domain, enc),
    ...(o.showPoints ? pointLayers(drawn, o, at, domain, enc) : []),
    ...highlightLayers(drawn, o, at, domain, enc),
  ];
  return {
    ...getBaseVegaLiteSpec(),
    width: o.width,
    height: o.height,
    config: axisConfig(o.colors),
    layer: dimmed ? layers.map(dimLayer) : layers,
  };
}

/**
 * A layer whose rows marked `dim` are drawn at DIM_OPACITY times its
 * opacity. The others keep the mark's own, Vega-Lite's default included,
 * since the condition has no other value.
 * @template {{ mark: { type: string, opacity?: number }, encoding?: object }} L
 * @param {L} layer
 */
function dimLayer(layer) {
  const usual = layer.mark.opacity ?? (layer.mark.type === "point" ? VEGA_LITE_POINT_OPACITY : 1);
  return { ...layer, encoding: { ...layer.encoding, opacity: { condition: { test: "datum.dim", value: dim(usual) } } } };
}

/** Vega-Lite's opacity for a point mark that sets none (`test/emphasis.test.js` renders it). */
const VEGA_LITE_POINT_OPACITY = 0.7;

/** @param {GroupBoxPlotOptions} options */
function resolveOptions(options) {
  return {
    width: /** @type {number | "container"} */ ("container"),
    height: /** @type {number | "container"} */ ("container"),
    log: false,
    showPercentiles: true,
    showHistogram: true,
    showShares: true,
    showFigures: true,
    reserveFigureSpace: true,
    showPoints: false,
    labelCounts: false,
    boxOpacity: 1,
    histogramWidth: 0.3,
    format: formatNumber,
    formatShare: (/** @type {number} */ share) => `${(100 * share).toFixed(1)}%`,
    ...defined(options),
    colors: { ...DEFAULT_COLORS, ...defined(options.colors ?? {}) },
  };
}

/** @typedef {ReturnType<typeof resolveOptions>} Options */

/**
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 */
function validate(groups, o) {
  if (groups.length === 0) throw new Error("createGroupBoxPlotSpec: no groups");
  if (o.showPoints) {
    const bare = groups.find((g) => !g.values);
    if (bare) throw new Error(`createGroupBoxPlotSpec: showPoints needs values, and "${bare.label}" has none`);
  }
  const lowest = Math.min(...groups.map((g) => g.figures.min), o.yDomain?.[0] ?? Infinity);
  if (o.log && lowest <= 0 && !((o.floor ?? 0) > 0)) {
    throw new Error(`createGroupBoxPlotSpec: a log axis cannot show ${lowest}; pass a floor above 0`);
  }
}

/** @param {number | undefined} floor */
function clampTo(floor) {
  return (/** @type {number} */ v) => (floor === undefined ? v : Math.max(v, floor));
}

/**
 * @param {readonly BoxGroup[]} groups
 * @param {(v: number) => number} at
 * @returns {[number, number]}
 */
function yExtent(groups, at) {
  const refs = groups.flatMap((g) => (g.references ?? []).map((r) => r.value));
  return [
    at(Math.min(...groups.map((g) => g.figures.min), ...refs)),
    at(Math.max(...groups.map((g) => g.figures.max), ...refs)),
  ];
}

/**
 * A group without the values, references, highlights and bars that fall
 * outside the domain, so none is drawn at an edge it does not belong at.
 * Its figures stay whole: the box and whiskers are clamped, and a cut is
 * labelled with the true figure.
 * @param {BoxGroup} g
 * @param {(v: number) => number} at
 * @param {(v: number) => boolean} inside
 * @returns {BoxGroup}
 */
function clipGroup(g, at, inside) {
  /** A bar, trimmed to the group's min and max, keeps some height or sits inside. */
  const overlaps = (/** @type {import("./chart-data.js").Bin} */ b) => {
    const [lo, hi] = [Math.max(b.lo, g.figures.min), Math.min(b.hi, g.figures.max)];
    return at(lo) < at(hi) || (lo >= hi && inside(lo));
  };
  return {
    ...g,
    ...(g.values && { values: g.values.filter(inside) }),
    ...(g.references && { references: g.references.filter((r) => inside(r.value)) }),
    ...(g.highlights && { highlights: g.highlights.filter((h) => inside(h.value)) }),
    ...(g.bins && { bins: g.bins.filter(overlaps) }),
  };
}

/**
 * Channel builders sharing one x and one y scale across every layer.
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 * @param {[number, number]} domain
 * @param {Set<string> | null} dimmed - ids of the groups to dim
 */
function encoders(groups, o, domain, dimmed) {
  const dimmedAt = groups.flatMap((g, gi) => (dimmed?.has(g.id ?? g.label) ? [gi] : []));
  const labels = groups.map((g) => (o.labelCounts ? `${g.label} (${g.figures.n})` : g.label));
  const xScale = { domain: [-0.5, groups.length - 0.5] };
  const xAxis = {
    values: groups.map((_, i) => i),
    labelExpr: `${JSON.stringify(labels)}[datum.value]`,
    title: null,
    grid: false,
    ticks: false,
    domain: false,
  };
  const yScale = { type: o.log ? "log" : "linear", domain, nice: false, ...(!o.log && { zero: false }) };
  const yAxis = { grid: true, ...(o.log && { format: "~s" }), ...o.yAxis };
  return {
    /** @param {string} field */
    x: (field) => ({ field, type: "quantitative", scale: xScale, axis: xAxis }),
    /** @param {string} field */
    y: (field) => ({ field, type: "quantitative", scale: yScale, axis: yAxis, title: o.yLabel ?? null }),
    log: o.log,
    /** A row's mark that it is to be dimmed, when its group is. */
    dim: (/** @type {number} */ gi) => (dimmedAt.includes(gi) ? { dim: true } : {}),
  };
}

/** @typedef {ReturnType<typeof encoders>} Enc */

/**
 * Boxes and whiskers, clamped to the domain. A cap, cross or median square
 * whose figure lies outside it is left out: drawn at the edge, it would
 * claim a figure there.
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 * @param {(v: number) => number} at
 * @param {(v: number) => boolean} inside
 * @param {Enc} enc
 */
function boxLayers(groups, o, at, inside, enc) {
  const rows = groups.map((g, gi) => ({
    ...g.figures,
    ...figureTexts(g.figures, o),
    group: g.label,
    color: g.color,
    gi,
    x0: gi - BOX_HALF,
    x1: gi + BOX_HALF,
    c0: gi - CAP_HALF,
    c1: gi + CAP_HALF,
    ymin: at(g.figures.min),
    yp5: at(g.figures.p5),
    yq1: at(g.figures.q1),
    ymed: at(g.figures.median),
    yq3: at(g.figures.q3),
    yp95: at(g.figures.p95),
    ymax: at(g.figures.max),
    ...enc.dim(gi),
  }));
  const data = { values: rows };
  const where = (/** @type {FigureKey} */ k) => ({ values: rows.filter((r) => inside(r[k])) });
  const { fg, muted, bg } = o.colors;
  /** @type {(x: string, x2: string | null, y: string, y2: string | null) => object} */
  const span = (x, x2, y, y2) => ({
    x: enc.x(x),
    ...(x2 && { x2: { field: x2 } }),
    y: enc.y(y),
    ...(y2 && { y2: { field: y2 } }),
  });
  const rule = { type: "rule", color: muted, strokeWidth: 1 };
  const cross = { type: "point", shape: "cross", size: 60, filled: true, fill: bg, stroke: muted, strokeWidth: 1 };
  return [
    {
      data,
      mark: { type: "rect", fillOpacity: o.boxOpacity, stroke: muted, strokeWidth: 2 },
      encoding: {
        ...span("x0", "x1", "yq1", "yq3"),
        fill: { field: "color", type: "nominal", scale: null },
        tooltip: boxTooltip(),
      },
    },
    { data, mark: rule, encoding: span("gi", null, "ymin", "yq1") },
    { data, mark: rule, encoding: span("gi", null, "yq3", "ymax") },
    { data: where("min"), mark: rule, encoding: span("c0", "c1", "ymin", null) },
    { data: where("max"), mark: rule, encoding: span("c0", "c1", "ymax", null) },
    {
      data: where("median"),
      mark: { type: "point", shape: "square", size: 60, filled: true, color: fg },
      encoding: span("gi", null, "ymed", null),
    },
    ...(o.showPercentiles
      ? /** @type {const} */ (["p5", "p95"]).map((k) => ({ data: where(k), mark: cross, encoding: span("gi", null, `y${k}`, null) }))
      : []),
  ];
}

/** @typedef {"min" | "p5" | "q1" | "median" | "q3" | "p95" | "max"} FigureKey */

/** @type {readonly FigureKey[]} */
const FIGURE_KEYS = ["min", "p5", "q1", "median", "q3", "p95", "max"];

/**
 * Figures as text, under `text_<key>`, for the tooltip.
 * @param {import("./chart-data.js").BoxFigures} f
 * @param {Options} o
 */
function figureTexts(f, o) {
  return Object.fromEntries(FIGURE_KEYS.map((k) => [`text_${k}`, o.format(f[k])]));
}

function boxTooltip() {
  return [
    { field: "group", type: "nominal" },
    { field: "n", type: "quantitative" },
    ...FIGURE_KEYS.map((k) => ({ field: `text_${k}`, type: "nominal", title: k })),
  ];
}

/**
 * Figure labels, for the figures that have a marker: one per drawn height,
 * so of figures clamped to the floor only the lowest is labelled. Figures
 * that would crowd each other share one label, "upper / lower", at the
 * upper one's height. Figures outside the domain are left to `cutLayers`.
 *
 * With `showFigures` off they are still laid out, unseen, unless
 * `reserveFigureSpace` is off too. Labels at
 * the edges reach past the plot (the last group's to the right, the top
 * figure's above), and Vega's fit makes room for them only when they are
 * there, so dropping them would resize the plot whenever labels are
 * switched off. A fixed pad would need their width, which is not known here.
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 * @param {(v: number) => number} at
 * @param {(v: number) => boolean} inside
 * @param {[number, number]} domain
 * @param {Enc} enc
 */
function figureLayers(groups, o, at, inside, domain, enc) {
  const keys = o.showPercentiles ? FIGURE_KEYS : FIGURE_KEYS.filter((k) => k !== "p5" && k !== "p95");
  const pos = axisPosition(domain, enc.log);
  const rows = groups.flatMap((g, gi) => {
    const shown = [...keys].reverse().filter((k) => inside(g.figures[k]));
    const byHeight = new Map(shown.map((k) => [at(g.figures[k]), g.figures[k]]));
    return crowdedRuns([...byHeight], pos).map((run) => ({
      y: run[0][0],
      x0: gi,
      x1: gi + LABEL_RULE,
      text: run.map(([, v]) => o.format(v)).join(" / "),
      ...enc.dim(gi),
    }));
  });
  const data = { values: rows };
  const color = o.colors.muted;
  const text = { type: "text", align: "left", baseline: "middle", dx: 4, fontSize: 9, color };
  const labels = { data, encoding: { x: enc.x("x1"), y: enc.y("y"), text: { field: "text" } } };
  if (!o.showFigures) return [{ ...labels, mark: { ...text, opacity: 0, interactive: false } }];
  return [
    {
      data,
      mark: { type: "rule", strokeDash: [2, 2], opacity: 0.7, color },
      encoding: { x: enc.x("x0"), x2: { field: "x1" }, y: enc.y("y") },
    },
    { ...labels, mark: text },
  ];
}

/**
 * Where a whisker runs past the domain: a triangle at the edge it is cut
 * at, pointing on, and its true figure labelled beside it, shown whether or
 * not the other figures are.
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 * @param {(v: number) => boolean} inside
 * @param {[number, number]} domain
 * @param {Enc} enc
 */
function cutLayers(groups, o, inside, domain, enc) {
  const edges = /** @type {const} */ ([
    { key: "max", y: domain[1], shape: "triangle-up", arrow: "↑" },
    { key: "min", y: domain[0], shape: "triangle-down", arrow: "↓" },
  ]);
  const rows = edges.flatMap((e) =>
    groups.flatMap((g, gi) =>
      inside(g.figures[e.key]) ? [] : [{ gi, lx: gi + LABEL_RULE, y: e.y, shape: e.shape, cut: `${e.arrow} ${o.format(g.figures[e.key])}`, group: g.label, ...enc.dim(gi) }],
    ),
  );
  if (rows.length === 0) return [];
  const data = { values: rows };
  const color = o.colors.muted;
  return [
    {
      data,
      mark: { type: "point", filled: true, size: 50, color },
      encoding: { x: enc.x("gi"), y: enc.y("y"), shape: { field: "shape", type: "nominal", scale: null } },
    },
    {
      data,
      mark: { type: "text", align: "left", baseline: "middle", dx: 4, fontSize: 9, color },
      encoding: { x: enc.x("lx"), y: enc.y("y"), text: { field: "cut" } },
    },
  ];
}

/**
 * Where a value sits along the y axis, from 0 at the bottom to 1 at the top.
 * @param {[number, number]} domain
 * @param {boolean} log
 */
function axisPosition(domain, log) {
  const f = log ? Math.log : (/** @type {number} */ v) => v;
  const [lo, hi] = domain.map(f);
  return (/** @type {number} */ v) => (f(v) - lo) / (hi - lo);
}

/**
 * [height, figure] pairs, top down, split into runs: a pair joins the run
 * above when it is within LABEL_GAP of that run's lowest member.
 * @param {readonly [number, number][]} pairs
 * @param {(v: number) => number} pos
 * @returns {[number, number][][]}
 */
function crowdedRuns(pairs, pos) {
  return pairs.reduce((runs, pair) => {
    const last = runs.at(-1);
    const lowest = last?.at(-1);
    const crowded = last && lowest && Math.abs(pos(lowest[0]) - pos(pair[0])) < LABEL_GAP;
    return crowded ? [...runs.slice(0, -1), [...last, pair]] : [...runs, [pair]];
  }, /** @type {[number, number][][]} */ ([]));
}

/**
 * Bars across each box, width by share, with the share labelled left. Each
 * bar spans only the part of its bucket between the group's min and max,
 * where its values are; the tooltip still names the whole bucket.
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 * @param {(v: number) => number} at
 * @param {[number, number]} domain
 * @param {Enc} enc
 */
function histogramLayers(groups, o, at, domain, enc) {
  const bins = groups.flatMap((g, gi) =>
    (g.bins ?? [])
      .filter((b) => b.count > 0)
      .map((b) => ({ ...b, gi, group: g.label, color: g.color, lo: Math.max(b.lo, g.figures.min), hi: Math.min(b.hi, g.figures.max) })),
  );
  if (bins.length === 0) return [];
  const maxShare = Math.max(...bins.map((b) => b.share));
  const rows = bins.map((b) => {
    const w = (b.share / maxShare) * o.histogramWidth;
    const y0 = at(b.lo);
    const y1 = barTop(y0, at(b.hi), domain, enc.log);
    return {
      group: b.group, label: b.label, count: b.count, color: b.color,
      x0: b.gi - w / 2, x1: b.gi + w / 2, lx: b.gi - o.histogramWidth / 2 - 0.02,
      y0, y1, mid: enc.log ? Math.sqrt(y0 * y1) : (y0 + y1) / 2,
      share: o.formatShare(b.share),
      ...enc.dim(b.gi),
    };
  });
  const data = { values: rows };
  return [
    {
      data,
      mark: { type: "rect", opacity: 0.6, stroke: o.colors.bg, strokeWidth: 0.5 },
      encoding: {
        x: enc.x("x0"), x2: { field: "x1" }, y: enc.y("y0"), y2: { field: "y1" },
        fill: { field: "color", type: "nominal", scale: null },
        tooltip: [{ field: "group" }, { field: "label", title: "bucket" }, { field: "count" }, { field: "share" }],
      },
    },
    ...(o.showShares
      ? [
          {
            data,
            mark: { type: "text", align: "right", baseline: "middle", fontSize: 9, color: o.colors.muted },
            encoding: { x: enc.x("lx"), y: enc.y("mid"), text: { field: "share" } },
          },
        ]
      : []),
  ];
}

/**
 * A dashed line across each group's box at each of its reference values,
 * labelled right of it, in the group's colour.
 * @param {readonly BoxGroup[]} groups
 * @param {(v: number) => number} at
 * @param {Enc} enc
 */
function referenceLayers(groups, at, enc) {
  const rows = groups.flatMap((g, gi) =>
    (g.references ?? []).map((r) => ({
      x0: gi - REF_HALF, x1: gi + REF_HALF, lx: gi + REF_HALF + 0.05,
      y: at(r.value), label: r.label, color: g.color, group: g.label, ...enc.dim(gi),
    })),
  );
  if (rows.length === 0) return [];
  const data = { values: rows };
  return [
    {
      data,
      mark: { type: "rule", strokeWidth: 2, strokeDash: [5, 5], opacity: 0.8 },
      encoding: {
        x: enc.x("x0"), x2: { field: "x1" }, y: enc.y("y"),
        color: { field: "color", type: "nominal", scale: null },
        tooltip: [{ field: "group" }, { field: "label", title: "reference" }],
      },
    },
    {
      data,
      mark: { type: "text", align: "left", baseline: "middle", fontSize: 10, fontWeight: "bold" },
      encoding: { x: enc.x("lx"), y: enc.y("y"), text: { field: "label" }, color: { field: "color", type: "nominal", scale: null } },
    },
  ];
}

/**
 * A bar's top, raised to `MIN_BAR` when trimming left it no height: a
 * bucket whose values are all one figure (every value equal, or a "10+"
 * bucket holding only the max of 10) must still show.
 * @param {number} y0
 * @param {number} y1
 * @param {[number, number]} domain
 * @param {boolean} log
 */
function barTop(y0, y1, [d0, d1], log) {
  if (y1 > y0) return y1;
  return log ? y0 * (d1 / d0) ** MIN_BAR : y0 + (d1 - d0) * MIN_BAR;
}

/**
 * Dot positions for every group, keyed for the highlight ring to find.
 * @param {readonly BoxGroup[]} groups
 * @param {(v: number) => number} at
 * @param {[number, number]} domain
 * @param {boolean} log
 */
function placePoints(groups, at, domain, log) {
  return groups.flatMap((g, gi) =>
    swarm((g.values ?? []).map(at), gi + POINT_OFFSET, { log, span: domain[1] - domain[0] }).map((p) => ({
      ...p, gi, group: g.label, color: g.color,
    })),
  );
}

/**
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 * @param {(v: number) => number} at
 * @param {[number, number]} domain
 * @param {Enc} enc
 */
function pointLayers(groups, o, at, domain, enc) {
  const rows = placePoints(groups, at, domain, o.log).map((p) => ({ ...p, text: o.format(p.value), ...enc.dim(p.gi) }));
  return [
    {
      data: { values: rows },
      mark: { type: "point", filled: true, size: 70, opacity: 0.9 },
      encoding: {
        x: enc.x("x"), y: enc.y("value"),
        fill: { field: "color", type: "nominal", scale: null },
        tooltip: [{ field: "group" }, { field: "text", title: "value" }],
      },
    },
  ];
}

/**
 * A ring round each highlighted value: on its dot when dots are shown, else
 * on the box's centre line.
 * @param {readonly BoxGroup[]} groups
 * @param {Options} o
 * @param {(v: number) => number} at
 * @param {[number, number]} domain
 * @param {Enc} enc
 */
function highlightLayers(groups, o, at, domain, enc) {
  const points = o.showPoints ? placePoints(groups, at, domain, o.log) : [];
  const rows = groups.flatMap((g, gi) =>
    (g.highlights ?? []).map((h) => {
      const y = at(h.value);
      const dot = points.find((p) => p.gi === gi && p.value === y);
      return { x: dot ? dot.x : gi, y, text: `${o.format(h.value)} (${h.note})`, group: g.label, ...enc.dim(gi) };
    }),
  );
  if (rows.length === 0) return [];
  return [
    {
      data: { values: rows },
      mark: { type: "point", filled: false, size: 220, strokeWidth: 2.5, color: o.colors.highlight },
      encoding: { x: enc.x("x"), y: enc.y("y"), tooltip: [{ field: "group" }, { field: "text", title: "value" }] },
    },
  ];
}
