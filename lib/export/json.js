/**
 * Format metrics data for export
 * @param {Object} metrics - Metrics object
 * @param {string} periodName - Name of the period
 * @returns {Object} - Formatted data for export
 */
function formatMetricsForExport(metrics, periodName) {
  return {
    period_name: periodName,
    generated_at: new Date().toISOString(),
    metrics,
  };
}

/**
 * Export metrics data as JSON
 * @param {Object} metrics - Metrics object
 * @param {string} periodName - Name of the period
 * @param {string} outputDir - Output directory
 * @returns {Promise<string>} - Path to the exported file
 */
async function exportMetricsJSON(metrics, periodName, outputDir) {
  const exportData = formatMetricsForExport(metrics, periodName);
  const outputPath = path.join(
    outputDir,
    `metrics_${periodName.replace(/ /g, "_")}.json`
  );
  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Saved metrics JSON to ${outputPath}`);
  return outputPath;
}
