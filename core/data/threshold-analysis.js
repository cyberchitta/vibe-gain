import { calculateVariance, calculateMAD } from "../utils/array.js";
import { extractBasicCommitIntervals } from "./sessions.js";

export function determineSessionThreshold(commits, tzConfig) {
  const intervals = extractBasicCommitIntervals(commits, tzConfig);
  if (intervals.length === 0) {
    return { threshold: 45, method: "default", analysis: null };
  }
  const thresholdAnalysis = new ThresholdAnalysisBuilder(
    intervals.map((i) => i.interval_minutes)
  ).build();
  return thresholdAnalysis.getAnalysisResult();
}

export class ThresholdAnalysisBuilder {
  constructor(intervalMinutes) {
    this.rawValues = Object.freeze([...intervalMinutes]);
    this.sortedValues = Object.freeze(
      [...intervalMinutes].sort((a, b) => a - b)
    );
    Object.freeze(this);
  }

  build() {
    const stats = this._computeStats();
    const filteredSets = this._computeFilteredSets();
    const mad = calculateMAD(this.rawValues, stats.median);
    return new ThresholdAnalysis(stats, filteredSets, mad);
  }

  _computeStats() {
    const sorted = this.sortedValues;
    const n = sorted.length;
    return Object.freeze({
      count: n,
      min: sorted[0],
      max: sorted[n - 1],
      median: sorted[Math.floor(n * 0.5)],
      p25: sorted[Math.floor(n * 0.25)],
      p75: sorted[Math.floor(n * 0.75)],
      p90: sorted[Math.floor(n * 0.9)],
      p95: sorted[Math.floor(n * 0.95)],
      variance: calculateVariance(this.rawValues),
    });
  }

  _computeFilteredSets() {
    return Object.freeze({
      relevant: Object.freeze(
        this.sortedValues.filter((v) => v >= 5 && v <= 180)
      ),
      positive: Object.freeze(this.sortedValues.filter((v) => v > 0)),
      logValues: Object.freeze(
        this.sortedValues.filter((v) => v > 0).map((v) => Math.log10(v))
      ),
    });
  }
}

export class ThresholdAnalysis {
  constructor(stats, filteredSets, mad) {
    this.stats = stats;
    this.filteredSets = filteredSets;
    this.mad = mad;
    Object.freeze(this);
  }

  findJenksBreak() {
    const relevantValues = this.filteredSets.relevant;
    if (relevantValues.length < 5) return null;
    const candidates = [];
    const step =
      (Math.max(...relevantValues) - Math.min(...relevantValues)) / 20;
    for (let breakPoint = 15; breakPoint <= 120; breakPoint += step) {
      const lowerGroup = relevantValues.filter((v) => v <= breakPoint);
      const upperGroup = relevantValues.filter((v) => v > breakPoint);
      if (lowerGroup.length < 3 || upperGroup.length < 3) continue;
      const lowerVariance = calculateVariance(lowerGroup);
      const upperVariance = calculateVariance(upperGroup);
      const totalVariance = this.stats.variance;
      const gvf =
        (totalVariance - (lowerVariance + upperVariance)) / totalVariance;
      candidates.push({
        breakPoint,
        gvf,
        lowerCount: lowerGroup.length,
        upperCount: upperGroup.length,
      });
    }
    candidates.sort((a, b) => b.gvf - a.gvf);
    return candidates.length > 0 ? candidates[0].breakPoint : null;
  }

  findElbowPoint() {
    if (this.stats.count < 10) return null;
    const logValues = this.filteredSets.logValues;
    const uniqueLogValues = [...new Set(logValues)].sort((a, b) => a - b);
    const curvature = [];
    for (let i = 1; i < uniqueLogValues.length - 1; i++) {
      const x1 = uniqueLogValues[i - 1];
      const x2 = uniqueLogValues[i];
      const x3 = uniqueLogValues[i + 1];
      const y1 = logValues.filter((v) => v <= x1).length / logValues.length;
      const y2 = logValues.filter((v) => v <= x2).length / logValues.length;
      const y3 = logValues.filter((v) => v <= x3).length / logValues.length;
      const curve = Math.abs(y3 - y2 - (y2 - y1));
      curvature.push({ value: Math.pow(10, x2), curvature: curve });
    }
    const reasonableCurvature = curvature.filter(
      (c) => c.value >= 10 && c.value <= 120
    );
    if (reasonableCurvature.length === 0) return null;
    reasonableCurvature.sort((a, b) => b.curvature - a.curvature);
    return reasonableCurvature[0].value;
  }

