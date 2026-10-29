import { expect, test } from "bun:test";

// The charts draw what they are given; aggregation is the caller's. These
// files must not import any computing code (types from chart-data.js are fine).
const DRAWING = [
  "browser/specs/chart-data.js",
  "browser/specs/chart-colors.js",
  "browser/specs/figure-format.js",
  "browser/specs/swarm.js",
  "browser/specs/group-box-plot.js",
  "browser/specs/cumulative-share.js",
  "lib/export/group-text.js",
];
const ALLOWED = /^(\.\/|\.\.\/\.\.\/browser\/specs\/)(chart-data|chart-colors|figure-format|swarm|vega-base)\.js$/;

test("drawing code imports only drawing code", async () => {
  const bad = (
    await Promise.all(
      DRAWING.map(async (file) => {
        const src = await Bun.file(new URL(`../${file}`, import.meta.url)).text();
        const specifiers = [...src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
        return specifiers.filter((s) => !ALLOWED.test(s)).map((s) => `${file} → ${s}`);
      }),
    )
  ).flat();
  expect(bad).toEqual([]);
});
