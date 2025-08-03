/**
 * Convert UTC timestamp to local time with user's timezone offset
 * @param {string|Date} timestamp - UTC timestamp
 * @param {number} timezoneOffsetHours - User's timezone offset in hours (e.g., 5.5 for UTC+5:30)
 * @returns {Date} - Local time Date object
 */
export function toLocalTime(timestamp, timezoneOffsetHours) {
  const utcDate = new Date(timestamp);
  const offsetMs = timezoneOffsetHours * 60 * 60 * 1000;
  return new Date(utcDate.getTime() + offsetMs);
}

/**
 * Get local coding day string with 4am cutoff
 * @param {string|Date} timestamp - UTC timestamp
 * @param {Object} userConfig - User configuration with timezone_offset_hours and day_boundary
 * @returns {string} - Local coding day in YYYY-MM-DD format
 */
export function getLocalCodingDay(timestamp, userConfig) {
  const { timezone_offset_hours, day_boundary = 4 } = userConfig;
  const localTime = toLocalTime(timestamp, timezone_offset_hours);
  const codingDayMs =
    localTime.getTime() - day_boundary * 60 * 60 * 1000;
  const codingDay = new Date(codingDayMs);
  return codingDay.toISOString().split("T")[0];
}

/**
 * Get local hour of day as decimal (including minutes) for hour-based analysis
 * @param {string|Date} timestamp - UTC timestamp
 * @param {number} timezoneOffsetHours - User's timezone offset in hours
 * @returns {number} - Local hour as decimal (e.g., 14.5 for 2:30 PM)
 */
export function getLocalHourDecimal(timestamp, timezoneOffsetHours) {
  const utcDate = new Date(timestamp);
  const utcHours = utcDate.getUTCHours();
  const utcMinutes = utcDate.getUTCMinutes();
  const localHourDecimal = utcHours + utcMinutes / 60 + timezoneOffsetHours;
  return ((localHourDecimal % 24) + 24) % 24;
}

/**
 * Get local hour of day for hour-based analysis
 * @param {string|Date} timestamp - UTC timestamp
 * @param {number} timezoneOffsetHours - User's timezone offset in hours
 * @returns {number} - Local hour (0-23)
 */
export function getLocalHour(timestamp, timezoneOffsetHours) {
  const utcDate = new Date(timestamp);
  const utcHours = utcDate.getUTCHours();
  const localHours = (utcHours + timezoneOffsetHours) % 24;
  return Math.floor(localHours);
}

/**
 * Check if two timestamps are in the same coding day
 * @param {string|Date} timestamp1 - First UTC timestamp
 * @param {string|Date} timestamp2 - Second UTC timestamp
 * @param {Object} userConfig - User configuration
 * @returns {boolean} - Whether timestamps are in same coding day
 */
export function isSameCodingDay(timestamp1, timestamp2, userConfig) {
  const day1 = getLocalCodingDay(timestamp1, userConfig);
  const day2 = getLocalCodingDay(timestamp2, userConfig);
  return day1 === day2;
}
