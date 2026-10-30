import { expect, test } from "bun:test";
import { boxGroup } from "../core/stats/box-group.js";
import { formatGroupBinTable, formatGroupFigureTable, formatGroupValueLines } from "../lib/export/group-text.js";
import { formatBoxPlotTable, formatHistogramTable } from "../lib/export/text-formatter.js";

const groups = [
  boxGroup({
    label: "AI-marked",
    color: "#000",
    values: [562, 46, 54, 68, 134, 172, 206, 333],
    method: "linear",
    highlights: [{ value: 46, note: "ours" }],
  }),
  boxGroup({ label: "Unmarked", color: "#000", values: [88, 116, 134, 200, 295, 306, 312, 445, 669, 2791], method: "linear" }),
];

test("figure table is headed by the group labels", () => {
  const table = formatGroupFigureTable(groups);
  expect(table.split("\n").slice(0, 4)).toEqual([
    "| Figure | AI-marked | Unmarked |",
    "|--------|-----------|----------|",
    "| N | 8 | 10 |",
    "| Median | 153 | 300.5 |",
  ]);
});

test("value lines list every value, highlights noted", () => {
  expect(formatGroupValueLines(groups)).toBe(
    "- AI-marked (8): 46 (ours), 54, 68, 134, 172, 206, 333, 562; median 153\n" +
      "- Unmarked (10): 88, 116, 134, 200, 295, 306, 312, 445, 669, 2791; median 300.5\n",
  );
});

test("value lines need values", () => {
  const bare = { ...groups[0], values: undefined };
  expect(() => formatGroupValueLines([bare])).toThrow("has no values");
});

test("the period table names its columns from the periods and prints figures in full", () => {
  const periods = [
    { period: "Pre-AI", metrics: { m: [1.25, 2, 3, 300.5] } },
    { period: "Recent-AI", metrics: { m: [0.004719, 12] } },
  ];
  expect(formatBoxPlotTable(periods, "m").split("\n").slice(0, 4)).toEqual([
    "| Figure | Pre-AI | Recent-AI |",
    "|--------|--------|-----------|",
    "| N | 4 | 2 |",
    "| Median | 2 | 0.00472 |",
  ]);
});

test("bin table: columns from the group labels, rows in first-seen order, - where a group lacks a bin", () => {
  const bin = (label, count) => ({ lo: 0, hi: 1, label, count, share: 0 });
  const table = formatGroupBinTable([
    { label: "A", bins: [bin("1", 3), bin("2-4", 0)] },
    { label: "Longer", bins: [bin("2-4", 12), bin("5+", 1)] },
  ]);
  expect(table).toBe(
    "| Bin | A | Longer |\n|-----|---|--------|\n| 1 | 3 | - |\n| 2-4 | 0 | 12 |\n| 5+ | - | 1 |\n",
  );
});

test("bin table needs bins", () => {
  expect(() => formatGroupBinTable([{ label: "A" }])).toThrow("has no bins");
});

test("the period histogram table drops rows after the last count, keeps empty ones before it", () => {
  const periods = [
    { period: "Pre-AI", metrics: { commits: [{ commits: 1 }, { commits: 7 }] } },
    { period: "Recent-AI", metrics: { commits: [{ commits: 0.5 }, { commits: 3 }] } },
  ];
  expect(formatHistogramTable(periods, "commits").split("\n")).toEqual([
    "| Bin | Pre-AI | Recent-AI |",
    "|-----|--------|-----------|",
    "| 1 | 1 | 0 |",
    "| 2 | 0 | 0 |",
    "| 3-4 | 0 | 1 |",
    "| 5-9 | 1 | 0 |",
    "",
  ]);
});

test("the period histogram table: an hour per row, a period with no values prints -", () => {
  const hours = Array.from({ length: 24 }, (_, h) => (h === 1 ? 5 : 0));
  const periods = [
    { period: "Pre-AI", metrics: { commits_by_hour_of_day: hours, commits: [{ commits: 2 }] } },
    { period: "Recent-AI", metrics: { commits_by_hour_of_day: hours, commits: [] } },
  ];
  expect(formatHistogramTable(periods, "commits_by_hour_of_day").split("\n").slice(2)).toEqual([
    "| 0:00-1:00 | 0 | 0 |",
    "| 1:00-2:00 | 5 | 5 |",
    "",
  ]);
  expect(formatHistogramTable(periods, "commits").split("\n")[3]).toBe("| 2 | 1 | - |");
});
