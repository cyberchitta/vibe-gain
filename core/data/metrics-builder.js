import { getLocalCodingDay, getLocalHour } from "../utils/timezone.js";
import { groupBy, uniq, calculateMedian } from "../utils/array.js";
import {
  extractBasicCommitIntervals,
  analyzeSessionsWithThreshold,
} from "./sessions.js";
import { determineSessionThreshold } from "./session-thresholds.js";

export class MetricsBuilder {
  constructor(
    commits,
    userConfig,
    filteredCommits = null,
    sessionThreshold = null
  ) {
    this.GLOBAL_COMMITS = Object.freeze(commits);
    this.USER_CONFIG = Object.freeze(userConfig);
    this.FILTERED_COMMITS = Object.freeze(filteredCommits || commits);
    this.SESSION_THRESHOLD = sessionThreshold;
    Object.freeze(this);
  }

  withFilter(filterFn) {
    return new MetricsBuilder(
      this.GLOBAL_COMMITS,
      this.USER_CONFIG,
      this.GLOBAL_COMMITS.filter(filterFn),
      this.SESSION_THRESHOLD
    );
  }

  withThreshold(minutes) {
    return new MetricsBuilder(
      this.GLOBAL_COMMITS,
      this.USER_CONFIG,
      this.FILTERED_COMMITS,
      minutes
    );
  }

  withEstimatedThreshold() {
    const thresholdAnalysis = determineSessionThreshold(
      this.GLOBAL_COMMITS,
      this.USER_CONFIG
    );
    return this.withThreshold(thresholdAnalysis.threshold);
  }

  build() {
    const filterable = this.buildFilterable();
    const session = this.buildSession();
    const global = this.buildGlobal();
    return {
      ...filterable,
      ...session,
      ...global,
      summary: {
        ...filterable.summary,
        ...session.summary,
        ...global.summary,
        session_threshold_analysis: this._getThresholdAnalysis(),
      },
    };
  }

