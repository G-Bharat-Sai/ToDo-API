const fs = require("fs");
const path = require("path");
const client = require("./client");
const { NormalizeOutputSchema } = require("./schema");
const { extractJson } = require("./parse");
const { logQuarantine } = require("./quarantine");

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

async function rawModelCall(messages) {
    const response = await client.chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0.2,
        messages: messages
    });

    return response.choices[0].message.content;
}

async function normalize(text) {
    const baseMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
    ];

    const firstAttempt = await rawModelCall(baseMessages);
    const firstParsed = extractJson(firstAttempt);
    const firstResult = firstParsed
        ? NormalizeOutputSchema.safeParse(firstParsed)
        : { success: false, error: { message: "Response was not valid JSON" } };

    if (firstResult.success) {
        return firstResult.data;
    }

    const errorMessage = firstResult.error.issues
        ? firstResult.error.issues.map(function (i) { return i.path.join(".") + ": " + i.message; }).join("; ")
        : firstResult.error.message;

    const repairMessages = baseMessages.concat([
        { role: "assistant", content: firstAttempt },
        {
            role: "user",
            content: "Your previous answer was rejected for this reason: " + errorMessage + ". Return only corrected JSON matching the schema."
        }
    ]);

    const repairAttempt = await rawModelCall(repairMessages);
    const repairParsed = extractJson(repairAttempt);
    const repairResult = repairParsed
        ? NormalizeOutputSchema.safeParse(repairParsed)
        : { success: false, error: { message: "Repaired response was not valid JSON" } };

    if (repairResult.success) {
        return repairResult.data;
    }

    const finalError = repairResult.error.issues
        ? repairResult.error.issues.map(function (i) { return i.path.join(".") + ": " + i.message; }).join("; ")
        : repairResult.error.message;

    logQuarantine({
        input: text,
        error: finalError,
        promptVersion: PROMPT_VERSION,
        rawOutput: repairAttempt
    });

    const err = new Error("Model output could not be validated after repair: " + finalError);
    err.isQuarantineFailure = true;
    throw err;
}

module.exports = { stubNormalize: stubNormalize, normalize: normalize };
