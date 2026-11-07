import { describe, expect, test } from "bun:test";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import { createBoxPlotSpec } from "../browser/specs/box-plot.js";
import { createCumulativeShareSpec } from "../browser/specs/cumulative-share.js";
import { createGroupBoxPlotSpec } from "../browser/specs/group-box-plot.js";
import { swarm } from "../browser/specs/swarm.js";
import { binFrom, fromNaturalBuckets, halfOctaveBuckets } from "../core/stats/bins.js";
import { getNaturalBuckets } from "../core/data/bucketing.js";
import { boxGroup } from "../core/stats/box-group.js";
import { cumulativeShares } from "../core/stats/cumulative.js";

const MARKED = [46, 54, 68, 134, 172, 206, 333, 562];
const UNMARKED = [88, 116, 134, 200, 295, 306, 312, 445, 669, 2791];

const groups = [
  boxGroup({ label: "AI-marked", color: "#4e79a7", values: MARKED, highlights: [{ value: 46, note: "ours" }] }),
  boxGroup({ label: "Unmarked", color: "#f28e2b", values: UNMARKED }),
];

/** Compile and render headless; a spec Vega cannot draw fails here. */
async function render(spec) {
  const sized = { ...spec, width: 400, height: 300 };
  const view = new vega.View(vega.parse(vegaLite.compile(sized).spec), { renderer: "none" });
  const svg = await view.toSVG();
  view.finalize();
  return svg;
}

const marks = (spec) => spec.layer.map((l) => l.mark.type);

