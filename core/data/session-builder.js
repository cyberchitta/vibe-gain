import { getLocalCodingDay, isSameCodingDay } from "../utils/timezone.js";
import {
  groupBy,
  calculateMedian,
  calculateBoxPlotStats,
} from "../utils/array.js";
import { detectCodingSessions } from "./sessions.js";

export class SessionBuilder {
  constructor(globalCommits, filteredCommits, userConfig, sessionThreshold) {
    this.globalCommits = globalCommits;
    this.filteredCommits = filteredCommits;
    this.userConfig = userConfig;
    this.sessionThreshold = sessionThreshold;
  }

  build() {
    if (!this.globalCommits || this.globalCommits.length === 0) {
      return this._emptySessionMetrics();
    }
    const sessionsByDay = this._detectAllSessions();
    const timingMetrics = this._buildTimingMetrics(sessionsByDay);
    const contentMetrics = this._buildContentMetrics(sessionsByDay);
    const summary = this._buildSummary(timingMetrics, contentMetrics);
    const rawSessions = [];
    Object.entries(sessionsByDay).forEach(([date, sessions]) => {
      rawSessions.push(...sessions);
    });
    const medianWithinSessionGap = calculateMedian(
      timingMetrics.within_session_gaps
    );
    const adjustedDailySessionMinutes = timingMetrics.daily_session_minutes.map(
      (dayMetric) => {
        const sessionsCount = dayMetric.sessions_count || 0;
        return {
          date: dayMetric.date,
          daily_session_minutes:
            dayMetric.daily_session_minutes +
            sessionsCount * medianWithinSessionGap,
        };
      }
    );
    return {
      ...timingMetrics,
      ...contentMetrics,
      daily_session_minutes: adjustedDailySessionMinutes,
      raw_sessions: rawSessions,
      summary,
    };
  }

  _detectAllSessions() {
    const commitsByDay = groupBy(this.globalCommits, (commit) =>
      getLocalCodingDay(commit.timestamp, this.userConfig)
    );
    const sessionsByDay = {};
    Object.entries(commitsByDay).forEach(([date, dayCommits]) => {
      sessionsByDay[date] = detectCodingSessions(
        dayCommits,
        this.sessionThreshold
      );
    });
    return sessionsByDay;
  }

  _buildTimingMetrics(sessionsByDay) {
    const allSessionDurations = [];
    const sessionsPerDay = [];
    const dailySessionMinutes = [];
    const allInterSessionGaps = [];
    const allWithinSessionGaps = [];
    Object.entries(sessionsByDay).forEach(([date, sessions]) => {
      sessionsPerDay.push({
        date: date,
        sessions_count: sessions.length,
      });
      const sessionDurations = sessions.map((s) => s.duration);
      allSessionDurations.push(...sessionDurations);
      const totalSessionTime = sessionDurations.reduce((sum, d) => sum + d, 0);
      dailySessionMinutes.push({
        date: date,
        daily_session_minutes: totalSessionTime,
        sessions_count: sessions.length,
      });
      for (let i = 1; i < sessions.length; i++) {
        const gapMinutes =
          (sessions[i].startTime - sessions[i - 1].endTime) / (1000 * 60);
        allInterSessionGaps.push(gapMinutes);
      }
      sessions.forEach((session) => {
        const sessionCommits = session.commits;
        for (let i = 1; i < sessionCommits.length; i++) {
          const prevTime = new Date(sessionCommits[i - 1].timestamp).getTime();
          const currTime = new Date(sessionCommits[i].timestamp).getTime();
          const gapMinutes = (currTime - prevTime) / (1000 * 60);
          allWithinSessionGaps.push(gapMinutes);
        }
      });
    });
    return {
      session_durations: allSessionDurations,
      sessions_per_day: sessionsPerDay,
      daily_session_minutes: dailySessionMinutes,
      inter_session_gaps: allInterSessionGaps,
      within_session_gaps: allWithinSessionGaps,
    };
  }

  _buildContentMetrics(sessionsByDay) {
    const allLocPerSession = [];
    const allCommitsPerSession = [];
    Object.entries(sessionsByDay).forEach(([date, sessions]) => {
      sessions.forEach((session) => {
        const sessionStart = session.startTime.getTime();
        const sessionEnd = session.endTime.getTime();
        const filteredCommitsInSession = this.filteredCommits.filter(
          (commit) => {
            const commitTime = new Date(commit.timestamp).getTime();
            return (
              commitTime >= sessionStart &&
              commitTime <= sessionEnd &&
              isSameCodingDay(
                commit.timestamp,
                session.startTime,
                this.userConfig
              )
            );
          }
        );
        const locInSession = filteredCommitsInSession.reduce(
          (sum, c) => sum + (c.additions || 0) + (c.deletions || 0),
          0
        );
        const commitsInSession = filteredCommitsInSession.length;
        allLocPerSession.push(locInSession);
        allCommitsPerSession.push(commitsInSession);
      });
    });
    return {
      loc_per_session: allLocPerSession,
      commits_per_session: allCommitsPerSession,
    };
  }

  _buildSummary(timingMetrics, contentMetrics) {
    const medianWithinSessionGap = calculateMedian(
      timingMetrics.within_session_gaps
    );
    const adjustedDailySessionMinutes = timingMetrics.daily_session_minutes.map(
      (dayMetric) => {
        const sessionsCount = dayMetric.sessions_count || 0;
        return (
          dayMetric.daily_session_minutes +
          sessionsCount * medianWithinSessionGap
        );
      }
    );
    const sessionDurationsStats = calculateBoxPlotStats(
      timingMetrics.session_durations
    );
    const sessionsPerDayStats = calculateBoxPlotStats(
      timingMetrics.sessions_per_day.map((spd) => spd.sessions_count)
    );
    const commitsPerSessionStats = calculateBoxPlotStats(
      contentMetrics.commits_per_session
    );
    const dailySessionMinutesStats = calculateBoxPlotStats(
      adjustedDailySessionMinutes
    );
    const interSessionGapsStats = calculateBoxPlotStats(
      timingMetrics.inter_session_gaps
    );
    const withinSessionGapsStats = calculateBoxPlotStats(
      timingMetrics.within_session_gaps
    );
    const locPerSessionStats = calculateBoxPlotStats(
      contentMetrics.loc_per_session
    );
    return {
      session_threshold_minutes: this.sessionThreshold,
      session_durations_stats: sessionDurationsStats,
      sessions_per_day_stats: sessionsPerDayStats,
      commits_per_session_stats: commitsPerSessionStats,
      daily_session_minutes_stats: dailySessionMinutesStats,
      inter_session_gaps_stats: interSessionGapsStats,
      within_session_gaps_stats: withinSessionGapsStats,
      loc_per_session_stats: locPerSessionStats,
    };
  }

  _emptySessionMetrics() {
    return {
      session_durations: [],
      sessions_per_day: [],
      commits_per_session: [],
      daily_session_minutes: [],
      inter_session_gaps: [],
      within_session_gaps: [],
      loc_per_session: [],
      raw_sessions: [],
      summary: {
        session_threshold_minutes: this.sessionThreshold || 45,
        session_durations_stats: null,
        sessions_per_day_stats: null,
        commits_per_session_stats: null,
        daily_session_minutes_stats: null,
        inter_session_gaps_stats: null,
        within_session_gaps_stats: null,
        loc_per_session_stats: null,
      },
    };
  }
}
