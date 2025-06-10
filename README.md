# vibe-gain

**Visualize GitHub commit patterns to evaluate AI-assisted coding productivity gains**

vibe-gain helps developers quantify how AI coding tools impact their productivity by analyzing GitHub commit data across different time periods. The project combines robust data collection with interactive visualizations to reveal changes in coding patterns, output consistency, and development rhythm.

## Features

- **Comprehensive Data Collection**: Automatically discovers and analyzes commits across your GitHub repositories
- **Period Comparison**: Compare productivity metrics between different time periods (e.g., pre-AI vs. AI-assisted)
- **Rich Visualizations**: Interactive charts including histograms, box plots, and timeline visualizations
- **Multiple Metrics**: Analyzes commits, lines of code, working hours, commit intervals, and repository activity
- **Smart Repository Handling**: Handles private repositories, forks, and access permissions intelligently
- **Flexible Integration**: Use standalone or integrate into static sites
- **Themeable Interface**: Supports light/dark themes with DaisyUI integration

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/cyberchitta/vibe-gain.git
cd vibe-gain

# Install dependencies
npm install
# or
bun install
```

### 2. Setup GitHub Authentication

Create a `.env` file:

```bash
GITHUB_TOKEN=your_github_personal_access_token
```

[Create a GitHub Personal Access Token](https://github.com/settings/tokens) with repository access.

### 3. Configure Analysis Periods

Create `data/parameters.json`:

```json
{
  "PERIODS": [
    {
      "name": "Pre-AI",
      "start": "2022-06-01",
      "end": "2022-11-30"
    },
    {
      "name": "Recent-AI", 
      "start": "2024-11-01",
      "end": "2025-04-30"
    }
  ],
  "GITHUB_USERNAMES": [
    {
      "username": "your-github-username",
      "timezone_offset_hours": 0,
      "coding_day_start_hour": 4
    }
  ]
}
```

### 4. Collect Data

```bash
# Discover repositories (optional - creates repo lists you can edit)
bun lib/discover-repos.js

# Fetch commit data
npm start
```

### 5. View Results

```bash
# Start local web server
npm run serve

# Open http://localhost:3001 and navigate to your test files
```

## Understanding the Metrics

### Core Productivity Metrics

- **Commits per Day**: Daily commit frequency showing productivity consistency
- **Lines of Code**: Daily code changes indicating development scope
- **Working Hours**: Estimated coding time based on commit timestamps
- **Active Days**: Number of days with commits in each period

### Development Rhythm Metrics

- **Commit Intervals**: Time between consecutive commits revealing development flow
- **Hourly Distribution**: When commits happen throughout the day
- **Repository Activity**: How many different projects you work on

### Visualization Types

- **Strip Plots**: Timeline view showing when commits happen (date vs. time of day)
- **Histograms**: Distribution of metric values with period comparison
- **Box Plots**: Statistical summaries highlighting medians and outliers

## Integration Examples

### Standalone HTML

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/vega@6"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-lite@6"></script>
</head>
<body>
    <div id="chart-container"></div>
    <script type="module">
        import { renderHistogram } from './browser/renderers/histogram.js';
        import { arrayFormatToCommits } from './core/data/formats.js';
        
        // Load and render charts
        async function renderCharts() {
            const response = await fetch('./data/restlessronin/raw/commits_Pre-AI.json');
            const arrayFormat = await response.json();
            const commits = arrayFormatToCommits(arrayFormat);
            
            const periodsData = [{
                period: 'Pre-AI',
                data: commits,
                color: '#ed8936'
            }];
            
            await renderHistogram(container, periodsData, {
                metricId: 'commits',
                width: 400,
                height: 300
            });
        }
    </script>
</body>
</html>
```

## Configuration Reference

### Parameters File Structure

```json
{
  "PERIODS": [
    {
      "name": "Period Name",
      "start": "YYYY-MM-DD", 
      "end": "YYYY-MM-DD"
    }
  ],
  "GITHUB_USERNAMES": [
    {
      "username": "github-username",
      "timezone_offset_hours": 0,     // Your timezone offset from UTC
      "coding_day_start_hour": 4      // When your "coding day" starts (default: 4 AM)
    }
  ],
  "CLUSTER_THRESHOLD_MINUTES": 30    // Optional: commit clustering threshold
}
```

### Chart Configuration

Charts are configured in the browser JavaScript. Key settings:

```javascript
metricConfig: {
  commit_intervals: {
    useLogScale: true,
    tickValues: [1, 5, 15, 60, 240, 1440, 10080],
  },
  commits: {
    useLogScale: true, 
    tickValues: [1, 2, 5, 10, 20, 50],
  }
}
```

## Project Structure

```
vibe-gain/
├── lib/                    # Node.js data collection
│   ├── data/fetch.js      # GitHub API integration
│   ├── discover-repos.js  # Repository discovery
│   └── index.js           # Main CLI tool
├── core/                   # Shared data processing
│   ├── data/viz-data.js   # Metrics calculation
│   └── utils/timezone.js  # Time zone handling
├── browser/                # Web visualization
│   ├── renderers/         # Chart rendering
│   ├── specs/             # Vega specifications  
│   └── themes/            # UI themes
├── test-*.html            # Example integrations
└── package.json
```

## Key Files

- **`lib/index.js`**: Main data collection script
- **`browser/index.js`**: Browser module exports
- **`core/data/viz-data.js`**: Core metrics calculation
- **`test-boxed-overlay.html`**: Example multi-chart layout
- **`test-strip-plot.html`**: Timeline visualization example

## Development

### Running Tests

```bash
npm run serve
# Open test-*.html files in browser
```

### Adding New Metrics

1. Add calculation logic in `core/data/viz-data.js`
2. Add chart configuration in `browser/renderers/`
3. Update chart specs in `browser/specs/`
4. Test with example HTML files

## Real-World Usage

See how vibe-gain is used in production:
- [CyberChitta Productivity Analysis](https://www.cyberchitta.cc/articles/vg-progress.html)
- Example integration patterns in the test HTML files

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

Apache-2.0

## Credits

Developed by [CyberChitta](https://github.com/cyberchitta) to understand the quantitative impact of AI tools on software development productivity.

---

*Want to measure your own AI productivity gains? Star this repo and try vibe-gain with your GitHub data!*
