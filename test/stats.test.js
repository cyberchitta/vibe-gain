import { describe, expect, test } from "bun:test";
import { binFrom, binValues, fromNaturalBuckets, halfOctaveBuckets } from "../core/stats/bins.js";
import { getNaturalBuckets } from "../core/data/bucketing.js";
import { boxFigures } from "../core/stats/box-figures.js";
import { boxGroup } from "../core/stats/box-group.js";
import { cumulativeShares } from "../core/stats/cumulative.js";
import { periodGroup } from "../core/data/period-group.js";
import { formatNumber, formatNumberGrouped, formatPrecise } from "../core/utils/format.js";

// The article's two groups (bounty-entries, measure.py 2026-10-27).
const MARKED = [46, 54, 68, 134, 172, 206, 333, 562];
const UNMARKED = [88, 116, 134, 200, 295, 306, 312, 445, 669, 2791];

describe("boxFigures", () => {
  // Frozen from the deleted calculateBoxPlotStats, which every published figure came from.
  test("lower matches the figures vibe-gain has published", () => {
    const cases = [
      [MARKED, [46, 46, 54, 134, 206, 333, 562, 8]],
      [UNMARKED, [88, 88, 134, 295, 312, 669, 2791, 10]],
      [[5], [5, 5, 5, 5, 5, 5, 5, 1]],
      [[3, 1, 2], [1, 1, 1, 2, 2, 2, 3, 3]],
      [Array.from({ length: 37 }, (_, i) => (i * 7919) % 101), [0, 3, 25, 50, 75, 94, 100, 37]],
    ];
    cases.forEach(([values, published]) => {
      const f = boxFigures(values);
      expect([f.min, f.p5, f.q1, f.median, f.q3, f.p95, f.max, f.n]).toEqual(published);
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

describe("binFrom", () => {
  const buckets = halfOctaveBuckets(8);

  test("bins from the floor, shares of all values, and the share below it", () => {
    const { bins, below } = binFrom([1, 1, 1, 1, 2, 3, 3, 9], buckets, 2);
    expect(below).toBe(0.5);
    expect(bins.map((b) => [b.label, b.count, b.share])).toEqual([
      ["2", 1, 1 / 8], ["3", 2, 2 / 8], ["4–5", 0, 0], ["6–7", 0, 0], ["8+", 1, 1 / 8],
    ]);
  });

  test("a floor at the first edge bins everything, as binValues does", () => {
    const values = [1, 2, 5, 40];
    expect(binFrom(values, buckets, 1)).toEqual({ bins: binValues(values, buckets), below: 0 });
  });

  test("every value below the floor leaves empty bins", () => {
    const { bins, below } = binFrom([1, 1], buckets, 2);
    expect(below).toBe(1);
    expect(bins.every((b) => b.count === 0 && b.share === 0)).toBe(true);
  });

  test("a floor that is not a bucket edge is refused", () => {
    expect(() => binFrom([1, 2], buckets, 5)).toThrow("not a bucket edge");
  });
});

describe("halfOctaveBuckets", () => {
  test("reproduces cyberchitta.cc's line-count buckets", () => {
    const edges = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072];
    const expected = edges.map((lo, i) => {
      const hi = edges[i + 1] ?? Infinity;
      const label = hi === lo + 1 ? `${lo}` : hi === Infinity ? `${lo}+` : `${lo}–${hi - 1}`;
      return { lo, hi, label };
    });
    expect(halfOctaveBuckets(3072)).toEqual(expected);
  });

  test("the smallest top is one open bucket", () => {
    expect(halfOctaveBuckets(1)).toEqual([{ lo: 1, hi: Infinity, label: "1+" }]);
  });

  test("a top that is not a half-octave edge is refused", () => {
    expect(() => halfOctaveBuckets(5)).toThrow("half-octave edge");
    expect(() => halfOctaveBuckets(0)).toThrow("half-octave edge");
    expect(() => halfOctaveBuckets(1.5)).toThrow("half-octave edge");
    expect(() => halfOctaveBuckets(Infinity)).toThrow("half-octave edge");
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
      "0.18",
      "0.050",
      "46",
      "1235",
      "N/A",
    ]);
  });
});

describe("formatNumberGrouped", () => {
  test("formatNumber's rounding, with en-US separators on the rounded figure", () => {
    expect([1735656, 1000, 999.6, 999, -1500, 1234.56, 48.83, 0.178, undefined].map(formatNumberGrouped)).toEqual([
      "1,735,656",
      "1,000",
      "1,000",
      "999",
      "-1,500",
      "1,235",
      "48.8",
      "0.18",
      "N/A",
    ]);
  });
});

describe("formatPrecise", () => {
  test("two decimals, no padding, small figures never 0", () => {
    expect([300.5, 12, 0.15, 1.25, 13 / 3, 0.1 + 0.2, 0.004719, 1234.567].map(formatPrecise)).toEqual([
      "300.5",
      "12",
      "0.15",
      "1.25",
      "4.33",
      "0.3",
      "0.00472",
      "1234.57",
    ]);
  });
});

// The old box plot's binning, kept exactly because published charts draw from it.
describe("periodGroup", () => {
  const bins = (values, metricId) => periodGroup({ period: "p", color: "#000", values }, metricId).bins;

  test("natural buckets: top bucket ends at twice its start, values below the first dropped", () => {
    expect(bins([0.5, 1, 3, 4, 120], "commits").map((b) => [b.label, b.lo, b.hi, b.count, b.share])).toEqual([
      ["1", 1, 2, 1, 0.2],
      ["3-4", 3, 5, 2, 0.4],
      ["50+", 50, 100, 1, 0.2],
    ]);
  });

  test("one bin per integer, else up to 20 equal bins", () => {
    expect(bins([2, 2, 4]).map((b) => [b.lo, b.hi, b.count])).toEqual([[1.5, 2.5, 2], [3.5, 4.5, 1]]);
    const wide = bins(Array.from({ length: 51 }, (_, i) => i * 1.5));
    expect(wide).toHaveLength(8);
    expect(wide.reduce((n, b) => n + b.count, 0)).toBe(51);
  });
});
