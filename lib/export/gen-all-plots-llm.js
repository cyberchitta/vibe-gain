import { formatNumber } from "../../core/utils/format.js";
import { createNodePeriodDataManager } from "../../core/data/pdm-node.js";
import {
  formatBoxPlotTable,
  formatHistogramTable,
  formatSessionDiagnostics,
} from "./text-formatter.js";
import fs from "fs/promises";
import path from "path";

function getTzConfig(userConfig, periodName, timeMode = "local") {
  if (timeMode === "local") {
    return {
      offsetHours: userConfig.timezone_offset_hours || 0,
      boundaryHour: userConfig.day_boundary ?? userConfig.day_boundary_utc,
    };
  } else {
    return {
      offsetHours: 0,
      boundaryHour:
        userConfig.period_day_boundaries?.[periodName] ??
        userConfig.day_boundary_utc,
    };
  }
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

function calculateHourlyPercentages(hourlyData) {
  if (!Array.isArray(hourlyData) || hourlyData.length !== 24) {
    return [];
  }
  const total = hourlyData.reduce((sum, count) => sum + count, 0);
  if (total === 0) return [];
  return hourlyData.map((count) => (count / total) * 100);
}

function generatePeriodSummaryTable(summaryData, periodConfigs, periods) {
  const rows = [
    "| Period | Date Range | Total Days | Active Days | Total Commits | Session Threshold |",
    "|--------|------------|------------|-------------|---------------|-------------------|",
  ];
  periods.forEach((period) => {
    const data = summaryData[period];
    const config = periodConfigs.find((p) => p.name === period);
    const dateRange = config ? `${config.start} - ${config.end}` : "Unknown";
    const totalDays = config
      ? Math.ceil(
          (new Date(config.end) - new Date(config.start)) /
            (1000 * 60 * 60 * 24)
        ) + 1
      : "N/A";
    rows.push(
      `| ${period} | ${dateRange} | ${totalDays} | ${data.activeDays} | ${data.totalCommits} | ${data.sessionThreshold} min |`
    );
  });
  return `## Productivity Summary\n\n${rows.join("\n")}\n`;
}

function generateHighLevelMetricsTable(summaryData, periods) {
  const rows = [
    "| Period | Commits/Day (Med) | LOC/Day (Med) | Active Hours/Day (Med) | Sessions/Day (Med) |",
    "|--------|-------------------|---------------|------------------------|-------------------|",
  ];
  periods.forEach((period) => {
    const data = summaryData[period];
    rows.push(
      `| ${period} | ${formatNumber(
        data.commitsStats?.median
      )} | ${formatNumber(data.locStats?.median)} | ${formatNumber(
        data.activeHoursStats?.median
      )} | ${formatNumber(data.sessionsPerDayStats?.median)} |`
    );
  });
  return rows.join("\n");
}

function generateSessionMetricsTable(summaryData, periods) {
  const rows = [
    "| Period | Session Duration (Med) | Daily Session Time (Med) | Commits/Session (Med) | LOC/Session (Med) |",
    "|--------|------------------------|--------------------------|----------------------|------------------|",
  ];
  periods.forEach((period) => {
    const data = summaryData[period];
    rows.push(
      `| ${period} | ${formatNumber(
        data.sessionDurationsStats?.median
      )} min | ${formatNumber(
        data.dailySessionMinutesStats?.median
      )} min | ${formatNumber(
        data.commitsPerSessionStats?.median
      )} | ${formatNumber(data.locPerSessionStats?.median)} |`
    );
  });
  return rows.join("\n");
}

function generateRepositoryEngagementTable(summaryData, periods) {
  const rows = [
    "| Period | Total Repos | >10 Commits | >40 Commits | >100 Commits | Repos/Day (Med) |",
    "|--------|-------------|-------------|-------------|--------------|-----------------|",
  ];
  periods.forEach((period) => {
    const data = summaryData[period];
    const stats = data.repoStats;
    rows.push(
      `| ${period} | ${stats.total} | ${stats.over10} | ${stats.over40} | ${
        stats.over100
      } | ${formatNumber(data.reposPerDayStats?.median)} |`
    );
  });
  return rows.join("\n");
}

function generateTimePatternTable(summaryData, periods) {
  const rows = [
    "| Period | Daily Span (Med) | All Intervals (Med) | Inter-Session Gaps (Med) | Within-Session Gaps (Med) |",
    "|--------|------------------|---------------------|--------------------------|---------------------------|",
  ];
  periods.forEach((period) => {
    const data = summaryData[period];
    rows.push(
      `| ${period} | ${formatNumber(
        data.dailySpanStats?.median
      )} min | ${formatNumber(
        data.allIntervalsStats?.median
      )} min | ${formatNumber(
        data.interSessionGapsStats?.median
      )} min | ${formatNumber(data.withinSessionGapsStats?.median)} min |`
    );
  });
  return rows.join("\n");
}

function generateCommitCharacteristicsTable(summaryData, periods) {
  const rows = [
    "| Period | LOC/Commit (Med) | Files/Commit (Med) | Commits/Hour (Med) | LOC/Hour (Med) |",
    "|--------|------------------|--------------------|--------------------|----------------|",
  ];
  periods.forEach((period) => {
    const data = summaryData[period];
    rows.push(
      `| ${period} | ${formatNumber(
        data.locPerCommitStats?.median
      )} | ${formatNumber(data.filesPerCommitStats?.median)} | ${formatNumber(
        data.commitsPerHourStats?.median
      )} | ${formatNumber(data.locPerHourStats?.median)} |`
    );
  });
  return rows.join("\n");
}

function generateHourlyDistributionTable(summaryData, periods) {
  const rows = ["| Period |"];
  for (let hour = 0; hour < 24; hour++) {
    rows[0] += ` ${hour}h |`;
  }
  rows.push("|--------|" + "---|".repeat(24));
  periods.forEach((period) => {
    const data = summaryData[period];
    let row = `| ${period} |`;
    if (data.hourlyPercentages) {
      data.hourlyPercentages.forEach((percentage) => {
        row += ` ${percentage.toFixed(1)}% |`;
      });
    }
    rows.push(row);
  });
  return rows.join("\n");
}

function generateMarkdownReport(periodsData, summaryData, periodConfigs) {
  const periods = ["Pre-AI", "Recent-AI"];
  let markdown = "# Complete Analysis Report\n\n";
  markdown += generatePeriodSummaryTable(summaryData, periodConfigs, periods);
  markdown += "\n";
  markdown += "## High-Level Productivity Metrics\n\n";
  markdown += generateHighLevelMetricsTable(summaryData, periods);
  markdown += "\n\n";
  markdown += "## Temporal Patterns\n\n";
  markdown += formatHistogramTable(
    periodsData,
    "Commits by Hour of Day",
    "commits_by_hour_of_day"
  );
  markdown += "\n";
  markdown += "## Repository Analysis\n\n";
  markdown += formatBoxPlotTable(periodsData, "Repository Activity", "repos");
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Repository Commit Distribution",
    "repo_commit_distribution"
  );
  markdown += "\n";
  markdown += generateRepositoryEngagementTable(summaryData, periods);
  markdown += "\n\n";
  markdown += "## Daily Productivity Patterns\n\n";
  markdown += formatBoxPlotTable(periodsData, "Commits per Day", "commits");
  markdown += "\n";
  markdown += formatBoxPlotTable(periodsData, "Lines of Code per Day", "loc");
  markdown += "\n";
  markdown += "## Commit Characteristics\n\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Lines per Commit",
    "loc_per_commit"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Files per Commit",
    "files_per_commit"
  );
  markdown += "\n";
  markdown += generateCommitCharacteristicsTable(summaryData, periods);
  markdown += "\n\n";
  markdown += "## Session Analysis\n\n";
  markdown += generateSessionMetricsTable(summaryData, periods);
  markdown += "\n\n";
  markdown += "### Hourly Analysis\n\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Active Hours per Day",
    "active_hours_per_day"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Commits per Hour Distribution",
    "commits_per_hour"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Lines of Code per Hour Distribution",
    "loc_per_hour"
  );
  markdown += "\n";
  markdown += "### Session Frequency\n\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "All Commit Intervals",
    "all_commit_intervals"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Sessions per Day",
    "sessions_per_day"
  );
  markdown += "\n";
  markdown += "### Session Duration\n\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Session Duration",
    "session_durations"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Inter-Session Gaps",
    "inter_session_gaps"
  );
  markdown += "\n";
  markdown += "### Session Productivity\n\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Within-Session Gaps",
    "within_session_gaps"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Commits per Session",
    "commits_per_session"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "LOC per Session",
    "loc_per_session"
  );
  markdown += "\n";
  markdown += "### Session Detection\n\n";
  markdown += formatSessionDiagnostics(periodsData);
  markdown += "\n";
  markdown += "## Additional Metrics\n\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Daily Time Span",
    "daily_span_minutes"
  );
  markdown += "\n";
  markdown += formatBoxPlotTable(
    periodsData,
    "Daily Session Time",
    "daily_session_minutes"
  );
  markdown += "\n";
  markdown += "## Time Pattern Analysis\n\n";
  markdown += generateTimePatternTable(summaryData, periods);
  markdown += "\n\n";
  markdown += "## Hourly Commit Distribution (Percentages)\n\n";
  markdown += generateHourlyDistributionTable(summaryData, periods);
  markdown += "\n";
  return markdown;
}

