const fs = require("fs").promises;
const path = require("path");

/**
 * Generate HTML for interactive histograms
 * @param {Array} histogramConfigs - Array of histogram configurations
 * @param {string} periodName - Name of the analysis period
 * @returns {string} - HTML content as a string
 */
function generateHTMLContent(histogramConfigs, periodName) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>GitHub Productivity Analysis - ${periodName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-gap: 20px; }
    canvas { width: 100%; height: 200px; }
    button { margin: 10px 0; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@1.2.1/dist/chartjs-plugin-zoom.min.js"></script>
</head>
<body>
  <h1>Productivity Metrics - ${periodName}</h1>
  <button onclick="resetAll()">Reset Zoom</button>
  <div class="grid">
    ${histogramConfigs
      .map((h) => `<canvas id="${h.id}"></canvas>`)
      .concat("<div></div>") // Empty slot for 2x4 grid
      .join("")}
  </div>
  <script>
    const histogramConfigs = ${JSON.stringify(histogramConfigs)};

    function createHistogram(ctx, config) {
      const { title, data, xLabel, range, bins } = config;
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(bin => bin.binLabel),
          datasets: [{
            label: title,
            data: data.map(bin => bin.count),
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          }],
        },
        options: {
          plugins: {
            title: { display: true, text: title },
            zoom: {
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                drag: { enabled: true, backgroundColor: 'rgba(0,0,0,0.1)' },
                mode: 'x',
              },
              pan: { enabled: true, mode: 'x' },
            },
          },
          scales: {
            x: { title: { display: true, text: xLabel } },
            y: { title: { display: true, text: 'Frequency' } },
          },
        },
      });
    }

    const charts = {};
    histogramConfigs.forEach(config => {
      charts[config.id] = createHistogram(
        document.getElementById(config.id).getContext('2d'),
        config
      );
    });

    function resetAll() {
      Object.values(charts).forEach(chart => chart.resetZoom());
    }
  </script>
</body>
</html>`;
}

/**
 * Create HTML file for visualizations
 * @param {Array} histogramConfigs - Array of histogram configurations
 * @param {string} periodName - Name of the period
 * @param {string} outputDir - Output directory path
 * @returns {Promise<string>} - Path to generated HTML file
 */
async function generateInteractiveHistograms(
  histogramConfigs,
  periodName,
  outputDir
) {
  const html = generateHTMLContent(histogramConfigs, periodName);
  const outputPath = path.join(
    outputDir,
    `histograms_${periodName.replace(/ /g, "_")}.html`
  );
  await fs.writeFile(outputPath, html);
  console.log(`Saved histograms to ${outputPath}`);
  return outputPath;
}

module.exports = {
  generateHTMLContent,
  generateInteractiveHistograms,
};
