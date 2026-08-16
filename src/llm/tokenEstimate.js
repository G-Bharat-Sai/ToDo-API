// gemma3 has no official tiktoken encoding, so this is a standard
// approximation: ~4 characters per token for English text. Not
// exact, but the point is catching an obviously oversized request
// BEFORE spending a call, not billing precision.
const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

module.exports = { estimateTokens };