async function generateAllPlotsReport() {
  const periods = ["Pre-AI", "Recent-AI"];
  const periodsData = [];
  const summaryData = {};
  const dataDir = path.join(process.cwd(), "data/restlessronin/raw");
  const parametersPath = path.join(process.cwd(), "data/parameters.json");
  let periodConfigs = [];
  let userConfig = {};
  try {
    const parametersContent = await fs.readFile(parametersPath, "utf8");
    const parameters = JSON.parse(parametersContent);
    periodConfigs = parameters.PERIODS || [];
    userConfig =
      parameters.GITHUB_USERNAMES.find((u) => u.username === "restlessronin") ||
      {};
    console.log("Loaded configurations from parameters.json");
  } catch (error) {
    console.error("Error loading parameters.json:", error);
    periodConfigs = [
      { name: "Pre-AI", start: "2022-06-01", end: "2022-11-30" },
      { name: "Recent-AI", start: "2024-11-01", end: "2025-04-30" },
    ];
  }
  const codeOnlyFilter = (commit) => {
    const isWebsiteDocCommit =
      commit.isDocOnly &&
      commit.repo &&
      commit.repo.endsWith("/www.cyberchitta.cc");
    return !isWebsiteDocCommit;
  };
  const dataManager = createNodePeriodDataManager(dataDir, userConfig);
  for (const period of periods) {
    console.log(`Processing ${period}...`);
    try {
      const p = periodConfigs.find((p) => p.name === period);
      const tzConfig = getTzConfig(userConfig, period);
      const builder = await dataManager.createMetricsBuilder(
        period,
        p.start,
        p.end,
        tzConfig,
        codeOnlyFilter
      );
      const vizData = builder.build();
      periodsData.push({
        period,
        metrics: vizData,
        color: period === "Pre-AI" ? "#ed8936" : "#48bb78",
      });
      summaryData[period] = {
        activeDays: vizData.summary.total_active_days,
        totalCommits: vizData.summary.total_commits,
        sessionThreshold: vizData.summary.session_threshold_minutes,
        totalRepos: vizData.summary.total_repositories,
        repoStats: calculateRepoCommitStats(vizData.repo_commit_distribution),
        hourlyPercentages: calculateHourlyPercentages(
          vizData.commits_by_hour_of_day
        ),
        commitsStats: vizData.summary.commits_stats,
        locStats: vizData.summary.loc_stats,
        activeHoursStats: vizData.summary.active_hours_per_day_stats,
        locPerCommitStats: vizData.summary.loc_per_commit_stats,
        filesPerCommitStats: vizData.summary.files_per_commit_stats,
        commitsPerHourStats: vizData.summary.commits_per_hour_stats,
        locPerHourStats: vizData.summary.loc_per_hour_stats,
        sessionDurationsStats: vizData.summary.session_durations_stats,
        sessionsPerDayStats: vizData.summary.sessions_per_day_stats,
        commitsPerSessionStats: vizData.summary.commits_per_session_stats,
        dailySessionMinutesStats: vizData.summary.daily_session_minutes_stats,
        locPerSessionStats: vizData.summary.loc_per_session_stats,
        interSessionGapsStats: vizData.summary.inter_session_gaps_stats,
        withinSessionGapsStats: vizData.summary.within_session_gaps_stats,
        reposPerDayStats: vizData.summary.repos_stats,
        dailySpanStats: vizData.summary.daily_span_minutes_stats,
        allIntervalsStats: vizData.summary.all_commit_intervals_stats,
        repoCommitDistributionStats:
          vizData.summary.repo_commit_distribution_stats,
      };
      console.log(
        `${period} processed: ${vizData.GLOBAL_COMMITS.length} total commits`
      );
    } catch (error) {
      console.error(`Error processing ${period}:`, error);
    }
  }
  const markdown = generateMarkdownReport(
    periodsData,
    summaryData,
    periodConfigs
  );
  const outputPath = path.join(
    process.cwd(),
    "data/restlessronin/all-plots-llm.md"
  );
  await fs.writeFile(outputPath, markdown);
  console.log(`\nComplete analysis report written to: ${outputPath}`);
}

generateAllPlotsReport().catch(console.error);
