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
      fetchInfoPath: path.join(
        this.dataDir,
        `${safePeriodName}_fetchinfo.json`,
      ),
    };
  }

  async exists(periodName) {
    const { commitsPath, metadataPath, fetchInfoPath } =
      this.getPeriodPaths(periodName);
    const [commitsExists, metadataExists, fetchInfoExists] = await Promise.all([
      fs
        .access(commitsPath)
        .then(() => true)
        .catch(() => false),
      fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false),
      fs
        .access(fetchInfoPath)
        .then(() => true)
        .catch(() => false),
    ]);
    return {
      commits: commitsExists,
      metadata: metadataExists,
      fetchInfo: fetchInfoExists,
    };
  }

  async load(periodName) {
    const {
      commits: commitsPath,
      metadata: metadataPath,
      fetchinfo: fetchinfoPath,
    } = this.getPeriodPaths(periodName);
    const commitsText = await fs.readFile(commitsPath, "utf8");
    const arrayFormat = JSON.parse(commitsText);
    const commits = arrayFormatToCommits(arrayFormat);
    let repoMetadata = {};
    try {
      const metadataText = await fs.readFile(metadataPath, "utf8");
      repoMetadata = JSON.parse(metadataText);
    } catch (error) {}
    let fetchMetadata = null;
    try {
      const fetchinfoText = await fs.readFile(fetchinfoPath, "utf8");
      fetchMetadata = JSON.parse(fetchinfoText);
    } catch (error) {}
    return { commits, repoMetadata, fetchMetadata };
  }

  async save(periodName, commits, repoMetadata, fetchMetadata) {
    const { commitsPath, metadataPath, fetchInfoPath } =
      this.getPeriodPaths(periodName);
    await fs.mkdir(path.dirname(commitsPath), { recursive: true });
    const arrayFormat = commitArrayFormat(commits);
    await fs.writeFile(commitsPath, JSON.stringify(arrayFormat));
    console.log(`Saved ${commits.length} commits to ${commitsPath}`);
    await fs.writeFile(metadataPath, JSON.stringify(repoMetadata, null, 2));
    console.log(`Saved repository metadata to ${metadataPath}`);
    await fs.writeFile(fetchInfoPath, JSON.stringify(fetchMetadata, null, 2));
    console.log(`Saved fetch metadata to ${fetchInfoPath}`);
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