describe("createGroupBoxPlotSpec", () => {
  test("the article's chart renders with dots, ring and group labels", async () => {
    const spec = createGroupBoxPlotSpec(groups, { log: true, yDomain: [20, 5000], showPoints: true, showPercentiles: false });
    const svg = await render(spec);
    expect(svg).toContain("AI-marked");
    expect(svg).toContain("Unmarked");
    expect(marks(spec).filter((m) => m === "point")).toHaveLength(3);
  });

  test("options passed as undefined keep their defaults", () => {
    const unset = { showFigures: undefined, reserveFigureSpace: undefined, format: undefined, colors: { muted: undefined } };
    expect(createGroupBoxPlotSpec(groups, unset)).toEqual(createGroupBoxPlotSpec(groups));
  });

  test("the ring sits on its dot", () => {
    const spec = createGroupBoxPlotSpec(groups, { log: true, showPoints: true });
    const ring = spec.layer.at(-1).data.values[0];
    const dots = spec.layer.at(-2).data.values;
    expect(dots.some((d) => d.x === ring.x && d.value === ring.y)).toBe(true);
  });

  test("figures passed in, histogram from caller bins, floor below zero", async () => {
    const passed = {
      label: "repo",
      color: "#59a14f",
      figures: { n: 9, min: 0, p5: 0, q1: 3, median: 12, q3: 40, p95: 300, max: 492 },
      bins: [
        { lo: 0, hi: 1, label: "0", count: 2, share: 2 / 9 },
        { lo: 1, hi: 50, label: "1-49", count: 5, share: 5 / 9 },
        { lo: 50, hi: Infinity, label: "50+", count: 2, share: 2 / 9 },
      ],
    };
    const spec = createGroupBoxPlotSpec([passed], { log: true, floor: 0.5 });
    await render(spec);
    const labels = spec.layer.find((l) => l.mark.type === "text" && l.encoding.text.field === "text").data.values;
    expect(labels.filter((l) => l.y === 0.5).map((l) => l.text)).toEqual(["0"]);
  });

  test("histogram from a floor draws shares that sum to less than 1", async () => {
    const values = [1, 1, 1, 1, 2, 3, 3, 9, 40, 300];
    const { bins } = binFrom(values, halfOctaveBuckets(256), 2);
    const spec = createGroupBoxPlotSpec([{ ...boxGroup({ label: "C", color: "#000", values }), bins }], { log: true });
    await render(spec);
    const bars = spec.layer.find((l) => l.mark.type === "rect" && l.encoding.tooltip).data.values;
    expect(bars.map((b) => b.share)).toEqual(["10.0%", "20.0%", "10.0%", "10.0%", "10.0%"]);
  });

  test("p5 and p95 are labelled only when their crosses are drawn", () => {
    const g = { label: "g", color: "#000", figures: { n: 9, min: 1, p5: 2, q1: 3, median: 4, q3: 5, p95: 6, max: 7 } };
    const labelled = (showPercentiles) =>
      createGroupBoxPlotSpec([g], { showPercentiles })
        .layer.find((l) => l.mark.type === "text" && l.encoding.text.field === "text")
        .data.values.map((l) => l.text);
    expect(labelled(true)).toEqual(["7", "6", "5", "4", "3", "2", "1"]);
    expect(labelled(false)).toEqual(["7", "5", "4", "3", "1"]);
  });

  test("figures that would crowd each other share one label", async () => {
    const g = { label: "g", color: "#000", figures: { n: 99, min: 46, p5: 48.8, q1: 100, median: 153, q3: 300, p95: 2056, max: 2058 } };
    const spec = createGroupBoxPlotSpec([g], { log: true, yDomain: [20, 5000], format: String });
    await render(spec);
    const labels = spec.layer.find((l) => l.mark.type === "text" && l.encoding.text.field === "text").data.values;
    expect(labels.map((l) => [l.y, l.text])).toEqual([
      [2058, "2058 / 2056"],
      [300, "300"],
      [153, "153"],
      [100, "100"],
      [48.8, "48.8 / 46"],
    ]);
  });

  test("figure labels at the edges leave the plot's height alone", async () => {
    const plotHeight = async (showFigures, log) => {
      const spec = { ...createGroupBoxPlotSpec(groups, { showFigures, log }), width: 400, height: 300 };
      const view = new vega.View(vega.parse(vegaLite.compile(spec).spec), { renderer: "none" });
      await view.runAsync();
      const [bottom, top] = view.scale("y").range();
      view.finalize();
      return bottom - top;
    };
    for (const log of [false, true]) expect(await plotHeight(true, log)).toBe(await plotHeight(false, log));
  });

  describe("figure labels past the last group", () => {
    const many = Array.from({ length: 10 }, (_, i) => boxGroup({ label: `G${i}`, color: "#000", values: UNMARKED.map((v) => v * 1000 * (i + 1)) }));
    const plotWidth = async (showFigures, reserveFigureSpace = true) => {
      const spec = { ...createGroupBoxPlotSpec(many, { showFigures, reserveFigureSpace, log: true }), width: 400, height: 300 };
      const view = new vega.View(vega.parse(vegaLite.compile(spec).spec), { renderer: "none" });
      await view.runAsync();
      const [left, right] = view.scale("x").range();
      view.finalize();
      return right - left;
    };

    test("leave the plot's width alone when switched off", async () => {
      expect(await plotWidth(true)).toBe(await plotWidth(false));
    });

    test("give their room back with reserveFigureSpace off", async () => {
      expect(await plotWidth(false, false)).toBeGreaterThan(await plotWidth(true));
    });
  });

  test("figure labels switched off without reserved space are not drawn at all", () => {
    const spec = createGroupBoxPlotSpec(groups, { showFigures: false, reserveFigureSpace: false });
    expect(spec.layer.some((l) => l.mark.type === "text" && l.encoding.text.field === "text")).toBe(false);
  });

  test("figure labels switched off are laid out but not shown", async () => {
    const spec = createGroupBoxPlotSpec(groups, { showFigures: false });
    await render(spec);
    const figures = spec.layer.filter((l) => l.mark.type === "text" && l.encoding.text.field === "text");
    expect(figures).toHaveLength(1);
    expect(figures[0].mark).toMatchObject({ opacity: 0, interactive: false });
    expect(spec.layer.some((l) => l.mark.type === "rule" && l.mark.strokeDash)).toBe(false);
  });

  describe("a y domain that cuts a whisker", () => {
    const tall = {
      ...boxGroup({ label: "tall", color: "#000", values: [10, 20, 30, 40, 50, 60, 900, 5000] }),
      bins: [
        { lo: 0, hi: 100, label: "<100", count: 6, share: 0.75 },
        { lo: 100, hi: Infinity, label: "100+", count: 2, share: 0.25 },
      ],
    };
    const spec = createGroupBoxPlotSpec([tall], { log: true, yDomain: [5, 100], showPoints: true, format: String });
    const layer = (pred) => spec.layer.filter(pred).flatMap((l) => l.data.values);
    const isText = (field) => (l) => l.mark.type === "text" && l.encoding.text.field === field;

    test("labels the true max at the edge, once", async () => {
      await render(spec);
      expect(layer(isText("cut")).map((r) => [r.y, r.cut])).toEqual([[100, "↑ 5000"]]);
      expect(layer(isText("text")).map((r) => r.text)).not.toContain("5000");
    });

    test("draws nothing past the edge, and no cap or cross at it", () => {
      const heights = spec.layer.flatMap((l) => l.data.values.flatMap((r) => [r.y, r.y0, r.y1, r.value, r.ymax].filter((v) => v !== undefined)));
      expect(Math.max(...heights)).toBe(100);
      expect(layer((l) => l.mark.shape === "cross" && l.encoding.y.field === "yp95")).toEqual([]);
      expect(spec.layer.filter((l) => l.mark.type === "rule" && l.encoding.x.field === "c0").map((l) => l.data.values.length)).toEqual([1, 0]);
      expect(layer((l) => l.mark.type === "point" && l.mark.size === 70).map((r) => r.value)).toEqual([10, 20, 30, 40, 50, 60]);
    });
  });

  test("a y domain that holds every value cuts nothing", () => {
    const spec = createGroupBoxPlotSpec(groups, { log: true, yDomain: [20, 5000] });
    expect(spec.layer.some((l) => l.mark.type === "text" && l.encoding.text.field === "cut")).toBe(false);
  });

  test("a log axis with a zero and no floor is refused", () => {
    const zero = boxGroup({ label: "z", color: "#000", values: [0, 1, 2] });
    expect(() => createGroupBoxPlotSpec([zero], { log: true })).toThrow("pass a floor");
  });

  test("dots need values", () => {
    const { values, ...bare } = groups[0];
    expect(() => createGroupBoxPlotSpec([bare], { showPoints: true })).toThrow("needs values");
  });

  test("vibe-gain buckets draw as a histogram", async () => {
    const g = boxGroup({ label: "days", color: "#000", values: [1, 2, 2, 3, 7, 12, 60], buckets: fromNaturalBuckets(getNaturalBuckets("commits")) });
    const spec = createGroupBoxPlotSpec([g], { log: true });
    expect(marks(spec)[0]).toBe("rect");
    await render(spec);
  });

  const bars = (spec) => spec.layer[0].data.values.map((r) => ({ group: r.group, label: r.label, y0: r.y0, y1: r.y1 }));
  const buckets = fromNaturalBuckets(getNaturalBuckets("commits"));
  const binned = (valueSets, log) =>
    createGroupBoxPlotSpec(
      valueSets.map((values, i) => boxGroup({ label: `g${i}`, color: "#000", values, buckets })),
      { log },
    );

  test("bars span only the group's min to max", () => {
    const rows = bars(binned([[3, 4, 7, 12, 60]], false));
    expect(Math.min(...rows.map((r) => r.y0))).toBe(3);
    expect(Math.max(...rows.map((r) => r.y1))).toBe(60);
  });

  test("a bucket holding one figure still shows a bar", () => {
    for (const log of [false, true]) {
      const rows = bars(binned([[5, 5, 5], [1, 2, 50]], log));
      const flat = rows.filter((r) => r.group === "g0" || r.label === "50+");
      expect(flat).toHaveLength(2);
      flat.forEach((r) => expect(r.y1).toBeGreaterThan(r.y0));
    }
  });
});

