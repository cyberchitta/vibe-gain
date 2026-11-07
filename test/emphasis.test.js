import { describe, expect, test } from "bun:test";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import { DIM_OPACITY } from "../browser/specs/emphasis.js";
import { createCumulativeShareSpec } from "../browser/specs/cumulative-share.js";
import { createGroupBoxPlotSpec } from "../browser/specs/group-box-plot.js";
import { createLinkedColumnsSpec, PIN_PARAM, setPinned } from "../browser/specs/linked-columns.js";
import { binValues, halfOctaveBuckets } from "../core/stats/bins.js";
import { boxGroup } from "../core/stats/box-group.js";
import { cumulativeShares } from "../core/stats/cumulative.js";

const MARKED = [46, 54, 68, 134, 172, 206, 333, 562];
const UNMARKED = [88, 116, 134, 200, 295, 306, 312, 445, 669, 2791];

const boxGroups = [
  {
    ...boxGroup({ id: "m", label: "AI-marked · 41% one line", color: "#4e79a7", values: MARKED, highlights: [{ value: 46, note: "ours" }] }),
    bins: binValues(MARKED, halfOctaveBuckets(512)),
    references: [{ value: 100, label: "100" }],
  },
  {
    ...boxGroup({ id: "u", label: "Unmarked", color: "#f28e2b", values: UNMARKED }),
    bins: binValues(UNMARKED, halfOctaveBuckets(512)),
    references: [{ value: 300, label: "300" }],
  },
];
const boxOptions = { log: true, yDomain: /** @type {[number, number]} */ ([40, 1000]), showPoints: true };

const shareGroups = [
  { id: "m", label: "AI-marked", color: "#4e79a7", shares: cumulativeShares(MARKED) },
  { id: "u", label: "Unmarked", color: "#f28e2b", shares: cumulativeShares(UNMARKED) },
];

const linkedGroups = [
  { key: "marked", label: "Marked", color: "#2f6fb0" },
  { key: "unmarked", label: "Unmarked", color: "#8a8a8a" },
];
const rows = [
  { id: "A", group: "unmarked", logic: 2258, deps: 9, ratio: 0.42 },
  { id: "B", group: "marked", logic: 4228, deps: 0, ratio: 1.5 },
  { id: "C", group: "marked", logic: 523, deps: 32, ratio: 0 },
];
const columns = [
  { key: "logic", label: "Lines of code", scale: "log", ticks: [523, 2258, 4228] },
  { key: "deps", label: "Direct deps", scale: "log", ticks: [0, 9, 32] },
  { key: "ratio", label: "Test-to-product", scale: "linear", ticks: [0, 0.42, 1.5] },
];

/** @param {object} spec */
async function viewOf(spec) {
  const compiled = vegaLite.compile({ ...spec, width: 400, height: 300 }).spec;
  const view = new vega.View(vega.parse(compiled), { renderer: "none" });
  await view.runAsync();
  return { view, compiled };
}

/** Every scenegraph item, with the type of the mark it belongs to. */
function items(node, marktype = null, out = []) {
  const type = node.marktype ?? marktype;
  if (node.datum !== undefined && node.marktype === undefined) out.push({ marktype: type, item: node });
  (node.items ?? []).forEach((i) => items(i, type, out));
  return out;
}

const close = (a, b) => Math.abs(a - b) < 1e-9;

describe("emphasize, with nothing selected", () => {
  test("leaves every spec exactly as without the option", () => {
    [undefined, []].forEach((emphasize) => {
      expect(createGroupBoxPlotSpec(boxGroups, { ...boxOptions, emphasize })).toEqual(createGroupBoxPlotSpec(boxGroups, boxOptions));
      expect(createCumulativeShareSpec(shareGroups, { emphasize })).toEqual(createCumulativeShareSpec(shareGroups));
      expect(createLinkedColumnsSpec(rows, columns, linkedGroups, { emphasize, pinned: undefined })).toEqual(
        createLinkedColumnsSpec(rows, columns, linkedGroups),
      );
    });
  });
});

