/**
 * Create proper date range parameters for GitHub API queries
 * @param {string} startDateStr - Start date in YYYY-MM-DD format
 * @param {string} endDateStr - End date in YYYY-MM-DD format
 * @returns {Object} - Object with properly formatted date parameters
 */
export function createDateRange(startDateStr, endDateStr) {
  const startDate = new Date(startDateStr);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(endDateStr);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(0, 0, 0, 0);
  return {
    startDate,
    endDate,
    sinceISOString: startDate.toISOString(),
    untilISOString: endDate.toISOString(),
    sinceQueryDate: startDate.toISOString().split("T")[0],
    untilQueryDate: endDate.toISOString().split("T")[0],
  };
}
