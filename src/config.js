const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
  throw new Error(
    "Please set GITHUB_TOKEN and GITHUB_USERNAME environment variables."
  );
}

const PERIODS = [
  { name: "Pre-AI", start: "2022-09-07", end: "2022-12-06" },
  { name: "Beginning_AI", start: "2023-02-12", end: "2023-05-11" },
  { name: "Recent_AI", start: "2025-01-01", end: "2025-03-31" },
];

const OUTPUT_DIR = "output";
const DATA_DIR = `${OUTPUT_DIR}/data`;

const CLUSTER_THRESHOLD_MINUTES = 30;
const DEFAULT_BINS = 20;

module.exports = {
  GITHUB_TOKEN,
  GITHUB_USERNAME,
  PERIODS,
  OUTPUT_DIR,
  DATA_DIR,
  CLUSTER_THRESHOLD_MINUTES,
  DEFAULT_BINS,
};
