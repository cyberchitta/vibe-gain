/**
 * Identify clusters of commits based on time proximity
 * @param {Array} commits - Array of commit objects with timestamp property
 * @param {number} thresholdMinutes - Maximum time gap to consider commits as part of same cluster
 * @returns {Array} - Array of cluster objects with commit groups
 */
export function identifyCommitClusters(commits, thresholdMinutes = 30) {
  if (!commits || commits.length === 0) {
    return [];
  }
  const commitsByDate = commits.reduce((groups, commit) => {
    const date = commit.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(commit);
    return groups;
  }, {});
  const allClusters = [];
  let globalClusterId = 0;
  Object.entries(commitsByDate).forEach(([date, dayCommits]) => {
    const sortedCommits = [...dayCommits].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    let currentCluster = {
      id: `cluster-${globalClusterId++}`,
      date: date,
      commits: [sortedCommits[0]],
      startTime: new Date(sortedCommits[0].timestamp),
      endTime: new Date(sortedCommits[0].timestamp),
      repositories: new Set([sortedCommits[0].repo]),
    };
    for (let i = 1; i < sortedCommits.length; i++) {
      const prevTimestamp = new Date(sortedCommits[i - 1].timestamp);
      const currTimestamp = new Date(sortedCommits[i].timestamp);
      const diffMinutes = (currTimestamp - prevTimestamp) / (1000 * 60);
      if (diffMinutes <= thresholdMinutes) {
        currentCluster.commits.push(sortedCommits[i]);
        currentCluster.endTime = currTimestamp;
        currentCluster.repositories.add(sortedCommits[i].repo);
      } else {
        currentCluster.repositories = Array.from(currentCluster.repositories);
        currentCluster.duration =
          (currentCluster.endTime - currentCluster.startTime) / (1000 * 60);
        allClusters.push(currentCluster);
        currentCluster = {
          id: `cluster-${globalClusterId++}`,
          date: date,
          commits: [sortedCommits[i]],
          startTime: currTimestamp,
          endTime: currTimestamp,
          repositories: new Set([sortedCommits[i].repo]),
        };
      }
    }
    if (currentCluster.commits.length > 0) {
      currentCluster.repositories = Array.from(currentCluster.repositories);
      currentCluster.duration =
        (currentCluster.endTime - currentCluster.startTime) / (1000 * 60);
      allClusters.push(currentCluster);
    }
  });
  return allClusters;
}

/**
 * Assign repositories to visual groups using commit rank order
 * @param {Array} repos - Array of repository names
 * @param {Array} commits - Array of commit objects (to calculate commit counts)
 * @param {number} groupCount - Number of groups to create (default: 4)
 * @returns {Object} - Object mapping repo names to group assignments
 */
export function assignRepositoryGroups(repos, commits, groupCount = 4) {
  if (!repos || repos.length === 0) {
    return {};
  }
  const repoCommitCounts = {};
  commits.forEach((commit) => {
    repoCommitCounts[commit.repo] = (repoCommitCounts[commit.repo] || 0) + 1;
  });
  const uniqueRepos = [...new Set(repos)].sort(
    (a, b) => (repoCommitCounts[b] || 0) - (repoCommitCounts[a] || 0)
  );
  const groupAssignments = {};
  const shapeDefinitions = ["circle", "square", "triangle", "diamond", "cross"];
  uniqueRepos.forEach((repo, index) => {
    const groupId = index % groupCount;
    const shapeIndex = index % shapeDefinitions.length;
    groupAssignments[repo] = {
      group: `group${groupId}`,
      groupIndex: groupId,
      shape: shapeDefinitions[shapeIndex],
      shapeIndex: shapeIndex,
      overallIndex: index,
    };
  });
  return groupAssignments;
}

/**
 * Prepare data for strip plot visualization
 * @param {Array} commits - Array of commit objects
 * @param {string} period - Period identifier (e.g., 'Pre-AI', 'Recent-AI')
 * @param {Object} options - Configuration options
 * @returns {Object} - Formatted data for visualization
 */
