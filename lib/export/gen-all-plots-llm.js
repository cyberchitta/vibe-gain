import { formatNumber } from "../../core/utils/format.js";
import { arrayFormatToCommits } from "../../core/data/transforms.js";
import { MetricsBuilder } from "../../core/data/metrics-builder.js";
import { extractValues } from "../../core/data/transforms.js";
import { calculateBoxPlotStats } from "../../core/utils/array.js";
import {
  createNaturalBins,
  hasNaturalBuckets,
} from "../../core/data/bucketing.js";
import fs from "fs/promises";
import path from "path";

const ALL_METRICS = [
  "commits",
  "loc",
  "loc_per_commit",
  "files_per_commit",
  "commits_per_hour",
  "loc_per_hour",
  "active_hours_per_day",
  "session_durations",
  "sessions_per_day",
  "commits_per_session",
  "daily_session_minutes",
  "inter_session_gaps",
  "within_session_gaps",
  "loc_per_session",
  "repos",
  "daily_span_minutes",
  "all_commit_intervals",
  "repo_commit_distribution",
];

const userConfig = {
  timezone_offset_hours: 5.5,
  coding_day_start_hour: 4,
};

function calculateHourlyPercentages(hourlyData) {
  if (!Array.isArray(hourlyData) || hourlyData.length !== 24) {
    return [];
  }
  const total = hourlyData.reduce((sum, count) => sum + count, 0);
  if (total === 0) return [];
  return hourlyData.map((count) => (count / total) * 100);
}

function getMetricUnit(metric) {
  const units = {
    commits: "commits/day",
    loc: "lines/day",
    active_hours_per_day: "hours/day",
    commits_per_hour: "commits/hour",
    loc_per_hour: "lines/hour",
    loc_per_commit: "lines/commit",
    files_per_commit: "files/commit",
    commits_by_hour_of_day: "commits (hourly distribution)",
    session_durations: "minutes",
    sessions_per_day: "sessions/day",
    daily_session_minutes: "minutes/day",
    inter_session_gaps: "minutes",
    within_session_gaps: "minutes",
    loc_per_session: "lines/session",
    repos: "repositories/day",
    daily_span_minutes: "minutes/day",
    all_commit_intervals: "minutes",
    repo_commit_distribution: "commits/repository",
  };
  return units[metric] || "";
}

function calculateRepoCommitStats(repoCommitDistribution) {
  if (!repoCommitDistribution || repoCommitDistribution.length === 0) {
    return { total: 0, over10: 0, over40: 0, over100: 0 };
  }
  return {
    total: repoCommitDistribution.length,
    over10: repoCommitDistribution.filter((commits) => commits > 10).length,
    over40: repoCommitDistribution.filter((commits) => commits > 40).length,
    over100: repoCommitDistribution.filter((commits) => commits > 100).length,
  };
}

function generateHistogramStats(data, metricId) {
  if (!hasNaturalBuckets(metricId)) {
    return null;
  }
  const values = extractValues(data, metricId);
  if (!values || values.length === 0) {
    return null;
  }
  const bins = createNaturalBins(values, metricId);
  return bins.map((bin) => ({
    label: bin.binLabel,
    count: bin.count,
    percentage: bin.percentageCount || 0,
    binStart: bin.binStart,
    binEnd: bin.binEnd === Infinity ? bin.binStart * 2 : bin.binEnd,
  }));
}