describe("createBoxPlotSpec", () => {
  const periods = [
    { period: "Pre-AI", color: "#111", values: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233] },
    { period: "Recent-AI", color: "#222", values: [2, 3, 3, 4, 40, 60] },
  ];
  const textOf = (spec, field) =>
    spec.layer.filter((l) => l.mark.type === "text" && l.encoding.text.field === field).flatMap((l) => l.data.values.map((r) => r[field]));

  test("old options reach the group box plot", async () => {
    const spec = createBoxPlotSpec(periods, {
      metricId: "all_commit_intervals",
      useLogScale: true,
      showValues: false,
      referenceLines: [{ period: "Recent-AI", value: 45 }, { period: "Pre-AI", value: 0 }],
    });
    await render(spec);
    expect(textOf(spec, "share")).toEqual([]);
    expect(textOf(spec, "label")).toEqual(["45min"]);
    expect(spec.layer[0].encoding.y.axis.labelExpr).toContain("sec");
  });

  test("p5 and p95 are labelled only when their crosses are drawn", () => {
    const labelled = (showPercentiles) => textOf(createBoxPlotSpec(periods.slice(0, 1), { showPercentiles }), "text");
    expect(labelled(true)).toContain("144");
    expect(labelled(false)).not.toContain("144");
    expect(labelled(false)).toContain("233");
  });

  test("a period without values is left out", () => {
    const spec = createBoxPlotSpec([...periods, { period: "Empty", color: "#333", values: [] }]);
    expect(spec.layer.find((l) => l.mark.type === "rect" && l.data.values[0]?.q1 !== undefined).data.values).toHaveLength(2);
  });
});

describe("createCumulativeShareSpec", () => {
  test("renders one line per group", async () => {
    const spec = createCumulativeShareSpec(
      [
        { label: "AI-marked", color: "#4e79a7", shares: cumulativeShares(MARKED) },
        { label: "Unmarked", color: "#f28e2b", shares: cumulativeShares(UNMARKED) },
      ],
      { log: true, xLabel: "lines" },
    );
    const svg = await render(spec);
    expect(svg).toContain("Unmarked");
  });

  test("colors passed as undefined keep their defaults", () => {
    const groups = [{ label: "AI-marked", color: "#4e79a7", shares: cumulativeShares(MARKED) }];
    expect(createCumulativeShareSpec(groups, { colors: { fg: undefined, muted: undefined } })).toEqual(createCumulativeShareSpec(groups));
  });
});

describe("swarm", () => {
  test("close values spread sideways, far ones stay centred", () => {
    const xs = swarm([100, 101, 102, 1000], 0, { log: true, span: 0 }).map((p) => p.x);
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeGreaterThan(0);
    expect(xs[2]).toBeLessThan(0);
    expect(xs[3]).toBe(0);
  });
});
