import { describe, expect, test } from "bun:test";
import { calculateBoxPlotStats } from "../core/utils/array.js";
import { binValues, fromNaturalBuckets } from "../core/stats/bins.js";
import { getNaturalBuckets } from "../core/data/bucketing.js";
import { boxFigures } from "../core/stats/box-figures.js";
import { boxGroup } from "../core/stats/box-group.js";
import { cumulativeShares } from "../core/stats/cumulative.js";
import { formatNumber } from "../core/utils/format.js";

// The article's two groups (bounty-entries, measure.py 2026-10-27).
const MARKED = [46, 54, 68, 134, 172, 206, 333, 562];
const UNMARKED = [88, 116, 134, 200, 295, 306, 312, 445, 669, 2791];

describe("boxFigures", () => {
  test("lower matches the figures vibe-gain has published", () => {
    const samples = [MARKED, UNMARKED, [5], [3, 1, 2], Array.from({ length: 37 }, (_, i) => (i * 7919) % 101)];
    samples.forEach((values) => {
      const old = calculateBoxPlotStats(values);
      const f = boxFigures(values);
      expect([f.min, f.p5, f.q1, f.median, f.q3, f.p95, f.max, f.n]).toEqual([
        old.min, old.p5, old.p25, old.median, old.p75, old.p95, old.max, old.count,
      ]);
    });
  });

  test("linear interpolates the medians the article prints", () => {
    expect(boxFigures(MARKED, "lower").median).toBe(134);
    expect(boxFigures(MARKED, "linear").median).toBe(153);
    expect(boxFigures(UNMARKED, "linear").median).toBe(300.5);
  });

  test("an empty list is refused", () => {
    expect(() => boxFigures([])).toThrow("no values");
  });
});

describe("binValues", () => {
  const buckets = [
    { lo: 0, hi: 10, label: "0-9" },
    { lo: 10, hi: Infinity, label: "10+" },
  ];

  test("counts and shares", () => {
    const bins = binValues([1, 2, 10, 500], buckets);
    expect(bins.map((b) => [b.count, b.share])).toEqual([[2, 0.5], [2, 0.5]]);
  });

  test("a value outside every bucket is refused", () => {
    expect(() => binValues([-1], buckets)).toThrow("outside the buckets");
  });

  test("vibe-gain's buckets convert", () => {
    expect(fromNaturalBuckets(getNaturalBuckets("commits")).at(-1)).toEqual({ lo: 50, hi: Infinity, label: "50+" });
  });
});

describe("cumulativeShares", () => {
  test("one point per distinct value", () => {
    expect(cumulativeShares([3, 1, 3, 2])).toEqual([
      { value: 1, share: 0.25 },
      { value: 2, share: 0.5 },
      { value: 3, share: 1 },
    ]);
  });
});

describe("boxGroup", () => {
  test("a highlight must be one of the values", () => {
    expect(() =>
      boxGroup({ label: "A", color: "#000", values: [1, 2], highlights: [{ value: 3, note: "ours" }] }),
    ).toThrow("not among the values");
  });

  test("bins only when buckets are given", () => {
    const g = boxGroup({ label: "A", color: "#000", values: [1, 2] });
    expect(g.bins).toBeUndefined();
    expect(boxGroup({ label: "A", color: "#000", values: [1, 2], buckets: fromNaturalBuckets(getNaturalBuckets("commits")) }).bins).toHaveLength(7);
  });
});

describe("formatNumber", () => {
  test("always text, rounded by size", () => {
    expect([153, 300.5, 48.83, 0.178, 0.05, 46.0, 1234.56, undefined].map(formatNumber)).toEqual([
      "153",
      "301",
      "48.8",
      "0.2",
      "0.050",
      "46",
      "1235",
      "N/A",
    ]);
  });
});
