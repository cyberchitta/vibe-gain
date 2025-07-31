/**
 * Generate UTC hour-of-day histogram from commits
 * @param {Array} commits - All commits
 * @returns {Array} - Array of 24 counts (index = UTC hour)
 */
function generateUTCHourHistogram(commits) {
  const hourCounts = new Array(24).fill(0);
  commits.forEach((commit) => {
    const utcHour = new Date(commit.timestamp).getUTCHours();
    hourCounts[utcHour]++;
  });
  return hourCounts;
}

/**
 * Find the longest stretch of low activity to determine coding day start
 * @param {Array} histogram - 24-hour activity counts
 * @returns {Object} - { start_hour, length, confidence }
 */
function findActivityValley(histogram) {
  const minActivity = Math.min(...histogram);
  const threshold = minActivity + (Math.max(...histogram) - minActivity) * 0.2; // 20% above minimum
  let bestValley = { start_hour: 4, length: 0, confidence: 0 };
  for (let start = 0; start < 24; start++) {
    let length = 0;
    for (let i = 0; i < 24; i++) {
      const hour = (start + i) % 24;
      if (histogram[hour] <= threshold) {
        length++;
      } else {
        break;
      }
    }
    if (length > bestValley.length) {
      bestValley = { start_hour: start, length, confidence: length / 24 };
    }
  }
  return bestValley;
}

/**
 * Infer coding day start from commit activity patterns
 * @param {Array} commits - All commits
 * @returns {Object} - { day_cutoff, confidence, histogram }
 */
export function inferCodingDayStart(commits) {
  if (commits.length === 0) {
    return { day_cutoff: 4, confidence: 0, histogram: new Array(24).fill(0) };
  }
  const histogram = generateUTCHourHistogram(commits);
  const valley = findActivityValley(histogram);
  const day_cutoff = Math.floor((valley.start_hour + valley.length / 2)) % 24;
  return {
    day_cutoff,
    confidence: valley.confidence,
    histogram
  };
}