const fs = require("fs");
const path = require("path");
const client = require("./client");
const { NormalizeOutputSchema } = require("./schema");

const PROMPT_PATH = path.join(__dirname, "..", "..", "prompts", "normalize-v1.md");
const SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, "utf-8");

// Stage 1: stub mode only. When LLM_STUB=1, this returns a fixed,
// schema-valid object without ever calling the model — lets the
// route, validation, and error handling all get built and tested
// with zero API calls and zero cost.
function stubNormalize(text) {
    const stubResponse = {
        canonical_title: "Software Engineer",
        confidence: 0.42,
        reason: "Stub response — LLM_STUB is enabled, no model was called."
    };

    // Even the stub goes through the real schema check, so a typo in
    // the stub itself would be caught the same way a bad model answer
    // would be — the stub is meant to exercise the real contract.
    return NormalizeOutputSchema.parse(stubResponse);
}

// Stage 2: real model call. Returns the raw text the model replied
// with — Stage 3 will add parsing, validation, and repair on top of
// this. For now we just want to see real answers with our own eyes.
async function callModel(text) {
    const response = await client.chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0.2, // low, since we want the same answer for the same input, not creativity
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            // The user's actual data goes in its own message, never
            // glued into the system prompt — keeps a wall between our
            // instructions and their content.
            { role: "user", content: text }
        ]
    });

    return response.choices[0].message.content;
}

module.exports = { stubNormalize, callModel };