function generateMetricAnalysis(metricName, allStats, periods) {
  let markdown = `## ${metricName
    .replace(/_/g, " ")
    .toUpperCase()} Analysis\n\n`;
  const unit = getMetricUnit(metricName);
  if (unit) {
    markdown += `*Unit: ${unit}*\n\n`;
  }
  markdown += "### Box Plot Statistics\n\n";
  markdown +=
    "| Period | Min | 5% | 25% | Median | 75% | 95% | Max | Count |\n";
  markdown += "|--------|-----|----|----|--------|----|----|-----|-------|\n";
  for (const period of periods) {
    const stats = allStats[period].boxplot[metricName];
    if (stats) {
      markdown += `| ${period} | ${formatNumber(stats.min)} | ${formatNumber(
        stats.p5
      )} | ${formatNumber(stats.p25)} | ${formatNumber(
        stats.median
      )} | ${formatNumber(stats.p75)} | ${formatNumber(
        stats.p95
      )} | ${formatNumber(stats.max)} | ${stats.count} |\n`;
    } else {
      markdown += `| ${period} | N/A | N/A | N/A | N/A | N/A | N/A | N/A | 0 |\n`;
    }
  }
  const hasHistogramData = periods.some(
    (period) => allStats[period].histograms[metricName]
  );
  if (hasHistogramData) {
    markdown += "\n### Histogram Distribution (Percentage)\n\n";
    const allBins = new Set();
    periods.forEach((period) => {
      if (allStats[period].histograms[metricName]) {
        allStats[period].histograms[metricName].forEach((bin) =>
          allBins.add(bin.label)
        );
      }
    });
    const sortedBins = Array.from(allBins).sort((a, b) => {
      const aData = periods
        .map((p) =>
          allStats[p].histograms[metricName]?.find((bin) => bin.label === a)
        )
        .find((x) => x);
      const bData = periods
        .map((p) =>
          allStats[p].histograms[metricName]?.find((bin) => bin.label === b)
        )
        .find((x) => x);
      return (aData?.binStart || 0) - (bData?.binStart || 0);
    });
    markdown += "| Period |";
    sortedBins.forEach((bin) => {
      markdown += ` ${bin} |`;
    });
    markdown += "\n|--------|";
    sortedBins.forEach(() => {
      markdown += "-----|";
    });
    markdown += "\n";
    for (const period of periods) {
      markdown += `| ${period} |`;
      sortedBins.forEach((binLabel) => {
        const binData = allStats[period].histograms[metricName]?.find(
          (bin) => bin.label === binLabel
        );
        markdown += ` ${binData?.percentage.toFixed(1) || "0.0"}% |`;
      });
      markdown += "\n";
    }
  }
  markdown += "\n";
  return markdown;
}

