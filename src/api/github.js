const { Octokit } = require("@octokit/rest");
const { graphql } = require("@octokit/graphql");
const { GITHUB_TOKEN } = require("../config");

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${GITHUB_TOKEN}`,
  },
});

/**
 * Test GitHub API connection
 * @param {string} username - GitHub username
 * @returns {Promise<boolean>} - True if connection is successful
 */
async function testGitHubAPI(username) {
  try {
    console.log("Testing GitHub API connection...");
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`Successfully authenticated as: ${user.login}`);

    console.log("Testing GraphQL API connection...");
    try {
      const result = await graphqlWithAuth(`
        query {
          viewer {
            login
          }
        }
      `);
      console.log(
        `GraphQL test successful, authenticated as: ${result.viewer.login}`
      );
    } catch (graphqlError) {
      console.error("GraphQL API test failed:", graphqlError.message);
      if (graphqlError.errors) {
        console.error("GraphQL errors:", graphqlError.errors);
      }
      return false;
    }

    console.log("Testing commit search...");
    const searchResult = await octokit.search.commits({
      q: `author:${username}`,
    });
    console.log(`Found ${searchResult.data.total_count} total commits`);
    return true;
  } catch (error) {
    console.error("GitHub API test failed:", error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response body:`, error.response.data);
    }
    return false;
  }
}

module.exports = {
  octokit,
  graphqlWithAuth,
  testGitHubAPI,
};
