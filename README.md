# vibe-gain

**Visualize GitHub commit patterns to evaluate AI-assisted coding productivity gains**

vibe-gain helps developers quantify how AI coding tools impact their productivity by analyzing GitHub commit data across different time periods. The project combines robust data collection with interactive visualizations to reveal changes in coding patterns, output consistency, and development rhythm.

> **Note**: This project was developed through extensive vibe-coding sessions with Claude Sonnets 3.7 and 4, using the [LLM Context](https://github.com/cyberchitta/llm-context.py) tool to share code during development. The codebase represents a collaborative effort with light human curation by [@restlessronin](https://github.com/restlessronin) - a fitting example of the AI productivity gains that vibe-gain is designed to measure.

## Features

- **Comprehensive Data Collection**: Automatically discovers and analyzes commits across your GitHub repositories
- **Period Comparison**: Compare productivity metrics between different time periods (e.g., pre-AI vs. AI-assisted)
- **Rich Visualizations**: Interactive charts including histograms, box plots, and timeline visualizations
- **Multiple Metrics**: Analyzes commits, lines of code, sessions, commit intervals, and repository activity
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
bun start
```

### 5. View Results

```bash
# Start local web server
bun run serve

# Navigate to test file
open http://localhost:3001/test-all.html
```

## Understanding the Metrics

### Design Philosophy: Daily/Session Focus

Vibe-gain emphasizes **daily and session-level metrics** rather than weekly or monthly aggregations. This granular approach serves multiple use cases:

**Part-time/Pro-bono Developers** (original use case):

- Daily patterns matter more than weekly totals with irregular schedules
- Session intensity and flow are key productivity indicators in limited time windows
- Small coding sessions require optimization at the granular level

**All Developers**:

- Session metrics reveal flow states and interruption patterns
- Session-based analysis accommodates any programming schedule
- Fine-grained metrics provide insights regardless of total time investment
- Individual session optimization benefits everyone

### Core Productivity Metrics

- **Commits per Day**: Daily commit frequency showing productivity consistency
- **Lines of Code**: Daily code changes indicating development scope
- **Working Hours**: Estimated coding time based on commit timestamps
- **Active Days**: Number of days with commits in each period

### Development Rhythm Metrics

- **Commit Intervals**: Time between consecutive commits revealing development flow
- **Hourly Distribution**: When commits happen throughout the day
- **Repository Activity**: How many different projects you work on

### Session Metrics & Time Measurement

#### Session Detection & Metrics

**Session Threshold**: Automatically determined using statistical analysis of commit intervals (typically 30-60 minutes). Commits closer together belong to the same session.

**Key Session Metrics**:

- `sessions_per_day`: Number of distinct coding sessions per active day
- `session_durations`: Length of individual sessions in minutes (first commit to last commit)
- `session_time`: Total focused coding time in minutes (sum of all session durations)
- `intra_session_intervals`: Time between commits within the same session (minutes)

#### Time Measurement Nuances

**Two Time Perspectives**:

1. **`coding_time`**: Total engagement time (first to last commit of the day)
2. **`session_time`**: Focused work time (sum of individual session durations)

The difference reveals time spent on breaks, context switching, and planning between sessions.

**Session Duration Limitations**:
Session durations (first-to-last commit) underestimate actual work time because they don't include:

- Pre-work time (thinking, reading, setup before first commit)
- Post-work time (testing, cleanup after last commit)

_Estimated correction_: Add the median intra-session interval to account for unmeasured work time per session. This correction becomes more statistically valid when aggregating across many sessions.

### Visualization Types

- **Strip Plots**: Timeline view showing when commits happen (date vs. time of day)
- **Histograms**: Distribution of metric values with period comparison
- **Box Plots**: Statistical summaries highlighting medians and outliers

## Integration Examples

### Complete Working Example

See **`test-all.html`** for a full working example that demonstrates:

- All chart types (box plots, histograms, strip plots)
- Complete metrics dashboard with summary table
- Session analysis and diagnostics
- Interactive controls and theming
- Real data loading and processing

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
      import { renderHistogram } from "./browser/renderers/histogram.js";
      import { arrayFormatToCommits } from "./core/data/formats.js";

      // Load and render charts
      async function renderCharts() {
        const response = await fetch(
          "./data/restlessronin/raw/commits_Pre-AI.json"
        );
        const arrayFormat = await response.json();
        const commits = arrayFormatToCommits(arrayFormat);

        const periodsData = [
          {
            period: "Pre-AI",
            data: commits,
            color: "#ed8936",
          },
        ];

        await renderHistogram(container, periodsData, {
          metricId: "commits",
          width: 400,
          height: 300,
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
      "timezone_offset_hours": 0, // Your timezone offset from UTC
      "coding_day_start_hour": 4 // When your "coding day" starts (default: 4 AM)
    }
  ],
  "CLUSTER_THRESHOLD_MINUTES": 30 // Optional: commit clustering threshold
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
│   ├── api/
│   │   ├── github.js      # GitHub API client
│   │   └── queries.js     # Repository discovery queries
│   ├── data/fetch.js      # GitHub API integration
│   ├── export/json.js     # Data export utilities
│   ├── utils/diagnostics.js # Diagnostics and logging
│   ├── discover-repos.js  # Repository discovery
│   ├── config.js          # Configuration management
│   └── index.js           # Main CLI tool
├── core/                   # Shared data processing
│   ├── data/
│   │   ├── bucketing.js   # Natural bucket definitions
│   │   ├── formats.js     # Data format conversions
│   │   ├── sessions.js    # Session analysis (excluded)
│   │   ├── session-thresholds.js # Session threshold detection (excluded)
│   │   ├── strip-plot.js  # Strip plot data preparation
│   │   └── viz-data.js    # Metrics calculation
│   └── utils/
│       ├── array.js       # Array utilities (excluded)
│       ├── date.js        # Date utilities
│       └── timezone.js    # Time zone handling
├── browser/                # Web visualization
│   ├── charts/
│   │   └── commit-strip-plot.js # Strip plot utilities
│   ├── renderers/         # Chart rendering
│   │   ├── box-plot.js
│   │   ├── commit-strip-plot.js
│   │   └── histogram.js
│   ├── specs/             # Vega specifications
│   │   ├── box-plot.js
│   │   ├── commit-strip-plot.js
│   │   ├── histogram.js
│   │   └── vega-base.js
│   ├── themes/            # UI themes
│   │   └── daisyui.js
│   └── index.js           # Browser module exports
├── test-*.html            # Example integrations
├── package.json
└── README.md
```

## Key Files

- **`lib/index.js`**: Main data collection script
- **`browser/index.js`**: Browser module exports
- **`core/data/viz-data.js`**: Core metrics calculation
- **`test-all.html`**: Complete working example with all chart types and metrics

## Development

### Running Tests

```bash
bun run serve
# Open http://localhost:3001/test-all.html for complete example
```

### Adding New Metrics

1. Add calculation logic in `core/data/viz-data.js`
2. Add chart configuration in `browser/renderers/`
3. Update chart specs in `browser/specs/`
4. Test with example HTML files

## Real-World Usage

See how vibe-gain is used in production:
- [CyberChitta Productivity Analysis](https://www.cyberchitta.cc/articles/os-vibe-gains.html)
- Complete example in `test-all.html`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

Apache-2.0

## Credits

Developed by [CyberChitta](https://github.com/cyberchitta) to understand the quantitative impact of AI tools on software development productivity.