function generateMarkdownReport(allStats, summaryData, periodConfigs) {
  const periods = ["Pre-AI", "Recent-AI"];
  let markdown = "# Complete Analysis Report\n\n";
  markdown += "## Period Summary\n\n";
  markdown +=
    "| Period | Date Range | Total Days | Active Days | Total Commits | Session Threshold |\n";
  markdown +=
    "|--------|------------|------------|-------------|---------------|-------------------|\n";
  Object.entries(summaryData).forEach(([period, data]) => {
    const config = periodConfigs.find((p) => p.name === period);
    const dateRange = config ? `${config.start} - ${config.end}` : "Unknown";
    const totalDays = config
      ? Math.ceil(
          (new Date(config.end) - new Date(config.start)) /
            (1000 * 60 * 60 * 24)
        ) + 1
      : "N/A";
    markdown += `| ${period} | ${dateRange} | ${totalDays} | ${data.activeDays} | ${data.totalCommits} | ${data.sessionThreshold} min |\n`;
  });
  markdown += "\n## High-Level Productivity Metrics\n\n";
  markdown +=
    "| Period | Commits/Day (Med) | LOC/Day (Med) | Active Hours/Day (Med) | Sessions/Day (Med) |\n";
  markdown +=
    "|--------|-------------------|---------------|------------------------|--------------------|\n";
  Object.entries(summaryData).forEach(([period, data]) => {
    const commitsMedian = data.commitsStats?.median;
    const locMedian = data.locStats?.median;
    const activeHoursMedian = data.activeHoursStats?.median;
    const sessionsMedian = data.sessionsPerDayStats?.median;
    markdown += `| ${period} | ${formatNumber(commitsMedian)} | ${formatNumber(
      locMedian
    )} | ${formatNumber(activeHoursMedian)} | ${formatNumber(
      sessionsMedian
    )} |\n`;
  });
  markdown += "\n## Session Analysis\n\n";
  markdown +=
    "| Period | Session Duration (Med) | Daily Session Time (Med) | Commits/Session (Med) | LOC/Session (Med) |\n";
  markdown +=
    "|--------|------------------------|--------------------------|----------------------|-----------------|\n";
  Object.entries(summaryData).forEach(([period, data]) => {
    const durationMedian = data.sessionDurationsStats?.median;
    const dailySessionMedian = data.dailySessionMinutesStats?.median;
    const commitsPerSessionMedian = data.commitsPerSessionStats?.median;
    const locPerSessionMedian = data.locPerSessionStats?.median;
    markdown += `| ${period} | ${formatNumber(
      durationMedian
    )} min | ${formatNumber(dailySessionMedian)} min | ${formatNumber(
      commitsPerSessionMedian
    )} | ${formatNumber(locPerSessionMedian)} |\n`;
  });
  markdown += "\n## Repository Engagement Analysis\n\n";
  markdown +=
    "| Period | Total Repos | >10 Commits | >40 Commits | >100 Commits | Repos/Day (Med) |\n";
  markdown +=
    "|--------|-------------|-------------|-------------|---------------|----------------|\n";
  Object.entries(summaryData).forEach(([period, data]) => {
    const stats = data.repoStats;
    const reposPerDayMedian = data.reposPerDayStats?.median;
    markdown += `| ${period} | ${stats.total} | ${stats.over10} | ${
      stats.over40
    } | ${stats.over100} | ${formatNumber(reposPerDayMedian)} |\n`;
  });
  markdown += "\n## Time Pattern Analysis\n\n";
  markdown +=
    "| Period | Daily Span (Med) | All Intervals (Med) | Inter-Session Gaps (Med) | Within-Session Gaps (Med) |\n";
  markdown +=
    "|--------|------------------|---------------------|--------------------------|----------------------------|\n";
  Object.entries(summaryData).forEach(([period, data]) => {
    const dailySpanMedian = data.dailySpanStats?.median;
    const allIntervalsMedian = data.allIntervalsStats?.median;
    const interSessionMedian = data.interSessionGapsStats?.median;
    const withinSessionMedian = data.withinSessionGapsStats?.median;
    markdown += `| ${period} | ${formatNumber(
      dailySpanMedian
    )} min | ${formatNumber(allIntervalsMedian)} min | ${formatNumber(
      interSessionMedian
    )} min | ${formatNumber(withinSessionMedian)} min |\n`;
  });
  markdown += "\n## Commit Characteristics\n\n";
  markdown +=
    "| Period | LOC/Commit (Med) | Files/Commit (Med) | Commits/Hour (Med) | LOC/Hour (Med) |\n";
  markdown +=
    "|--------|------------------|--------------------|--------------------|----------------|\n";
  Object.entries(summaryData).forEach(([period, data]) => {
    const locPerCommitMedian = data.locPerCommitStats?.median;
    const filesPerCommitMedian = data.filesPerCommitStats?.median;
    const commitsPerHourMedian = data.commitsPerHourStats?.median;
    const locPerHourMedian = data.locPerHourStats?.median;
    markdown += `| ${period} | ${formatNumber(
      locPerCommitMedian
    )} | ${formatNumber(filesPerCommitMedian)} | ${formatNumber(
      commitsPerHourMedian
    )} | ${formatNumber(locPerHourMedian)} |\n`;
  });
  markdown += "\n## Hourly Commit Distribution (Percentages)\n\n";
  markdown += "| Period |";
  for (let hour = 0; hour < 24; hour++) {
    markdown += ` ${hour}h |`;
  }
  markdown += "\n|--------|";
  for (let hour = 0; hour < 24; hour++) {
    markdown += "-----|";
  }
  markdown += "\n";
  Object.entries(summaryData).forEach(([period, data]) => {
    if (data.hourlyPercentages) {
      markdown += `| ${period} |`;
      data.hourlyPercentages.forEach((percentage) => {
        markdown += ` ${percentage.toFixed(1)}% |`;
      });
      markdown += "\n";
    }
  });
  for (const metric of ALL_METRICS) {
    const hasData = periods.some(
      (period) =>
        allStats[period].boxplot[metric] || allStats[period].histograms[metric]
    );
    if (hasData) {
      markdown += generateMetricAnalysis(metric, allStats, periods);
    }
  }
  return markdown;
}

