import { boxFigures } from "../stats/box-figures.js";
import { createNaturalBins, hasNaturalBuckets } from "./bucketing.js";

/**
 * One period's box figures and histogram bins, as the old box plot has
 * always computed them, in the shape the charts take (`BoxGroup`). The
 * binning is kept exactly, quirks included, because published charts draw
 * from it: natural buckets
 * where the metric has them (top bucket ending at twice its start; values
 * below the first bucket dropped), else one bin per integer for at most 50
 * distinct integers, else up to 20 equal bins. New charts use `boxGroup`.
 * @param {{ period: string, values: number[], color: string }} periodData - values non-empty
 * @param {string} [metricId]
 */
export function periodGroup({ period, values, color }, metricId) {
  return {
    label: period,
    color,
    values,
    figures: boxFigures(values),
    bins: periodBins(values, metricId),
  };
}

/**
 * @param {number[]} values - non-empty
 * @param {string} [metricId]
 */
function periodBins(values, metricId) {
  const bins = hasNaturalBuckets(metricId)
    ? naturalBins(values, metricId)
    : shouldUseIntegerBinning(values)
      ? integerBins(values)
      : equalBins(values);
  return bins.filter((b) => b.count > 0).map((b) => ({ ...b, share: b.count / values.length }));
}

function naturalBins(values, metricId) {
  return createNaturalBins(values, metricId).map((b) => ({
    lo: b.binStart,
    hi: b.binEnd,
    label: b.binLabel,
    count: b.count,
  }));
}

function shouldUseIntegerBinning(values, maxIntegerBins = 50) {
  const unique = [...new Set(values)];
  return unique.every((v) => Number.isInteger(v)) && unique.length <= maxIntegerBins;
}

function integerBins(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Array.from({ length: max - min + 1 }, (_, k) => min + k).map((i) => ({
    lo: i - 0.5,
    hi: i + 0.5,
    label: String(i),
    count: values.filter((v) => v === i).length,
  }));
}

function equalBins(values) {
  const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / binCount;
  return Array.from({ length: binCount }, (_, i) => {
    const lo = min + i * width;
    const hi = i === binCount - 1 ? max + 0.001 : min + (i + 1) * width;
    return { lo, hi, label: `${lo}–${hi}`, count: values.filter((v) => v >= lo && v < hi).length };
  });
}
