const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { NormalizeOutputSchema } = require("./schema");

const PROMPT_VERSION = "normalize-v1";
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "..", "prompts", PROMPT_VERSION + ".md"),
  "utf-8"
);

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  timeout: 30000,
  maxRetries: 0
});

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function extractJson(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

function isRetryableStatus(status) {
  if (status === undefined) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function callModel(messages) {
  var attempt = 0;
  var lastErr;

  while (attempt < 2) {
    try {
      var start = Date.now();
      var res = await client.chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0.2,
        messages: messages
      });
      var usage = res.usage || {};
      return {
        text: res.choices[0].message.content,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        durationMs: Date.now() - start
      };
    } catch (err) {
      lastErr = err;
      if (!isRetryableStatus(err.status) || attempt === 1) {
        throw err;
      }
      var delay = Math.pow(2, attempt) * 1000 + Math.random() * 250;
      await sleep(delay);
      attempt++;
    }
  }
  throw lastErr;
}

function logCost(entry) {
  entry.timestamp = new Date().toISOString();
  fs.appendFileSync(path.join(LOG_DIR, "ai-cost.jsonl"), JSON.stringify(entry) + "\n");
}

function logQuarantine(entry) {
  entry.timestamp = new Date().toISOString();
  fs.appendFileSync(path.join(LOG_DIR, "ai-quarantine.jsonl"), JSON.stringify(entry) + "\n");
}

function fallback() {
  return { canonical_title: "Other", confidence: 0, reason: "LLM disabled." };
}

function stub() {
  return NormalizeOutputSchema.parse({
    canonical_title: "Software Engineer",
    confidence: 0.5,
    reason: "Stub mode."
  });
}

async function normalize(text) {
  if (process.env.LLM_ENABLED === "false") {
    return fallback();
  }

  var baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text }
  ];

  var first = await callModel(baseMessages);
  var firstParsed = extractJson(first.text);
  var firstValid = firstParsed && NormalizeOutputSchema.safeParse(firstParsed);

  if (firstValid && firstValid.success) {
    logCost({
      prompt_version: PROMPT_VERSION,
      model: process.env.LLM_MODEL,
      input_tokens: first.inputTokens,
      output_tokens: first.outputTokens,
      duration_ms: first.durationMs,
      repaired: false
    });
    return firstValid.data;
  }

  var errMsg = firstValid ? firstValid.error.issues.map(function (i) { return i.message; }).join("; ") : "not valid JSON";

  var repairMessages = baseMessages.concat([
    { role: "assistant", content: first.text },
    { role: "user", content: "That was rejected: " + errMsg + ". Return corrected JSON only." }
  ]);

  var repaired = await callModel(repairMessages);
  var repairedParsed = extractJson(repaired.text);
  var repairedValid = repairedParsed && NormalizeOutputSchema.safeParse(repairedParsed);

  var combinedCost = {
    prompt_version: PROMPT_VERSION,
    model: process.env.LLM_MODEL,
    input_tokens: (first.inputTokens || 0) + (repaired.inputTokens || 0),
    output_tokens: (first.outputTokens || 0) + (repaired.outputTokens || 0),
    duration_ms: first.durationMs + repaired.durationMs,
    repaired: true
  };

  if (repairedValid && repairedValid.success) {
    logCost(combinedCost);
    return repairedValid.data;
  }

  logCost(combinedCost);
  logQuarantine({
    input: text,
    error: repairedValid ? repairedValid.error.issues.map(function (i) { return i.message; }).join("; ") : "not valid JSON",
    prompt_version: PROMPT_VERSION,
    raw_output: repaired.text
  });

  var err = new Error("Could not validate model output after repair");
  err.quarantined = true;
  throw err;
}

module.exports = { normalize: normalize, stub: stub };