async function generateAllPlotsReport() {
  const periods = ["Pre-AI", "Recent-AI"];
  const allStats = {};
  const summaryData = {};
  const dataDir = path.join(process.cwd(), "data/restlessronin/raw");
  const parametersPath = path.join(process.cwd(), "data/parameters.json");
  let periodConfigs = [];
  try {
    const parametersContent = await fs.readFile(parametersPath, "utf8");
    const parameters = JSON.parse(parametersContent);
    periodConfigs = parameters.PERIODS || [];
    console.log("Loaded period configurations from parameters.json");
  } catch (error) {
    console.error("Error loading parameters.json:", error);
    periodConfigs = [
      { name: "Pre-AI", start: "2022-06-01", end: "2022-11-30" },
      { name: "Recent-AI", start: "2024-11-01", end: "2025-04-30" },
    ];
  }
  for (const period of periods) {
    console.log(`Processing ${period}...`);
    const filename = `commits_${period.replace(/\s+/g, "_")}.json`;
    const filepath = path.join(dataDir, filename);
    try {
      const fileContent = await fs.readFile(filepath, "utf8");
      const arrayFormat = JSON.parse(fileContent);
      const commits = arrayFormatToCommits(arrayFormat);
      const codeOnlyFilter = (commit) => {
        const isWebsiteDocCommit =
          commit.isDocOnly &&
          commit.repo &&
          commit.repo.endsWith("/www.cyberchitta.cc");
        return !isWebsiteDocCommit;
      };
      const p = periodConfigs.find((p) => p.name === period);
      const builder = MetricsBuilder.forPeriod(
        commits,
        userConfig,
        p.start,
        p.end
      );
      const filteredMetrics = builder.withFilter(codeOnlyFilter).build();
      summaryData[period] = {
        activeDays: filteredMetrics.summary.total_active_days,
        totalCommits: filteredMetrics.summary.total_commits,
        sessionThreshold: filteredMetrics.summary.session_threshold_minutes,
        totalRepos: filteredMetrics.summary.total_repositories,
        repoStats: calculateRepoCommitStats(
          filteredMetrics.repo_commit_distribution
        ),
        hourlyPercentages: calculateHourlyPercentages(
          filteredMetrics.commits_by_hour_of_day
        ),
        commitsStats: filteredMetrics.summary.commits_stats,
        locStats: filteredMetrics.summary.loc_stats,
        activeHoursStats: filteredMetrics.summary.active_hours_per_day_stats,
        locPerCommitStats: filteredMetrics.summary.loc_per_commit_stats,
        filesPerCommitStats: filteredMetrics.summary.files_per_commit_stats,
        commitsPerHourStats: filteredMetrics.summary.commits_per_hour_stats,
        locPerHourStats: filteredMetrics.summary.loc_per_hour_stats,
        sessionDurationsStats: filteredMetrics.summary.session_durations_stats,
        sessionsPerDayStats: filteredMetrics.summary.sessions_per_day_stats,
        commitsPerSessionStats:
          filteredMetrics.summary.commits_per_session_stats,
        dailySessionMinutesStats:
          filteredMetrics.summary.daily_session_minutes_stats,
        locPerSessionStats: filteredMetrics.summary.loc_per_session_stats,
        interSessionGapsStats: filteredMetrics.summary.inter_session_gaps_stats,
        withinSessionGapsStats:
          filteredMetrics.summary.within_session_gaps_stats,
        reposPerDayStats: filteredMetrics.summary.repos_stats,
        dailySpanStats: filteredMetrics.summary.daily_span_minutes_stats,
        allIntervalsStats: filteredMetrics.summary.all_commit_intervals_stats,
        repoCommitDistributionStats:
          filteredMetrics.summary.repo_commit_distribution_stats,
      };
      allStats[period] = { boxplot: {}, histograms: {} };
      for (const metric of ALL_METRICS) {
        const data = filteredMetrics[metric];
        if (data) {
          const values = extractValues(data, metric);
          if (values && values.length > 0) {
            allStats[period].boxplot[metric] = calculateBoxPlotStats(values);
            console.log(`  ${metric} boxplot: ${values.length} values`);
          } else {
            allStats[period].boxplot[metric] = null;
          }
          const histogramStats = generateHistogramStats(data, metric);
          if (histogramStats) {
            allStats[period].histograms[metric] = histogramStats;
            console.log(`  ${metric} histogram: ${histogramStats.length} bins`);
          } else {
            allStats[period].histograms[metric] = null;
          }
        } else {
          console.log(`  ${metric}: No data found`);
          allStats[period].boxplot[metric] = null;
          allStats[period].histograms[metric] = null;
        }
      }
      console.log(`${period} processed: ${commits.length} total commits`);
    } catch (error) {
      console.error(`Error processing ${period}:`, error);
    }
  }
  const markdown = generateMarkdownReport(allStats, summaryData, periodConfigs);
  const outputPath = path.join(
    process.cwd(),
    "data/restlessronin/all-plots-llm.md"
  );
  await fs.writeFile(outputPath, markdown);
  console.log(`\nComplete analysis report written to: ${outputPath}`);
}

generateAllPlotsReport().catch(console.error);
