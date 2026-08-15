const OpenAI = require("openai");

// Explicit timeout - the SDK defaults to 10 minutes, which is not a
// real timeout for an HTTP endpoint. 30 seconds is generous for a
// small local model and still fails fast enough to be useful.
// maxRetries: 0 because we implement our own retry policy explicitly
// below (see retry.js) rather than relying on the SDK's silent
// default of retrying twice - a bad key would otherwise be retried
// pointlessly before we ever see the real error.
const client = new OpenAI({
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    timeout: 30000,
    maxRetries: 0
});

module.exports = client;
