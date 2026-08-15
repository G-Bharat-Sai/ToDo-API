const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_PATH = path.join(LOG_DIR, "cost.jsonl");

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// One structured JSON line per model call - prompt version, model,
// token counts, duration, and whether a repair was needed. This is
// the actual answer to "how much will this cost at 10,000 a day" -
// you cannot manage what you do not measure.
function logCost(entryData) {
    const entry = {
        timestamp: new Date().toISOString(),
        prompt_version: entryData.promptVersion,
        model: entryData.model,
        input_tokens: entryData.inputTokens,
        output_tokens: entryData.outputTokens,
        duration_ms: entryData.durationMs,
        repaired: entryData.repaired
    };

    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

module.exports = { logCost: logCost };
