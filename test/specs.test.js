import { describe, expect, test } from "bun:test";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
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
