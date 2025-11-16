export function toLocalTime(timestamp, timezoneOffsetHours) {
  const utcDate = new Date(timestamp);
  const offsetMs = timezoneOffsetHours * 60 * 60 * 1000;
  return new Date(utcDate.getTime() + offsetMs);
}

/**
 * Get local coding day string
 * @param {string|Date} timestamp - UTC timestamp
 * @param {Object} tzConfig - Timezone config with offsetHours and boundaryHour
 * @returns {string} - Local coding day in YYYY-MM-DD format
 */
export function getLocalCodingDay(timestamp, tzConfig) {
  const utcDate = new Date(timestamp);
  const codingDayMs =
    utcDate.getTime() - tzConfig.boundaryHour * 60 * 60 * 1000;
  const codingDay = new Date(codingDayMs);
  return codingDay.toISOString().split("T")[0];
}

/**
 * Get local hour of day as decimal
 * @param {string|Date} timestamp - UTC timestamp
 * @param {Object} tzConfig - Timezone config with offsetHours
 * @returns {number} - Local hour as decimal (e.g., 14.5 for 2:30 PM)
 */
export function getLocalHourDecimal(timestamp, tzConfig) {
  const utcDate = new Date(timestamp);
  const utcHours = utcDate.getUTCHours();
  const utcMinutes = utcDate.getUTCMinutes();
  const localHourDecimal = utcHours + utcMinutes / 60 + tzConfig.offsetHours;
  return ((localHourDecimal % 24) + 24) % 24;
}

/**
 * Get local hour of day (integer)
 * @param {string|Date} timestamp - UTC timestamp
 * @param {Object} tzConfig - Timezone config with offsetHours
 * @returns {number} - Local hour (0-23)
 */
export function getLocalHour(timestamp, tzConfig) {
  return Math.floor(getLocalHourDecimal(timestamp, tzConfig));
}

/**
 * Check if two timestamps are in the same coding day
 * @param {string|Date} timestamp1 - First UTC timestamp
 * @param {string|Date} timestamp2 - Second UTC timestamp
 * @param {Object} tzConfig - Timezone config
 * @returns {boolean} - Whether timestamps are in same coding day
 */
export function isSameCodingDay(timestamp1, timestamp2, tzConfig) {
  const day1 = getLocalCodingDay(timestamp1, tzConfig);
  const day2 = getLocalCodingDay(timestamp2, tzConfig);
  return day1 === day2;
}
