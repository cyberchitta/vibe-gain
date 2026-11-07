import { describe, expect, test } from "bun:test";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import { createLinkedColumnsSpec, HOVER_PARAM, PIN_PARAM } from "../browser/specs/linked-columns.js";
import { formatLinkedColumnTable } from "../lib/export/group-text.js";
import { formatCompact } from "../core/utils/format.js";

const groups = [
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

/** @param {object} spec @param {number} width */
async function viewOf(spec, width = 400) {
  const view = new vega.View(vega.parse(vegaLite.compile({ ...spec, width, height: 300 }).spec), { renderer: "none" });
  await view.runAsync();
  return view;
}

/** Every text drawn, from the scenegraph. */
function texts(node, out = []) {
  if (node.text !== undefined) out.push(node.text);
  (node.items ?? []).forEach((i) => texts(i, out));
  return out;
}

const layerOf = (spec, type, pred = () => true) => spec.layer.filter((l) => l.mark.type === type).find(pred);

describe("createLinkedColumnsSpec", () => {
  test("compiles and renders headless, with the subjects and headings", async () => {
    const view = await viewOf(createLinkedColumnsSpec(rows, columns, groups));
    const svg = await view.toSVG();
    view.finalize();
    expect(svg).toContain("Direct deps");
    expect(svg).toContain("4.2k");
  });

  test("hover and pin select a subject by id and light its line and name", async () => {
    const spec = createLinkedColumnsSpec(rows, columns, groups);
    const hit = spec.layer.find((l) => l.params);
    expect(hit.params.map((p) => [p.name, p.select.on, p.select.fields])).toEqual([
      [HOVER_PARAM, "pointerover", ["id"]],
      [PIN_PARAM, "click", ["id"]],
    ]);
    const lit = [HOVER_PARAM, PIN_PARAM];
    expect(layerOf(spec, "line").encoding.opacity.condition.map((c) => c.param)).toEqual(lit);
    expect(layerOf(spec, "text", (l) => l.encoding.text.field === "id").encoding.opacity.condition.map((c) => c.param)).toEqual(lit);
    const view = await viewOf(spec);
    expect(view.data(`${PIN_PARAM}_store`)).toEqual([]);
    expect(view.data(`${HOVER_PARAM}_store`)).toEqual([]);
    view.finalize();
  });

  test("a pinned or hovered subject's line and name are drawn, the others' not", async () => {
    const spec = createLinkedColumnsSpec(rows, columns, groups);
    const compiled = vegaLite.compile({ ...spec, width: 400, height: 300 }).spec;
    const view = new vega.View(vega.parse(compiled), { renderer: "none" });
    await view.runAsync();
    const shown = (marktype) => {
      const out = [];
      const walk = (n) =>
        n.marktype === marktype ? out.push(...n.items) : (n.items ?? []).forEach(walk);
      walk(view.scenegraph().root);
      return [...new Set(out.filter((i) => i.opacity > 0).map((i) => i.datum.id))];
    };
    // The selection tuples a click or pointerover would set; set here because a headless view has no events.
    const select = async (param, id) => {
      const update = compiled.signals.find((s) => s.name === `${param}_tuple`).on[0].update;
      const unit = update.match(/unit: "([^"]+)"/)[1];
      view.signal(`${param}_tuple`, id && { unit, fields: view.signal(`${param}_tuple_fields`), values: [id] });
      await view.runAsync();
    };
    expect(shown("line")).toEqual([]);
    await select(PIN_PARAM, "B");
    expect(shown("line")).toEqual(["B"]);
    expect(shown("text")).toEqual(["B"]);
    await select(HOVER_PARAM, "C");
    expect(shown("line").sort()).toEqual(["B", "C"]);
    await select(PIN_PARAM, null);
    await select(HOVER_PARAM, null);
    expect(shown("line")).toEqual([]);
    view.finalize();
  });

  test("a log column draws its zeros in a band below, labelled 0", () => {
    const spec = createLinkedColumnsSpec(rows, columns, groups);
    const points = layerOf(spec, "circle").data.values;
    const zero = points.find((p) => p.id === "B" && p.column === "Direct deps");
    expect(zero.y).toBeLessThan(0);
    const ticks = layerOf(spec, "text", (l) => l.mark.color === "#666666").data.values;
    expect(ticks.filter((t) => t.x === 1 && t.y === zero.y).map((t) => t.text)).toEqual(["0", "0"]);
    expect(ticks.filter((t) => t.x === 2 && t.y < 0)).toEqual([]);
  });

  test("headings wrap when a column is narrower than its heading, not when wide", async () => {
    const heads = (view) => texts(view.scenegraph().root).filter((t) => /code|deps|product/.test(t));
    const narrow = await viewOf(createLinkedColumnsSpec(rows, columns, groups), 200);
    const wide = await viewOf(createLinkedColumnsSpec(rows, columns, groups), 1200);
    expect(heads(narrow)).toEqual(["Lines\nof code", "Direct\ndeps", "Test-to-\nproduct"]);
    expect(heads(wide)).toEqual(["Lines of code", "Direct deps", "Test-to-product"]);
    narrow.finalize();
    wide.finalize();
  });

  test("colours merge over the defaults; undefined keeps a default", () => {
    const spec = createLinkedColumnsSpec(rows, columns, groups, { colors: { fg: "#eee", bg: undefined } });
    const heading = spec.layer.at(-1);
    expect(heading.mark.color).toBe("#eee");
    expect(spec.layer.at(-3).mark.stroke).toBe("#ffffff");
    expect(createLinkedColumnsSpec(rows, columns, groups, { width: undefined, format: undefined })).toEqual(
      createLinkedColumnsSpec(rows, columns, groups),
    );
  });

  test("rejects input it cannot draw", () => {
    const negative = [...rows, { id: "D", group: "marked", logic: 10, deps: -1, ratio: 0 }];
    expect(() => createLinkedColumnsSpec(negative, columns, groups)).toThrow(
      'createLinkedColumnsSpec: row "D" has -1 in log column "deps"',
    );
    const stranger = [...rows, { id: "D", group: "other", logic: 10, deps: 1, ratio: 0 }];
    expect(() => createLinkedColumnsSpec(stranger, columns, groups)).toThrow('row "D" has group "other"');
    const missing = [...rows, { id: "D", group: "marked", logic: 10, ratio: 0 }];
    expect(() => createLinkedColumnsSpec(missing, columns, groups)).toThrow('row "D" has no number for column "deps"');
    const flat = rows.map((r) => ({ ...r, deps: 0 }));
    expect(() => createLinkedColumnsSpec(flat, columns, groups)).toThrow('log column "deps" needs two different values above 0');
  });
});

test("linked column table: a row per subject, its group's label, the values in full", () => {
  expect(formatLinkedColumnTable(rows, columns, groups)).toBe(
    [
      "| Entry | Group | Lines of code | Direct deps | Test-to-product |",
      "|-------|-------|---------------|-------------|-----------------|",
      "| A | Unmarked | 2258 | 9 | 0.42 |",
      "| B | Marked | 4228 | 0 | 1.5 |",
      "| C | Marked | 523 | 32 | 0 |",
      "",
    ].join("\n"),
  );
});

test("formatCompact: k for thousands, two decimals below 10", () => {
  expect([0, 12968, 4228, 999.6, 48.8, 9.999, 0.426, 1.5].map(formatCompact)).toEqual(
    ["0", "13.0k", "4.2k", "1000", "49", "10", "0.43", "1.5"],
  );
});
