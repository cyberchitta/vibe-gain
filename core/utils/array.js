export function groupBy(array, keyOrFn) {
  return array.reduce((groups, item) => {
    const group = typeof keyOrFn === "function" ? keyOrFn(item) : item[keyOrFn];
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

export function uniq(array) {
  return [...new Set(array)];
}

export function calculateMedian(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
}

export function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return (
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  );
}

export function calculateMAD(values, median) {
  const deviations = values.map((v) => Math.abs(v - median));
  deviations.sort((a, b) => a - b);
  return deviations[Math.floor(deviations.length * 0.5)];
}
