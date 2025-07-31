import fs from "fs/promises";
import path from "path";
import { arrayFormatToCommits, commitArrayFormat } from "./transforms.js";
import { PeriodDataManager } from "./period-data-manager.js";

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
