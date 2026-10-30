import { boxFigures } from "../../core/stats/box-figures.js";
import { extractValues } from "../../core/data/transforms.js";
import { formatGroupBinTable, formatGroupFigureTable } from "./group-text.js";
import { periodHistogramBins } from "../../core/data/period-bins.js";

/**
 * The text form of a period box plot: one column per period, named from it,
 * one row per figure, printed in full.
 * @param {Array} periodsData - {period, metrics} each
 * @param {string} metricId
 * @returns {string}
 */
export function formatBoxPlotTable(periodsData, metricId) {
  return formatGroupFigureTable(
    periodsData.map(({ period, metrics }) => ({
      label: period,
      color: "",
      figures: boxFigures(extractValues(metrics[metricId], metricId)),
    })),
  );
}

/**
 * The text form of a period histogram: one column per period, named from it,
 * one row per bin, counts printed in full. Rows after the last bin with a
 * count in any period are dropped; a period with no values prints "-".
 * @param {Array} periodsData - {period, metrics} each
 * @param {string} metricId
 * @returns {string}
 */
export function formatHistogramTable(periodsData, metricId) {
  const groups = periodsData.map(({ period, metrics }) => ({
    label: period,
    bins: periodHistogramBins(metrics[metricId], metricId),
  }));
  return formatGroupBinTable(trimTrailingEmpty(groups));
}

function trimTrailingEmpty(groups) {
  const labels = [...new Set(groups.flatMap((g) => g.bins.map((b) => b.label)))];
  const last = labels.findLastIndex((label) =>
    groups.some((g) => g.bins.some((b) => b.label === label && b.count > 0)),
  );
  const keep = new Set(labels.slice(0, last + 1));
  return groups.map((g) => ({ ...g, bins: g.bins.filter((b) => keep.has(b.label)) }));
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
