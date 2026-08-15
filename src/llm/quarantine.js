const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_PATH = path.join(LOG_DIR, "quarantine.jsonl");

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logQuarantine(entryData) {
    const entry = {
        timestamp: new Date().toISOString(),
        input: entryData.input,
        error: entryData.error,
        prompt_version: entryData.promptVersion,
        raw_output: entryData.rawOutput
    };

    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

module.exports = { logQuarantine };