  findLargestGap() {
    const relevant = this.filteredSets.relevant;
    if (relevant.length < 3) return null;
    const gaps = [];
    for (let i = 1; i < relevant.length; i++) {
      const gap = relevant[i] - relevant[i - 1];
      const proportionalGap = gap / relevant[i - 1];
      if (relevant[i - 1] >= 10 && relevant[i] <= 120 && gap >= 5) {
        gaps.push({
          beforeGap: relevant[i - 1],
          afterGap: relevant[i],
          gap: gap,
          proportionalGap: proportionalGap,
          threshold: (relevant[i - 1] + relevant[i]) / 2,
        });
      }
    }
    if (gaps.length === 0) return null;
    gaps.sort((a, b) => b.proportionalGap - a.proportionalGap);
    return gaps[0].threshold;
  }

  findOutlierThreshold() {
    if (this.stats.count < 10) return null;
    if (this.mad === 0) return null;
    const threshold = this.stats.median + 2.5 * this.mad * 1.4826;
    return Math.max(15, Math.min(120, threshold));
  }

  findBimodalSplit() {
    if (this.stats.count < 20) return null;
    const logValues = this.filteredSets.logValues;
    const minLog = Math.min(...logValues);
    const maxLog = Math.max(...logValues);
    const binCount = Math.min(20, Math.floor(this.stats.count / 5));
    const binWidth = (maxLog - minLog) / binCount;
    const histogram = new Array(binCount).fill(0);
    logValues.forEach((logVal) => {
      const binIndex = Math.min(
        binCount - 1,
        Math.floor((logVal - minLog) / binWidth)
      );
      histogram[binIndex]++;
    });
    const smoothed = this._smoothHistogram(histogram);
    const valleys = [];
    for (let i = 1; i < smoothed.length - 1; i++) {
      if (smoothed[i] < smoothed[i - 1] && smoothed[i] < smoothed[i + 1]) {
        const logValue = minLog + (i + 0.5) * binWidth;
        const value = Math.pow(10, logValue);
        if (value >= 15 && value <= 120) {
          valleys.push({ index: i, value: value, depth: smoothed[i] });
        }
      }
    }
    if (valleys.length === 0) return null;
    valleys.sort((a, b) => a.depth - b.depth);
    return valleys[0].value;
  }

  _smoothHistogram(histogram, windowSize = 3) {
    const smoothed = [...histogram];
    const halfWindow = Math.floor(windowSize / 2);
    for (let i = halfWindow; i < histogram.length - halfWindow; i++) {
      let sum = 0;
      for (let j = -halfWindow; j <= halfWindow; j++) {
        sum += histogram[i + j];
      }
      smoothed[i] = sum / windowSize;
    }
    return smoothed;
  }

  selectOptimalThreshold() {
    const candidates = [
      { method: "jenks", value: this.findJenksBreak(), weight: 0.25 },
      { method: "elbow", value: this.findElbowPoint(), weight: 0.25 },
      { method: "gap", value: this.findLargestGap(), weight: 0.2 },
      { method: "outlier", value: this.findOutlierThreshold(), weight: 0.15 },
      { method: "bimodal", value: this.findBimodalSplit(), weight: 0.15 },
    ].filter((c) => c.value !== null && c.value >= 15 && c.value <= 120);
    if (candidates.length === 0) {
      return {
        value: Math.max(
          30,
          Math.min(90, Math.sqrt(this.stats.p75 * this.stats.p90))
        ),
        method: "percentile_fallback",
        confidence: "low",
      };
    }
    const weightedSum = candidates.reduce(
      (sum, c) => sum + c.value * c.weight,
      0
    );
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    const consensus = weightedSum / totalWeight;
    const variance =
      candidates.reduce((sum, c) => sum + Math.pow(c.value - consensus, 2), 0) /
      candidates.length;
    const stdDev = Math.sqrt(variance);
    const confidence = stdDev < 10 ? "high" : stdDev < 20 ? "medium" : "low";
    return {
      value: Math.round(consensus),
      method: `consensus_of_${candidates.length}`,
      confidence: confidence,
      agreement: candidates.map((c) => ({
        method: c.method,
        value: Math.round(c.value),
      })),
    };
  }

  getAnalysisResult() {
    const analysis = Object.freeze({
      jenks: this.findJenksBreak(),
      elbow: this.findElbowPoint(),
      gap: this.findLargestGap(),
      outlier: this.findOutlierThreshold(),
      bimodal: this.findBimodalSplit(),
      dataStats: this.stats,
    });
    const recommendedThreshold = this.selectOptimalThreshold();
    return Object.freeze({
      threshold: recommendedThreshold.value,
      method: recommendedThreshold.method,
      confidence: recommendedThreshold.confidence,
      analysis: analysis,
    });
  }
}
