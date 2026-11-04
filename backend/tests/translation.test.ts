import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response as ExpressResponse } from "express";
import { translateMessage } from "../src/controllers/translation.controller.js";

const originalFetch = globalThis.fetch;
const originalEnv = { AI_BASE_URL: process.env.AI_BASE_URL, AI_API_KEY: process.env.AI_API_KEY, AI_MODEL: process.env.AI_MODEL };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function useProvider() {
  process.env.AI_BASE_URL = "https://provider.example.test/v1";
  process.env.AI_API_KEY = "translation-test-key";
  process.env.AI_MODEL = "test-model";
}

async function invoke(text: unknown) {
  const response = {
    code: 200,
    body: {} as Record<string, string>,
    status(code: number) { this.code = code; return this; },
    json(body: Record<string, string>) { this.body = body; return this; },
  };
  await translateMessage({ body: { text } } as Request, response as unknown as ExpressResponse);
  return response;
}

test("translation validates text and reports missing AI configuration before contacting the provider", async () => {
  globalThis.fetch = async () => { throw new Error("Must not contact provider"); };
  for (const text of [undefined, 123, "  ", "a".repeat(10001)]) assert.equal((await invoke(text)).code, 400);
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  const unavailable = await invoke("Hello!");
  assert.equal(unavailable.code, 503);
  assert.match(unavailable.body.error!, /configurada/);
});

test("translation preserves source content as data, uses backend credentials", async () => {
  useProvider();
  const text = "Hi John! Order #42 costs $50.\nSee https://example.com";
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://provider.example.test/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer translation-test-key");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, "test-model");
    assert.match(payload.messages[0].content, /português do Brasil/);
    assert.deepEqual(payload.messages[1], { role: "user", content: text });
    assert(init?.signal);
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Olá, John! Pedido #42 custa $50.\nVeja https://example.com" } }] });
  };
  const result = await invoke(text);
  assert.equal(result.code, 200);
  assert.equal(result.body.text, "Olá, John! Pedido #42 custa $50.\nVeja https://example.com");
});

test("provider failures, blocked or truncated output, and connection errors remain retryable", async () => {
  useProvider();
  const failures = [
    () => Response.json({ error: "quota" }, { status: 429 }),
    () => Response.json({ choices: [] }),
    () => Response.json({ choices: [{ finish_reason: "length", message: { content: "Partial" } }] }),
    () => Response.json({ choices: [{ finish_reason: "content_filter", message: { content: "Blocked" } }] }),
    () => { throw new DOMException("Timed out", "TimeoutError"); },
  ];
  for (const fail of failures) {
    globalThis.fetch = async () => fail();
    const result = await invoke("Hello!");
    assert.equal(result.code, 502);
    assert.equal(result.body.text, undefined);
    assert.match(result.body.error!, /Tente novamente/);
  }
});
