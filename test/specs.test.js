import { describe, expect, test } from "bun:test";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import { createBoxPlotSpec } from "../browser/specs/box-plot.js";
import { createCumulativeShareSpec } from "../browser/specs/cumulative-share.js";
import { createGroupBoxPlotSpec } from "../browser/specs/group-box-plot.js";
import { swarm } from "../browser/specs/swarm.js";
import { fromNaturalBuckets } from "../core/stats/bins.js";
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
  test("p5 and p95 are labelled only when their crosses are drawn", () => {
    const periods = [{ period: "p", color: "#000", values: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233] }];
    const labelled = (showPercentiles) =>
      createBoxPlotSpec(periods, { showPercentiles })
        .layer.find((l) => l.mark.type === "text" && l.encoding.text.field === "label")
        .data.values.map((l) => l.label);
    expect(labelled(true)).toContain("144");
    expect(labelled(false)).not.toContain("144");
    expect(labelled(false)).toContain("233");
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