describe("createGroupBoxPlotSpec emphasize", () => {
  test("every mark of the other groups is drawn at DIM_OPACITY times its usual opacity, the emphasized group's as before", async () => {
    const plain = await viewOf(createGroupBoxPlotSpec(boxGroups, boxOptions));
    const lit = await viewOf(createGroupBoxPlotSpec(boxGroups, { ...boxOptions, emphasize: ["m"] }));
    const before = items(plain.view.scenegraph().root);
    const after = items(lit.view.scenegraph().root);
    expect(after.length).toBe(before.length);
    const dimmedTypes = new Set();
    after.forEach(({ marktype, item }, i) => {
      const usual = before[i].item.opacity ?? 1;
      const dimmed = item.datum.dim === true;
      if (dimmed) dimmedTypes.add(marktype);
      // The dimmed group is the right one: its marks lie right of the chart's middle (400 px
      // wide). Axis items are not the groups' marks.
      if (item.datum.tickIndex === undefined) expect(dimmed).toBe(item.x > 200);
      expect(close(item.opacity ?? 1, dimmed ? usual * DIM_OPACITY : usual)).toBe(true);
    });
    expect([...dimmedTypes].sort()).toEqual(["rect", "rule", "symbol", "text"]);
    expect(await lit.view.toSVG()).toContain(`opacity="${DIM_OPACITY}"`);
    plain.view.finalize();
    lit.view.finalize();
  });

  test("a group is named by its id, else its label", () => {
    const unnamed = boxGroups.map(({ id, ...g }) => g);
    const byLabel = createGroupBoxPlotSpec(unnamed, { ...boxOptions, emphasize: ["Unmarked"] });
    const byId = createGroupBoxPlotSpec(boxGroups, { ...boxOptions, emphasize: ["u"] });
    expect(JSON.stringify(byLabel)).toBe(JSON.stringify(byId));
  });

  test("rejects an id that names no group", () => {
    expect(() => createGroupBoxPlotSpec(boxGroups, { emphasize: ["Unmarked"] })).toThrow(
      'createGroupBoxPlotSpec: emphasize names "Unmarked", which is not among the ids: "m", "u"',
    );
  });
});

describe("createCumulativeShareSpec emphasize", () => {
  test("the other groups' curves are dimmed, the emphasized one's drawn as before", async () => {
    const { view } = await viewOf(createCumulativeShareSpec(shareGroups, { emphasize: ["u"] }));
    const lines = items(view.scenegraph().root).filter((i) => i.marktype === "line").map((i) => i.item);
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((l) => expect(l.strokeOpacity ?? 1).toBe(l.datum.group === "AI-marked" ? DIM_OPACITY : 1));
    expect(lines.filter((l) => l.strokeOpacity === DIM_OPACITY).length).toBe(cumulativeShares(MARKED).length + 1);
    view.finalize();
  });

  test("rejects an id that names no group", () => {
    expect(() => createCumulativeShareSpec(shareGroups, { emphasize: ["u", "x"] })).toThrow(
      'createCumulativeShareSpec: emphasize names "x", which is not among the ids: "m", "u"',
    );
  });
});

describe("createLinkedColumnsSpec emphasize and pin", () => {
  /** Each subject's opacity in a mark type, for the items drawn. */
  const opacities = (view, marktype) =>
    Object.fromEntries(items(view.scenegraph().root).filter((i) => i.marktype === marktype).map(({ item }) => [item.datum.id, item.opacity]));

  test("the other subjects' dots, lines and names are dimmed", async () => {
    const { view, compiled } = await viewOf(createLinkedColumnsSpec(rows, columns, linkedGroups, { emphasize: ["B"] }));
    const dots = items(view.scenegraph().root).filter((i) => i.marktype === "symbol" && i.item.size === 34).map((i) => i.item);
    dots.forEach((d) => expect(close(d.opacity, d.datum.id === "B" ? 0.85 : 0.85 * DIM_OPACITY)).toBe(true));
    await setPinned(view, compiled, "A");
    expect(close(opacities(view, "line").A, 0.95 * DIM_OPACITY)).toBe(true);
    expect(close(opacities(view, "text").A, DIM_OPACITY)).toBe(true);
    await setPinned(view, compiled, "B");
    expect(opacities(view, "line").B).toBe(0.95);
    expect(opacities(view, "text").B).toBe(1);
    view.finalize();
  });

  test("a subject pinned at build time is lit; setPinned moves and clears the pin", async () => {
    const { view, compiled } = await viewOf(createLinkedColumnsSpec(rows, columns, linkedGroups, { pinned: "C" }));
    const shown = () => Object.entries(opacities(view, "line")).filter(([, o]) => o > 0).map(([id]) => id);
    expect(view.data(`${PIN_PARAM}_store`).map((t) => t.values)).toEqual([["C"]]);
    expect(shown()).toEqual(["C"]);
    await setPinned(view, compiled, "A");
    expect(shown()).toEqual(["A"]);
    await setPinned(view, compiled, null);
    expect(shown()).toEqual([]);
    view.finalize();
  });

  test("rejects ids that name no subject", () => {
    expect(() => createLinkedColumnsSpec(rows, columns, linkedGroups, { emphasize: ["Z"] })).toThrow(
      'createLinkedColumnsSpec: emphasize names "Z", which is not among the ids: "A", "B", "C"',
    );
    expect(() => createLinkedColumnsSpec(rows, columns, linkedGroups, { pinned: "Z" })).toThrow(
      'createLinkedColumnsSpec: pinned names "Z", which is not among the row ids',
    );
  });
});
