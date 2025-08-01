import { octokit } from "../api/github.js";

/**
 * Check remaining rate limit and pause if necessary
 * @returns {Promise<boolean>} - True if safe to proceed, false if paused
 */
export async function checkRateLimit() {
  try {
    const { data } = await octokit.rateLimit.get();
    const remaining = data.resources.search.remaining;
    const resetTime = data.resources.search.reset * 1000;
    console.log(
      `Search API rate limit: ${remaining} requests remaining, resets at ${new Date(
        resetTime
      ).toISOString()}`
    );
    if (remaining < 5) {
      const waitTime = resetTime - Date.now() + 1000;
      console.log(
        `Rate limit low (${remaining} remaining), pausing for ${waitTime}ms until reset...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return false;
    }
    return true;
  } catch (error) {
    console.log(
      `Error checking rate limit, proceeding cautiously:`,
      error.message
    );
    return true;
  }
}

/**
 * Utility function to retry API calls with exponential backoff
 * @param {Function} fn - The API call function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Result of the API call
 */
export async function withRetry(fn, maxRetries = 5, baseDelay = 5000) {
  let lastError;
  try {
    return await fn();
  } catch (error) {
    lastError = error;
    if (error.status === 403 && error.message.includes("rate limit exceeded")) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let delay = baseDelay * Math.pow(2, attempt - 1);
        if (error.response?.headers?.["x-ratelimit-reset"]) {
          const resetTime =
            parseInt(error.response.headers["x-ratelimit-reset"]) * 1000;
          const now = Date.now();
          delay = Math.max(resetTime - now, delay);
        }
        console.log(
          `Rate limit hit, retrying (${attempt}/${maxRetries}) after ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          return await fn();
        } catch (retryError) {
          lastError = retryError;
          if (
            !(
              retryError.status === 403 &&
              retryError.message.includes("rate limit exceeded")
            )
          ) {
            throw retryError;
          }
        }
      }
      console.error(
        `Failed to recover from rate limit after ${maxRetries} attempts:`,
        lastError.message
      );
      throw lastError;
    }
    throw error;
  }
}