export function prepareStripPlotData(commits, period, options = {}) {
  const thresholdMinutes = options.clusterThreshold || 30;
  const groupCount = options.groupCount || 4;
  const periodStart = options.periodStart; // new
  const periodEnd = options.periodEnd; // new
  if (!commits || commits.length === 0) {
    return {
      commits: [],
      repositories: [],
      clusters: [],
      connections: [],
      period: period,
      metadata: {
        totalCommits: 0,
        totalRepositories: 0,
        totalClusters: 0,
        periodRange:
          periodStart && periodEnd
            ? {
                start: new Date(periodStart),
                end: new Date(periodEnd),
              }
            : null,
      },
    };
  }
  const uniqueRepos = [...new Set(commits.map((c) => c.repo))];
  const repoGroupings = assignRepositoryGroups(
    uniqueRepos,
    commits,
    groupCount
  );
  const clusters = identifyCommitClusters(commits, thresholdMinutes);
  const enhancedCommits = commits.map((commit) => {
    const cluster = clusters.find((c) =>
      c.commits.some((cc) => cc.sha === commit.sha)
    );
    return {
      ...commit,
      period: period,
      clusterId: cluster ? cluster.id : `single-${commit.sha}`,
      repoGroup: repoGroupings[commit.repo]?.group || "group0",
      repoShape: repoGroupings[commit.repo]?.shape || "circle",
      dayTimestamp: new Date(commit.date + "T00:00:00Z"),
      timeOfDay: extractTimeOfDay(commit.timestamp),
      commitSize: (commit.additions || 0) + (commit.deletions || 0),
    };
  });
  const repositoryMetadata = uniqueRepos.map((repo) => ({
    repo: repo,
    ...repoGroupings[repo],
    commitCount: commits.filter((c) => c.repo === repo).length,
    period: period,
  }));
  return {
    commits: enhancedCommits,
    repositories: repositoryMetadata,
    clusters: clusters,
    period: period,
    metadata: {
      totalCommits: commits.length,
      totalRepositories: uniqueRepos.length,
      totalClusters: clusters.length,
      periodRange:
        periodStart && periodEnd
          ? {
              start: new Date(periodStart),
              end: new Date(periodEnd),
            }
          : null,
      dateRange: {
        start: new Date(Math.min(...commits.map((c) => new Date(c.timestamp)))),
        end: new Date(Math.max(...commits.map((c) => new Date(c.timestamp)))),
      },
    },
  };
}

/**
 * Extract time of day component from timestamp for visualization
 * @param {string|Date} timestamp - Full timestamp
 * @returns {Date} - Date object with time component normalized to 2000-01-01
 */
function extractTimeOfDay(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return new Date(2000, 0, 1, hours, minutes, seconds);
}

/**
 * Calculate summary statistics for clusters
 * @param {Array} clusters - Array of cluster objects
 * @returns {Object} - Summary statistics
 */
export function calculateClusterStats(clusters) {
  if (!clusters || clusters.length === 0) {
    return {
      totalClusters: 0,
      averageClusterSize: 0,
      averageClusterDuration: 0,
      singleCommitClusters: 0,
      multiRepoClusters: 0,
    };
  }
  const clusterSizes = clusters.map((c) => c.commits.length);
  const clusterDurations = clusters.map((c) => c.duration || 0);
  const singleCommitClusters = clusters.filter(
    (c) => c.commits.length === 1
  ).length;
  const multiRepoClusters = clusters.filter(
    (c) => c.repositories.length > 1
  ).length;
  return {
    totalClusters: clusters.length,
    averageClusterSize:
      clusterSizes.reduce((a, b) => a + b, 0) / clusters.length,
    averageClusterDuration:
      clusterDurations.reduce((a, b) => a + b, 0) / clusters.length,
    maxClusterSize: Math.max(...clusterSizes),
    singleCommitClusters: singleCommitClusters,
    multiRepoClusters: multiRepoClusters,
    contextSwitchingRate: multiRepoClusters / clusters.length,
  };
}
