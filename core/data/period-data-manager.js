import { MetricsBuilder } from "./metrics-builder.js";

export class PeriodDataManager {
  constructor(dataLoader, userConfig) {
    this.dataLoader = dataLoader;
    this.userConfig = userConfig;
  }

  async loadPeriodData(periodName) {
    return await this.dataLoader.load(periodName);
  }

  async savePeriodData(periodName, commits, repoMetadata, fetchMetadata) {
    return await this.dataLoader.save(
      periodName,
      commits,
      repoMetadata,
      fetchMetadata
    );
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
