import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { chatCompletion, isAiConfigured } from "../src/lib/ai-client.js";

const originalFetch = globalThis.fetch;
const originalEnv = { AI_BASE_URL: process.env.AI_BASE_URL, AI_API_KEY: process.env.AI_API_KEY, AI_MODEL: process.env.AI_MODEL };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("AI client is configured by base URL and model; API key is optional for local providers", () => {
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  assert.equal(isAiConfigured(), false);
  process.env.AI_BASE_URL = "http://localhost:11434/v1";
  process.env.AI_MODEL = "llama3";
  delete process.env.AI_API_KEY;
  assert.equal(isAiConfigured(), true);
});

test("AI client posts to the configured base URL without an Authorization header when no key is set", async () => {
  process.env.AI_BASE_URL = "http://localhost:11434/v1/";
  process.env.AI_MODEL = "llama3";
  delete process.env.AI_API_KEY;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "http://localhost:11434/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "  Oi  " } }] });
  };
  assert.deepEqual(await chatCompletion("system", "user", { temperature: 0, maxTokens: 10 }), { text: "Oi", finishReason: "stop" });
});

test("AI client rejects non-OK provider responses", async () => {
  process.env.AI_BASE_URL = "https://provider.example.test/v1";
  process.env.AI_MODEL = "test-model";
  globalThis.fetch = async () => Response.json({ error: "down" }, { status: 500 });
  await assert.rejects(chatCompletion("system", "user", { temperature: 0, maxTokens: 10 }), /status 500/);
});
