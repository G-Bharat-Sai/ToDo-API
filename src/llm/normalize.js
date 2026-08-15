const { NormalizeOutputSchema } = require("./schema");

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

module.exports = { stubNormalize };
