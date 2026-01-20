import { calculateBoxPlotStats } from "../../core/utils/array.js";
import { extractValues } from "../../core/data/transforms.js";
import {
  createNaturalBins,
  hasNaturalBuckets,
} from "../../core/data/bucketing.js";

export function formatBoxPlotTable(periodsData, metricId) {
  const rows = [
    "| Metric | Pre-AI | Recent-AI |",
    "|--------|--------|-----------|",
  ];
  const statsPerPeriod = periodsData.map(({ period, metrics }) => {
    const values = extractValues(metrics[metricId], metricId);
    return { period, stats: calculateBoxPlotStats(values) };
  });
  const fields = [
    { label: "Median", key: "median" },
    { label: "Min", key: "min" },
    { label: "Max", key: "max" },
    { label: "Q1", key: "p25" },
    { label: "Q3", key: "p75" },
    { label: "P5", key: "p5" },
    { label: "P95", key: "p95" },
  ];
  fields.forEach(({ label, key }) => {
    const values = statsPerPeriod
      .map(({ stats }) => formatValue(stats[key]))
      .join(" | ");
    rows.push(`| ${label} | ${values} |`);
  });
  return rows.join("\n") + "\n";
}

export function formatHistogramTable(periodsData, metricId) {
  const rows = ["| Bin | Pre-AI | Recent-AI |", "|-----|--------|-----------|"];
  const binsPerPeriod = periodsData.map(({ period, metrics }) => {
    const metricData = metrics[metricId];
    if (metricId === "commits_by_hour_of_day") {
      const total = metricData.reduce((a, b) => a + b, 0);
      return {
        period,
        bins: metricData.map((count, hour) => ({
          label: `${hour}:00-${hour + 1}:00`,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
        })),
      };
    }
    const values = extractValues(metricData, metricId);
    const naturalBins = hasNaturalBuckets(metricId)
      ? createNaturalBins(values, metricId)
      : [];
    return { period, bins: naturalBins };
  });
  const allBinLabels = new Set();
  binsPerPeriod.forEach(({ bins }) => {
    bins.forEach((b) => allBinLabels.add(b.binLabel || b.label));
  });
  const binLabelsArray = Array.from(allBinLabels);
  let lastNonZeroIndex = -1;
  binLabelsArray.forEach((label, index) => {
    const hasData = binsPerPeriod.some(({ bins }) => {
      const bin = bins.find((b) => (b.binLabel || b.label) === label);
      return bin && (bin.count > 0 || bin.percentage > 0);
    });
    if (hasData) {
      lastNonZeroIndex = index;
    }
  });
  binLabelsArray.slice(0, lastNonZeroIndex + 1).forEach((label) => {
    const values = binsPerPeriod.map(({ bins }) => {
      const bin = bins.find((b) => (b.binLabel || b.label) === label);
      return bin ? formatValue(bin.count || bin.percentage) : "-";
    });
    rows.push(`| ${label} | ${values.join(" | ")} |`);
  });
  return rows.join("\n") + "\n";
}

export function formatSessionDiagnostics(periodsData) {
  const rows = [
    "| Metric | Pre-AI | Recent-AI |",
    "|--------|--------|-----------|",
  ];
  const diagnostics = periodsData.map(({ period, metrics }) => {
    const analysis = metrics.summary?.session_threshold_analysis || {};
    return { period, analysis };
  });
  const fields = [
    { label: "Threshold (min)", key: "threshold" },
    { label: "Method", key: "method" },
    { label: "Confidence", key: "confidence" },
  ];
  fields.forEach(({ label, key }) => {
    const values = diagnostics
      .map(({ analysis }) => analysis[key] || "-")
      .join(" | ");
    rows.push(`| ${label} | ${values} |`);
  });
  return rows.join("\n") + "\n";
}

function formatValue(val) {
  if (val === null || val === undefined) return "-";
  if (typeof val === "number") return val.toFixed(2);
  return String(val);
}
