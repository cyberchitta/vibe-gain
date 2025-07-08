import {
  computeBaseMetrics,
  computeSessionMetrics,
  combineMetrics,
} from "./viz-data.js";
import { determineSessionThreshold } from "./session-thresholds.js";
import { uniq } from "../utils/array.js";

export class MetricsFactory {
  constructor(commits, userConfig) {
    this.commits = commits;
    this.userConfig = userConfig;
    this.allCommits = commits;
    this.codeCommits = commits.filter((c) => !c.isDocOnly);
    this.docCommits = commits.filter((c) => c.isDocOnly);
    this.baseMetrics = {
      all: computeBaseMetrics(this.allCommits, userConfig),
      code: computeBaseMetrics(this.codeCommits, userConfig),
      doc: computeBaseMetrics(this.docCommits, userConfig),
    };
    this.thresholdAnalysis = {
      all: determineSessionThreshold(this.allCommits, userConfig),
      code: determineSessionThreshold(this.codeCommits, userConfig),
      doc: determineSessionThreshold(this.docCommits, userConfig),
    };
    this.estimatedThresholds = {
      all: this.thresholdAnalysis.all.threshold,
      code: this.thresholdAnalysis.code.threshold,
      doc: this.thresholdAnalysis.doc.threshold,
    };
    this.summaryMetadata = {
      total_commits: this.allCommits.length,
      code_commits: this.codeCommits.length,
      doc_commits: this.docCommits.length,
      doc_percentage:
        this.allCommits.length > 0
          ? (this.docCommits.length / this.allCommits.length) * 100
          : 0,
      total_repositories: uniq(this.allCommits.map((c) => c.repo)).length,
    };
  }

  /**
   * Generate complete metrics with specified thresholds per commit type
   * @param {Object} thresholds - Object with {all, code, doc} threshold values
   * @returns {Object} - Complete metrics object
   */
  withThresholds(thresholds) {
    const sessionMetrics = {
      all: computeSessionMetrics(
        this.allCommits,
        this.userConfig,
        thresholds.all
      ),
      code: computeSessionMetrics(
        this.codeCommits,
        this.userConfig,
        thresholds.code
      ),
      doc: computeSessionMetrics(
        this.docCommits,
        this.userConfig,
        thresholds.doc
      ),
    };
    return {
      all: combineMetrics(
        this.baseMetrics.all,
        sessionMetrics.all,
        this.thresholdAnalysis.all,
        "all"
      ),
      code: combineMetrics(
        this.baseMetrics.code,
        sessionMetrics.code,
        this.thresholdAnalysis.code,
        "code"
      ),
      doc: combineMetrics(
        this.baseMetrics.doc,
        sessionMetrics.doc,
        this.thresholdAnalysis.doc,
        "doc"
      ),
      summary: this.summaryMetadata,
    };
  }

  /**
   * Generate complete metrics with single threshold applied to all commit types
   * @param {number} threshold - Session threshold in minutes
   * @returns {Object} - Complete metrics object
   */
  withThreshold(threshold) {
    return this.withThresholds({
      all: threshold,
      code: threshold,
      doc: threshold,
    });
  }

  /**
   * Generate complete metrics with estimated optimal thresholds per type
   * @returns {Object} - Complete metrics object with optimal thresholds
   */
  withEstimatedThresholds() {
    return this.withThresholds(this.estimatedThresholds);
  }

  /**
   * Generate complete metrics with estimated threshold for code commits (backward compatibility)
   * @returns {Object} - Complete metrics object using code commit threshold
   */
  withEstimatedThreshold() {
    return this.withThreshold(this.estimatedThresholds.code);
  }

  /**
   * Get the estimated optimal threshold values per commit type
   * @returns {Object} - Object with {all, code, doc} threshold values
   */
  getEstimatedThresholds() {
    return this.estimatedThresholds;
  }

  /**
   * Get the estimated optimal threshold for code commits (backward compatibility)
   * @returns {number} - Threshold in minutes
   */
  getEstimatedThreshold() {
    return this.estimatedThresholds.code;
  }

  /**
   * Get threshold analysis details for all commit types
   * @returns {Object} - Threshold analysis objects
   */
  getThresholdAnalysis() {
    return this.thresholdAnalysis;
  }

  /**
   * Get base metrics (threshold-invariant)
   * @returns {Object} - Base metrics for all commit types
   */
  getBaseMetrics() {
    return this.baseMetrics;
  }
}
