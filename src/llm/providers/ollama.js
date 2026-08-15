const OpenAI = require("openai");

// Ollama speaks the OpenAI-compatible chat completions shape, so this
// implementation is just that call, wrapped to match the interface
// every provider must expose: complete(systemPrompt, userInput) ->
// { text, inputTokens, outputTokens }.
const client = new OpenAI({
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    timeout: 30000,
    maxRetries: 0
});

async function complete(systemPrompt, userInput, priorMessages) {
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput }
    ].concat(priorMessages || []);

    const response = await client.chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0.2,
        messages: messages
    });

    const usage = response.usage || {};

    return {
        text: response.choices[0].message.content,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens
    };
}

module.exports = { complete: complete };
