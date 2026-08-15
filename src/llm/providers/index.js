// The one place that decides which provider implementation is
// active, based on the LLM_PROVIDER environment variable. Every
// other file in this codebase calls complete(...) without knowing
// or caring which provider is actually behind it - same pattern as
// lib/repository.js choosing SQLite vs Postgres.
const provider = process.env.LLM_PROVIDER || "ollama";

const impl = provider === "mock"
    ? require("./mock")
    : require("./ollama");

module.exports = { complete: impl.complete };
