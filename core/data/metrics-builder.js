import { getLocalCodingDay, getLocalHour } from "../utils/timezone.js";
import { groupBy, uniq, calculateBoxPlotStats } from "../utils/array.js";
import { isPrivateCommit, isForkCommit } from "./transforms.js";
import { extractBasicCommitIntervals } from "./sessions.js";
import { determineSessionThreshold } from "./threshold-analysis.js";
import { SessionBuilder } from "./session-builder.js";

export class MetricsBuilder {
  static forPeriod(
    commits,
    repoMetadata,
    tzConfig,
    periodStart,
    periodEnd,
    periodName
  ) {
    const periodCommits = commits.filter((commit) => {
      const commitCodingDay = getLocalCodingDay(commit.timestamp, tzConfig);
      return commitCodingDay >= periodStart && commitCodingDay <= periodEnd;
    });
    const thresholdAnalysis = determineSessionThreshold(
      periodCommits,
      tzConfig
    );
    return new MetricsBuilder(
      commits,
      repoMetadata,
      tzConfig,
      periodCommits,
      thresholdAnalysis,
      thresholdAnalysis?.threshold,
      periodName
    );
  }

  constructor(
    commits,
    repoMetadata,
    tzConfig,
    filteredCommits,
    thresholdAnalysis,
    sessionThreshold,
    periodName = null
  ) {
    this.GLOBAL_COMMITS = Object.freeze(commits);
    this.REPO_METADATA = Object.freeze(repoMetadata);
    this.TZ_CONFIG = Object.freeze(tzConfig);
    this.FILTERED_COMMITS = Object.freeze(filteredCommits || commits);
    this.THRESHOLD_ANALYSIS = Object.freeze(thresholdAnalysis);
    this.SESSION_THRESHOLD = sessionThreshold;
    this.PERIOD_NAME = periodName;
    Object.freeze(this);
  }

  withFilter(filterFn) {
    return new MetricsBuilder(
      this.GLOBAL_COMMITS,
      this.REPO_METADATA,
      this.TZ_CONFIG,
      this.GLOBAL_COMMITS.filter(filterFn),
      this.THRESHOLD_ANALYSIS,
      this.SESSION_THRESHOLD,
      this.PERIOD_NAME
    );
  }

  withThreshold(minutes) {
    return new MetricsBuilder(
      this.GLOBAL_COMMITS,
      this.REPO_METADATA,
      this.TZ_CONFIG,
      this.FILTERED_COMMITS,
      this.THRESHOLD_ANALYSIS,
      minutes,
      this.PERIOD_NAME
    );
  }

  build() {
    const filterable = this.buildFilterable();
    const session = this.buildSession();
    const global = this.buildGlobal();
    return {
      GLOBAL_COMMITS: this.GLOBAL_COMMITS,
      FILTERED_COMMITS: this.FILTERED_COMMITS,
      ...filterable,
      ...session,
      ...global,
      summary: {
        ...filterable.summary,
        ...session.summary,
        ...global.summary,
        session_threshold_analysis: this.THRESHOLD_ANALYSIS,
      },
    };
  }

