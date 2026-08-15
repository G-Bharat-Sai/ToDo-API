// A second, deliberately trivial "provider" - proves the complete()
// interface is genuinely provider-agnostic, since this implementation
// shares zero code with the Ollama one and still satisfies the same
// contract. Not meant for real answers - it is intentionally dumb.
async function complete(systemPrompt, userInput, priorMessages) {
    const text = JSON.stringify({
        canonical_title: "Other",
        confidence: 0.1,
        reason: "Mock provider - always returns Other."
    });

    return {
        text: text,
        inputTokens: Math.ceil((systemPrompt.length + userInput.length) / 4),
        outputTokens: Math.ceil(text.length / 4)
    };
}

module.exports = { complete: complete };
