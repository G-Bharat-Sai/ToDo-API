const fs = require("fs");
const path = require("path");
const client = require("./client");
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

// Fallback returned by the kill switch (LLM_ENABLED=false) - safe,
// deterministic, and instant. No model call, no cost, no risk.
function fallbackNormalize(text) {
    return {
        canonical_title: "Other",
        confidence: 0,
        reason: "LLM is currently disabled; returning a safe default."
    };
}

// One retried, timed, logged call to the model. Retry policy (which
// errors are worth retrying) lives in retry.js; this function is just
// responsible for timing the call and logging what it cost.
async function timedModelCall(messages) {
    const start = Date.now();

    const response = await withRetry(function () {
        return client.chat.completions.create({
            model: process.env.LLM_MODEL,
            temperature: 0.2,
            messages: messages
        });
    }, 2);

    const durationMs = Date.now() - start;
    const usage = response.usage || {};

    return {
        text: response.choices[0].message.content,
        durationMs: durationMs,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens
    };
}

async function normalize(text) {
    // Kill switch: skip the model entirely, return a safe fallback,
    // zero model calls, zero log lines. This is the thing someone who
    // is not you needs to be able to flip without a deploy the day
    // the provider has an outage or the bill spikes.
    if (process.env.LLM_ENABLED === "false") {
        return fallbackNormalize(text);
    }

    const baseMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
    ];

    const firstCall = await timedModelCall(baseMessages);
    const firstParsed = extractJson(firstCall.text);
    const firstResult = firstParsed
        ? NormalizeOutputSchema.safeParse(firstParsed)
        : { success: false, error: { message: "Response was not valid JSON" } };

    if (firstResult.success) {
        logCost({
            promptVersion: PROMPT_VERSION,
            model: process.env.LLM_MODEL,
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

    const repairMessages = baseMessages.concat([
        { role: "assistant", content: firstCall.text },
        {
            role: "user",
            content: "Your previous answer was rejected for this reason: " + errorMessage + ". Return only corrected JSON matching the schema."
        }
    ]);

    const repairCall = await timedModelCall(repairMessages);
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
            model: process.env.LLM_MODEL,
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
        model: process.env.LLM_MODEL,
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
