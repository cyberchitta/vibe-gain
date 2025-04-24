# vibe-gain

Analyze GitHub commit data to compare coding productivity across periods, with interactive histograms for metrics like commits per day and LOC per day. Built for studying AI tool impacts.

## Setup

1. Install Node.js and dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
export GITHUB_TOKEN=your_token
export GITHUB_USERNAME=your_username
```

3. Run:

```bash
npm start
```

## Metrics

- Commits per day
- LOC per day
- Repos per day
- Estimated hours per day
- Time between commit groups
- Commits per hour
- Average time between commits

## Output

- CSVs: Commit data in `output/data`
- Interactive histograms: HTML files in `output` (open in a browser)

## Usage in Blog

Embed histograms via:

```html
<iframe
  src="path/to/output/histograms_Pre_AI.html"
  width="100%"
  height="600px"
></iframe>
```

## License

Apache-2.0 License
