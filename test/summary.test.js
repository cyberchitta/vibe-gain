import { describe, expect, test } from "bun:test";
import { boxFiguresOrNull } from "../core/stats/box-figures.js";
import { phiQuantile } from "../core/stats/phi-quantile.js";

// The deleted calculateBoxPlotStats read pPhi as sorted[floor(0.68·(n−1))].
const publishedPhi = (/** @type {number[]} */ values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(0.68 * (sorted.length - 1))];
};

describe("phiQuantile", () => {
  test("matches the published pPhi", () => {
    const lists = [
      [5],
      [3, 1, 2],
      [46, 54, 68, 134, 172, 206, 333, 562],
      Array.from({ length: 37 }, (_, i) => (i * 7919) % 101),
    ];
    lists.forEach((values) => expect(phiQuantile(values)).toBe(publishedPhi(values)));
  });

  test("no values has no phi", () => {
    expect(phiQuantile([])).toBeNull();
  });
});

describe("boxFiguresOrNull", () => {
  test("a period with no values has no box", () => {
    expect(boxFiguresOrNull([])).toBeNull();
    expect(boxFiguresOrNull([2, 1])?.median).toBe(1);
  });
});

// cyberchitta.cc loads these; a dangling import fails every chart while the
// rest of the tests pass (b45f960).
describe("consumer entry modules", () => {
  const modules = [
    "../core/data/pdm-node.js",
    "../core/data/pdm-browser.js",
    "../lib/export/text-formatter.js",
    "../browser/renderers/histogram.js",
    "../browser/renderers/box-plot.js",
    "../browser/renderers/strip-plot.js",
    "../browser/charts/strip-plot.js",
  ];
  modules.forEach((path) =>
    test(`${path} loads`, async () => {
      expect(await import(path)).toBeDefined();
    }),
  );
});
