import { expect, test } from "bun:test";
import { boxGroup } from "../core/stats/box-group.js";
import { binFrom, halfOctaveBuckets } from "../core/stats/bins.js";
import {
  formatGroupBinTable,
  formatGroupFigureTable,
  formatGroupRowTable,
  formatGroupValueLines,
} from "../lib/export/group-text.js";
import { formatBoxPlotTable, formatHistogramTable, formatSessionDiagnostics } from "../lib/export/text-formatter.js";

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

test("row table puts one group per row, n, median, p95 and max by default", () => {
  expect(formatGroupRowTable(groups)).toBe(
    "| Group | N | Median | P95 | Max |\n" +
      "|-------|---|--------|-----|-----|\n" +
      "| AI-marked | 8 | 153 | 481.85 | 562 |\n" +
      "| Unmarked | 10 | 300.5 | 1836.1 | 2791 |\n",
  );
});

test("row table lays out the caller's columns in order, figures and computed cells alike", () => {
  const table = formatGroupRowTable(groups, String, {
    first: "Series",
    columns: [
      { name: "Kind", value: (g, i) => `${g.label[0]}${i}` },
      { name: "Q1", figure: "q1" },
    ],
  });
  expect(table.split("\n").slice(0, 3)).toEqual([
    "| Series | Kind | Q1 |",
    "|--------|------|----|",
    `| AI-marked | A0 | ${groups[0].figures.q1} |`,
  ]);
});

// www.cyberchitta.cc's vg-figure seriesTable, as it was before it moved here:
// it prints raw figures, separates with "---", and computes "% below" itself.
function wwwSeriesTable(series, labels, floor, note) {
  const row = (cells) => `| ${cells.join(" | ")} |`;
  const head = ["Series", "Group", "n", "Median", "95th percentile", "Longest", `% ${note}`];
  const rows = series.map((s, i) => {
    const f = groups[i].figures;
    const below = `${Math.round((100 * s.values.filter((v) => v < floor).length) / s.values.length)}%`;
    return row([s.id, labels.get(s.group) ?? s.group, f.n, f.median, f.p95, f.max, below]);
  });
  return [row(head), row(head.map(() => "---")), ...rows];
}

test("row table reproduces www's series table, separator aside", () => {
  const series = [
    { id: "AI-marked", group: "ai", values: groups[0].values ?? [] },
    { id: "Unmarked", group: "plain", values: groups[1].values ?? [] },
  ];
  const labels = new Map([["ai", "Agent"]]);
  const floor = 96;
  const lines = formatGroupRowTable(groups, String, {
    first: "Series",
    columns: [
      { name: "Group", value: (_, i) => labels.get(series[i].group) ?? series[i].group },
      { name: "n", figure: "n" },
      { name: "Median", figure: "median" },
      { name: "95th percentile", figure: "p95" },
      { name: "Longest", figure: "max" },
      {
        name: "% under 96",
        value: (_, i) => `${Math.round(100 * binFrom(series[i].values, halfOctaveBuckets(3072), floor).below)}%`,
      },
    ],
  }).split("\n");
  const www = wwwSeriesTable(series, labels, floor, "under 96");
  expect([lines[0], ...lines.slice(2, -1)]).toEqual([www[0], ...www.slice(2)]);
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

test("session diagnostics name their columns from the periods", () => {
  const period = (name, threshold) => ({
    period: name,
    metrics: { summary: { session_threshold_analysis: { threshold, method: "gap", confidence: "high" } } },
  });
  const old = formatSessionDiagnostics([period("Pre-AI", 45), period("Recent-AI", 30)]);
  expect(old.split("\n").slice(0, 2)).toEqual(["| Metric | Pre-AI | Recent-AI |", "|--------|--------|-----------|"]);
  const three = formatSessionDiagnostics([period("A", 1), period("Bee", 2), period("C", 3)]);
  expect(three.split("\n")[0]).toBe("| Metric | A | Bee | C |");
  expect(three.split("\n")[2]).toBe("| Threshold (min) | 1 | 2 | 3 |");
});
