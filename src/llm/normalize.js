const fs = require("fs");
const path = require("path");
const { complete } = require("./providers");
const { NormalizeOutputSchema } = require("./schema");
const { extractJson } = require("./parse");
const { logQuarantine } = require("./quarantine");
const { withRetry } = require("./retry");
const { logCost } = require("./costLog");

const PROMPT_VERSION = "normalize-v1";
const PROMPT_PATH = path.join(__dirname, "..", "..", "prompts", PROMPT_VERSION + ".md");
const SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, "utf-8");

function stubNormalize(text) {
    const stubResponse = {
        canonical_title: "Software Engineer",
        confidence: 0.42,
        reason: "Stub response - LLM_STUB is enabled, no model was called."
    };

    return NormalizeOutputSchema.parse(stubResponse);
}

function fallbackNormalize(text) {
    return {
        canonical_title: "Other",
        confidence: 0,
        reason: "LLM is currently disabled; returning a safe default."
    };
}

// One retried, timed, logged call - now routed through the provider
// interface (complete()) instead of talking to an OpenAI-shaped
// client directly. normalize.js has no idea whether Ollama, the mock
// provider, or anything else is actually answering.
async function timedModelCall(userInput, priorMessages) {
    const start = Date.now();

    const result = await withRetry(function () {
        return complete(SYSTEM_PROMPT, userInput, priorMessages);
    }, 2);

    const durationMs = Date.now() - start;

    return {
        text: result.text,
        durationMs: durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
    };
}

async function normalize(text) {
    if (process.env.LLM_ENABLED === "false") {
        return fallbackNormalize(text);
    }

    const firstCall = await timedModelCall(text, []);
    const firstParsed = extractJson(firstCall.text);
    const firstResult = firstParsed
        ? NormalizeOutputSchema.safeParse(firstParsed)
        : { success: false, error: { message: "Response was not valid JSON" } };

    if (firstResult.success) {
        logCost({
            promptVersion: PROMPT_VERSION,
            model: process.env.LLM_PROVIDER === "mock" ? "mock" : process.env.LLM_MODEL,
            inputTokens: firstCall.inputTokens,
            outputTokens: firstCall.outputTokens,
            durationMs: firstCall.durationMs,
            repaired: false
        });
        return firstResult.data;
    }

    const errorMessage = firstResult.error.issues
        ? firstResult.error.issues.map(function (i) { return i.path.join(".") + ": " + i.message; }).join("; ")
        : firstResult.error.message;

    const repairPriorMessages = [
        { role: "assistant", content: firstCall.text },
        {
            role: "user",
            content: "Your previous answer was rejected for this reason: " + errorMessage + ". Return only corrected JSON matching the schema."
        }
    ];

    const repairCall = await timedModelCall(text, repairPriorMessages);
    const repairParsed = extractJson(repairCall.text);
    const repairResult = repairParsed
        ? NormalizeOutputSchema.safeParse(repairParsed)
        : { success: false, error: { message: "Repaired response was not valid JSON" } };

    const totalDurationMs = firstCall.durationMs + repairCall.durationMs;
    const totalInputTokens = (firstCall.inputTokens || 0) + (repairCall.inputTokens || 0);
    const totalOutputTokens = (firstCall.outputTokens || 0) + (repairCall.outputTokens || 0);

    if (repairResult.success) {
        logCost({
            promptVersion: PROMPT_VERSION,
            model: process.env.LLM_PROVIDER === "mock" ? "mock" : process.env.LLM_MODEL,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            durationMs: totalDurationMs,
            repaired: true
        });
        return repairResult.data;
    }

    const finalError = repairResult.error.issues
        ? repairResult.error.issues.map(function (i) { return i.path.join(".") + ": " + i.message; }).join("; ")
        : repairResult.error.message;

    logQuarantine({
        input: text,
        error: finalError,
        promptVersion: PROMPT_VERSION,
        rawOutput: repairCall.text
    });

    logCost({
        promptVersion: PROMPT_VERSION,
        model: process.env.LLM_PROVIDER === "mock" ? "mock" : process.env.LLM_MODEL,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: totalDurationMs,
        repaired: true
    });

    const err = new Error("Model output could not be validated after repair: " + finalError);
    err.isQuarantineFailure = true;
    throw err;
}

module.exports = { stubNormalize: stubNormalize, normalize: normalize };
