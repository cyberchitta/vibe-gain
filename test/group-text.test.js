import { expect, test } from "bun:test";
import { boxGroup } from "../core/stats/box-group.js";
import { formatGroupFigureTable, formatGroupValueLines } from "../lib/export/group-text.js";
import { formatBoxPlotTable } from "../lib/export/text-formatter.js";

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
