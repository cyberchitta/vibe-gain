import { arrayFormatToCommits, commitArrayFormat } from "./transforms.js";
import { MetricsBuilder } from "./metrics-builder.js";
import fs from "fs/promises";
import path from "path";

export class NodePeriodDataLoader {
  constructor(dataDir) {
    this.dataDir = dataDir;
  }

  getPeriodPaths(periodName) {
    const safePeriodName = periodName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return {
      commitsPath: path.join(this.dataDir, `${safePeriodName}_commits.json`),
      metadataPath: path.join(this.dataDir, `${safePeriodName}_metadata.json`),
    };
  }

  async exists(periodName) {
    const { commitsPath, metadataPath } = this.getPeriodPaths(periodName);
    const [commitsExists, metadataExists] = await Promise.all([
      fs
        .access(commitsPath)
        .then(() => true)
        .catch(() => false),
      fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false),
    ]);
    return { commits: commitsExists, metadata: metadataExists };
  }

  async load(periodName) {
    const { commitsPath, metadataPath } = this.getPeriodPaths(periodName);
    const commitsContent = await fs.readFile(commitsPath, "utf8");
    const arrayFormat = JSON.parse(commitsContent);
    const commits = arrayFormatToCommits(arrayFormat);
    const metadataContent = await fs.readFile(metadataPath, "utf8");
    const repoMetadata = JSON.parse(metadataContent);
    return { commits, repoMetadata };
  }

  async save(periodName, commits, repoMetadata) {
    const { commitsPath, metadataPath } = this.getPeriodPaths(periodName);
    await fs.mkdir(path.dirname(commitsPath), { recursive: true });
    const arrayFormat = commitArrayFormat(commits);
    await fs.writeFile(commitsPath, JSON.stringify(arrayFormat));
    console.log(`Saved ${commits.length} commits to ${commitsPath}`);
    await fs.writeFile(metadataPath, JSON.stringify(repoMetadata, null, 2));
    console.log(`Saved repository metadata to ${metadataPath}`);
  }
}

export class BrowserPeriodDataLoader {
  constructor(dataPath) {
    this.dataPath = dataPath;
  }

  getPeriodUrls(periodName) {
    const safePeriodName = periodName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return {
      commitsUrl: `${this.dataPath}/${safePeriodName}_commits.json`,
      metadataUrl: `${this.dataPath}/${safePeriodName}_metadata.json`,
    };
  }

  async exists(periodName) {
    const { commitsUrl, metadataUrl } = this.getPeriodUrls(periodName);
    const [commitsExists, metadataExists] = await Promise.all([
      fetch(commitsUrl, { method: "HEAD" })
        .then((r) => r.ok)
        .catch(() => false),
      fetch(metadataUrl, { method: "HEAD" })
        .then((r) => r.ok)
        .catch(() => false),
    ]);
    return { commits: commitsExists, metadata: metadataExists };
  }

  async load(periodName) {
    const { commitsUrl, metadataUrl } = this.getPeriodUrls(periodName);
    const commitsResponse = await fetch(commitsUrl);
    if (!commitsResponse.ok) {
      throw new Error(`Failed to load commits for ${periodName}`);
    }
    const arrayFormat = await commitsResponse.json();
    const commits = arrayFormatToCommits(arrayFormat);
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      throw new Error(`Failed to load repo metadata for ${periodName}`);
    }
    const repoMetadata = await metadataResponse.json();
    return { commits, repoMetadata };
  }

  async save(periodName, commits, repoMetadata) {
    throw new Error("Saving is not supported in browser environment");
  }
}

export class PeriodDataManager {
  constructor(dataLoader, userConfig) {
    this.dataLoader = dataLoader;
    this.userConfig = userConfig;
  }

  async loadPeriodData(periodName) {
    return await this.dataLoader.load(periodName);
  }

  async savePeriodData(periodName, commits, repoMetadata) {
    return await this.dataLoader.save(periodName, commits, repoMetadata);
  }

  async periodExists(periodName) {
    return await this.dataLoader.exists(periodName);
  }

  async createMetricsBuilder(periodName, startDate, endDate, filter = null) {
    const { commits, repoMetadata } = await this.loadPeriodData(periodName);
    let builder = MetricsBuilder.forPeriod(
      commits,
      repoMetadata,
      this.userConfig,
      startDate,
      endDate
    );
    if (filter) {
      builder = builder.withFilter(filter);
    }
    return builder;
  }
}

/**
 * Factory function for Node.js environments
 * @param {string} dataDir - Directory containing period data files
 * @param {Object} userConfig - User configuration object
 * @returns {PeriodDataManager}
 */
export function createNodePeriodDataManager(dataDir, userConfig) {
  const dataLoader = new NodePeriodDataLoader(dataDir);
  return new PeriodDataManager(dataLoader, userConfig);
}

/**
 * Factory function for browser environments
 * @param {string} dataPath - URL path to period data files
 * @param {Object} userConfig - User configuration object
 * @returns {PeriodDataManager}
 */
export function createBrowserPeriodDataManager(dataPath, userConfig) {
  const dataLoader = new BrowserPeriodDataLoader(dataPath);
  return new PeriodDataManager(dataLoader, userConfig);
}
