import { arrayFormatToCommits } from "./transforms.js";
import { PeriodDataManager } from "./period-data-manager.js";

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