  buildFilterable() {
    const commits = this._computeCommitsMetric();
    const loc = this._computeLocMetric();
    const locPerCommit = this._computeLocPerCommitMetric();
    const filesPerCommit = this._computeFilesPerCommitMetric();
    const hourly = this._computeHourlyCommitDistribution();
    const hourlyLoc = this._computeHourlyLocDistribution();
    const activeHours = this._computeActiveHoursMetric();
    const byHour = this._computeCommitsByHourOfDay();
    const commitsByDay = groupBy(this.FILTERED_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.USER_CONFIG)
    );
    return {
      commits,
      loc,
      loc_per_commit: locPerCommit,
      files_per_commit: filesPerCommit,
      hourly_commit_distribution: hourly,
      hourly_loc_distribution: hourlyLoc,
      active_hours: activeHours,
      commits_by_hour_of_day: byHour,
      summary: {
        total_commits: this.FILTERED_COMMITS.length,
        total_active_days: Object.keys(commitsByDay).length,
        commits_per_active_day: calculateMedian(commits.map((d) => d.commits)),
        median_loc_per_day: calculateMedian(loc.map((d) => d.loc)),
        median_loc_per_commit: calculateMedian(
          locPerCommit.map((d) => d.loc_per_commit)
        ),
        median_files_per_commit: calculateMedian(
          filesPerCommit.map((d) => d.files_per_commit)
        ),
        median_active_hours_per_day: calculateMedian(
          activeHours.map((d) => d.active_hours)
        ),
        total_lines_changed: this.FILTERED_COMMITS.reduce(
          (sum, commit) =>
            sum + (commit.additions || 0) + (commit.deletions || 0),
          0
        ),
        private_repo_percentage:
          this.FILTERED_COMMITS.length > 0
            ? (this.FILTERED_COMMITS.filter((c) => c.private).length /
                this.FILTERED_COMMITS.length) *
              100
            : 0,
        fork_percentage:
          this.FILTERED_COMMITS.length > 0
            ? (this.FILTERED_COMMITS.filter((c) => c.isFork).length /
                this.FILTERED_COMMITS.length) *
              100
            : 0,
        date_range:
          this.FILTERED_COMMITS.length > 0
            ? {
                start: new Date(
                  Math.min(
                    ...this.FILTERED_COMMITS.map((c) => new Date(c.timestamp))
                  )
                ).toISOString(),
                end: new Date(
                  Math.max(
                    ...this.FILTERED_COMMITS.map((c) => new Date(c.timestamp))
                  )
                ).toISOString(),
              }
            : { start: null, end: null },
      },
    };
  }

  buildSession() {
    if (this.SESSION_THRESHOLD === null) {
      throw new Error(
        "Session threshold must be set. Use withThreshold() or withEstimatedThreshold()"
      );
    }
    const sessionAnalysis = analyzeSessionsWithThreshold(
      this.GLOBAL_COMMITS,
      this.USER_CONFIG,
      this.SESSION_THRESHOLD
    );
    return {
      session_durations: sessionAnalysis.metrics.session_durations,
      sessions_per_day: sessionAnalysis.metrics.sessions_per_day,
      commits_per_session: sessionAnalysis.metrics.commits_per_session,

      session_time: sessionAnalysis.dailyMetrics.map((d) => ({
        date: d.date,
        session_time: d.total_session_time,
      })),
      session_intervals: sessionAnalysis.metrics.session_intervals,
      intra_session_intervals: sessionAnalysis.metrics.intra_session_intervals,
      loc_per_session: sessionAnalysis.metrics.loc_per_session,
      summary: {
        median_session_time_per_day:
          sessionAnalysis.summary.median_session_time_per_day,
        median_sessions_per_day:
          sessionAnalysis.summary.median_sessions_per_day,
        median_commits_per_session:
          sessionAnalysis.summary.median_commits_per_session,
        median_session_duration:
          sessionAnalysis.summary.median_session_duration,
        median_loc_per_session: sessionAnalysis.summary.median_loc_per_session,
        session_threshold_minutes: this.SESSION_THRESHOLD,
      },
    };
  }

  buildGlobal() {
    const repos = this._computeReposMetric();
    const codingTime = this._computeCodingTimeMetric();
    const commitIntervals = extractBasicCommitIntervals(
      this.GLOBAL_COMMITS,
      this.USER_CONFIG
    );
    const repoCommitDistribution = this._computeRepoCommitDistribution();
    return {
      repos,
      coding_time: codingTime,
      commit_intervals: commitIntervals,
      repo_commit_distribution: repoCommitDistribution,
      summary: {
        total_repositories: uniq(this.GLOBAL_COMMITS.map((c) => c.repo)).length,
        median_repos_per_day: calculateMedian(repos.map((d) => d.repos)),
        median_coding_time_per_day: calculateMedian(
          codingTime.map((d) => d.coding_time)
        ),
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

  _getThresholdAnalysis() {
    return determineSessionThreshold(this.GLOBAL_COMMITS, this.USER_CONFIG);
  }

  _computeCommitsMetric() {
    const commitsByDay = groupBy(this.FILTERED_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.USER_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => ({
      date,
      commits: dayCommits.length,
    }));
  }

  _computeLocMetric() {
    const commitsByDay = groupBy(this.FILTERED_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.USER_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => ({
      date,
      loc: dayCommits.reduce((sum, c) => sum + c.additions + c.deletions, 0),
    }));
  }

  _computeHourlyCommitDistribution() {
    const hourlyCommits = {};
    this.FILTERED_COMMITS.forEach((commit) => {
      const localCodingDay = getLocalCodingDay(
        commit.timestamp,
        this.USER_CONFIG
      );
      const localHour = getLocalHour(
        commit.timestamp,
        this.USER_CONFIG.timezone_offset_hours
      );
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
      const localHour = getLocalHour(
        commit.timestamp,
        this.USER_CONFIG.timezone_offset_hours
      );
      hourCounts[localHour]++;
    });
    return hourCounts;
  }

  _computeHourlyLocDistribution() {
    const hourlyLoc = {};
    this.FILTERED_COMMITS.forEach((commit) => {
      const localCodingDay = getLocalCodingDay(
        commit.timestamp,
        this.USER_CONFIG
      );
      const localHour = getLocalHour(
        commit.timestamp,
        this.USER_CONFIG.timezone_offset_hours
      );
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
      getLocalCodingDay(commit.timestamp, this.USER_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => {
      const activeHours = new Set(
        dayCommits.map((commit) =>
          getLocalHour(commit.timestamp, this.USER_CONFIG.timezone_offset_hours)
        )
      );
      return {
        date,
        active_hours: activeHours.size,
      };
    });
  }

  _computeReposMetric() {
    const commitsByDay = groupBy(this.GLOBAL_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.USER_CONFIG)
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

  _computeCodingTimeMetric() {
    const commitsByDay = groupBy(this.GLOBAL_COMMITS, (commit) =>
      getLocalCodingDay(commit.timestamp, this.USER_CONFIG)
    );
    return Object.entries(commitsByDay).map(([date, dayCommits]) => {
      const utcTimestamps = dayCommits
        .map((c) => new Date(c.timestamp).getTime())
        .sort((a, b) => a - b);
      const legacyCodingTime =
        utcTimestamps.length === 1
          ? 6
          : (utcTimestamps[utcTimestamps.length - 1] - utcTimestamps[0]) /
            (1000 * 60);
      return {
        date,
        coding_time: legacyCodingTime,
      };
    });
  }

  _computeLocPerCommitMetric() {
    return this.FILTERED_COMMITS.map((commit) => ({
      sha: commit.sha,
      repo: commit.repo,
      timestamp: commit.timestamp,
      loc_per_commit: (commit.additions || 0) + (commit.deletions || 0),
    }));
  }

  _computeFilesPerCommitMetric() {
    return this.FILTERED_COMMITS.map((commit) => ({
      sha: commit.sha,
      repo: commit.repo,
      timestamp: commit.timestamp,
      files_per_commit: commit.filesChanged || 0,
    }));
  }
}