  buildFilterable() {
    const commits = this._computeCommitsMetric();
    const loc = this._computeLocMetric();
    const locPerCommit = this._computeLocPerCommitMetric();
    const filesPerCommit = this._computeFilesPerCommitMetric();
    const commitsPerHour = this._computeHourlyCommitDistribution();
    const locPerHour = this._computeHourlyLocDistribution();
    const activeHoursPerDay = this._computeActiveHoursMetric();
    const byHour = this._computeCommitsByHourOfDay();
    const commitsByDay = groupBy(this.FILTERED_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.TZ_CONFIG, this.PERIOD_NAME)
    );
    const commitsStats = calculateBoxPlotStats(commits.map((d) => d.commits));
    const locStats = calculateBoxPlotStats(loc.map((d) => d.loc));
    const locPerCommitStats = calculateBoxPlotStats(
      locPerCommit.map((d) => d.loc_per_commit)
    );
    const filesPerCommitStats = calculateBoxPlotStats(
      filesPerCommit.map((d) => d.files_per_commit)
    );
    const activeHoursStats = calculateBoxPlotStats(
      activeHoursPerDay.map((d) => d.active_hours_per_day)
    );
    const commitsPerHourStats = calculateBoxPlotStats(commitsPerHour);
    const locPerHourStats = calculateBoxPlotStats(locPerHour);
    return {
      commits,
      loc,
      loc_per_commit: locPerCommit,
      files_per_commit: filesPerCommit,
      commits_per_hour: commitsPerHour,
      loc_per_hour: locPerHour,
      active_hours_per_day: activeHoursPerDay,
      commits_by_hour_of_day: byHour,
      summary: {
        total_commits: this.FILTERED_COMMITS.length,
        total_active_days: Object.keys(commitsByDay).length,
        total_lines_changed: this.FILTERED_COMMITS.reduce(
          (sum, commit) =>
            sum + (commit.additions || 0) + (commit.deletions || 0),
          0
        ),
        private_repo_percentage:
          this.FILTERED_COMMITS.length > 0
            ? (this.FILTERED_COMMITS.filter((c) =>
                isPrivateCommit(c, this.REPO_METADATA)
              ).length /
                this.FILTERED_COMMITS.length) *
              100
            : 0,
        fork_percentage:
          this.FILTERED_COMMITS.length > 0
            ? (this.FILTERED_COMMITS.filter((c) =>
                isForkCommit(c, this.REPO_METADATA)
              ).length /
                this.FILTERED_COMMITS.length) *
              100
            : 0,
        date_range:
          this.FILTERED_COMMITS.length > 0
            ? {
                start: this.FILTERED_COMMITS.reduce(
                  (earliest, c) =>
                    c.timestamp < earliest ? c.timestamp : earliest,
                  this.FILTERED_COMMITS[0].timestamp
                ),
                end: this.FILTERED_COMMITS.reduce(
                  (latest, c) => (c.timestamp > latest ? c.timestamp : latest),
                  this.FILTERED_COMMITS[0].timestamp
                ),
              }
            : { start: null, end: null },
        commits_stats: commitsStats,
        loc_stats: locStats,
        loc_per_commit_stats: locPerCommitStats,
        files_per_commit_stats: filesPerCommitStats,
        active_hours_per_day_stats: activeHoursStats,
        commits_per_hour_stats: commitsPerHourStats,
        loc_per_hour_stats: locPerHourStats,
      },
    };
  }

  buildSession() {
    if (!this.SESSION_THRESHOLD) {
      throw new Error(
        "Session threshold not set. Use MetricsBuilder.forPeriod() or withThreshold() before building session metrics. Use withThreshold()"
      );
    }
    const sessionBuilder = new SessionBuilder(
      this.GLOBAL_COMMITS,
      this.FILTERED_COMMITS,
      this.TZ_CONFIG,
      this.SESSION_THRESHOLD,
      this.PERIOD_NAME
    );
    return sessionBuilder.build();
  }

  buildGlobal() {
    const repos = this._computeReposMetric();
    const dailySpanMinutes = this._computeDailySpanMinutesMetric();
    const allCommitIntervals = extractBasicCommitIntervals(
      this.GLOBAL_COMMITS,
      this.TZ_CONFIG
    );
    const repoCommitDistribution = this._computeRepoCommitDistribution();
    const reposStats = calculateBoxPlotStats(repos.map((d) => d.repos));
    const dailySpanStats = calculateBoxPlotStats(
      dailySpanMinutes.map((d) => d.daily_span_minutes)
    );
    const allCommitIntervalsStats = calculateBoxPlotStats(
      allCommitIntervals.map((i) => i.interval_minutes)
    );
    const repoCommitDistributionStats = calculateBoxPlotStats(
      repoCommitDistribution
    );
    return {
      repos,
      daily_span_minutes: dailySpanMinutes,
      all_commit_intervals: allCommitIntervals,
      repo_commit_distribution: repoCommitDistribution,
      summary: {
        total_repositories: uniq(this.GLOBAL_COMMITS.map((c) => c.repo)).length,
        repos_stats: reposStats,
        daily_span_minutes_stats: dailySpanStats,
        all_commit_intervals_stats: allCommitIntervalsStats,
        repo_commit_distribution_stats: repoCommitDistributionStats,
      },
    };
  }

  buildFilterableOnly() {
    return this.buildFilterable();
  }

  buildSessionOnly() {
    return this.buildSession();
  }

  buildGlobalOnly() {
    return this.buildGlobal();
  }

  _computeCommitsMetric() {
    const commitsByDay = groupBy(this.FILTERED_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.TZ_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => ({
      date,
      commits: dayCommits.length,
    }));
  }

  _computeLocMetric() {
    const commitsByDay = groupBy(this.FILTERED_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.TZ_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => ({
      date,
      loc: dayCommits.reduce((sum, c) => sum + c.additions + c.deletions, 0),
    }));
  }

  _computeLocPerCommitMetric() {
    return this.FILTERED_COMMITS.map((commit) => ({
      loc_per_commit: (commit.additions || 0) + (commit.deletions || 0),
    }));
  }

  _computeFilesPerCommitMetric() {
    return this.FILTERED_COMMITS.map((commit) => ({
      files_per_commit: commit.filesChanged || 0,
    }));
  }

  _computeHourlyCommitDistribution() {
    const hourlyCommits = {};
    this.FILTERED_COMMITS.forEach((commit) => {
      const localCodingDay = getLocalCodingDay(
        commit.timestamp,
        this.TZ_CONFIG
      );
      const localHour = getLocalHour(commit.timestamp, this.TZ_CONFIG);
      const hourKey = `${localCodingDay}T${localHour
        .toString()
        .padStart(2, "0")}`;
      hourlyCommits[hourKey] = (hourlyCommits[hourKey] || 0) + 1;
    });
    return Object.values(hourlyCommits);
  }

  _computeCommitsByHourOfDay() {
    const hourCounts = new Array(24).fill(0);
    this.FILTERED_COMMITS.forEach((commit) => {
      const localHour = getLocalHour(commit.timestamp, this.TZ_CONFIG);
      hourCounts[localHour]++;
    });
    return hourCounts;
  }

  _computeHourlyLocDistribution() {
    const hourlyLoc = {};
    this.FILTERED_COMMITS.forEach((commit) => {
      const localCodingDay = getLocalCodingDay(
        commit.timestamp,
        this.TZ_CONFIG
      );
      const localHour = getLocalHour(commit.timestamp, this.TZ_CONFIG);
      const hourKey = `${localCodingDay}T${localHour
        .toString()
        .padStart(2, "0")}`;
      hourlyLoc[hourKey] =
        (hourlyLoc[hourKey] || 0) +
        (commit.additions || 0) +
        (commit.deletions || 0);
    });
    return Object.values(hourlyLoc);
  }

  _computeActiveHoursMetric() {
    const commitsByDay = groupBy(this.FILTERED_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.TZ_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => {
      const activeHours = new Set(
        dayCommits.map((commit) =>
          getLocalHour(commit.timestamp, this.TZ_CONFIG)
        )
      );
      return {
        date,
        active_hours_per_day: activeHours.size,
      };
    });
  }

  _computeReposMetric() {
    const commitsByDay = groupBy(this.GLOBAL_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.TZ_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => ({
      date,
      repos: uniq(dayCommits.map((c) => c.repo)).length,
    }));
  }

  _computeRepoCommitDistribution() {
    const repoCommitCounts = {};
    this.GLOBAL_COMMITS.forEach((commit) => {
      repoCommitCounts[commit.repo] = (repoCommitCounts[commit.repo] || 0) + 1;
    });
    return Object.values(repoCommitCounts);
  }

  _computeDailySpanMinutesMetric() {
    const commitsByDay = groupBy(this.GLOBAL_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.TZ_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => {
      const utcTimestamps = dayCommits
        .map((c) => new Date(c.timestamp).getTime())
        .sort((a, b) => a - b);
      const legacyCodingTime =
        utcTimestamps.length === 1
          ? 6
          : Math.min(
              (utcTimestamps[utcTimestamps.length - 1] - utcTimestamps[0]) /
                (1000 * 60),
              8 * 60
            );
      return {
        date,
        daily_span_minutes: legacyCodingTime,
      };
    });
  }
}
