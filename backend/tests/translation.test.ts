import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response as ExpressResponse } from "express";
import { translateMessage } from "../src/controllers/translation.controller.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

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

test("translation validates text and reports missing AI configuration before contacting Gemini", async () => {
  globalThis.fetch = async () => { throw new Error("Must not contact provider"); };
  for (const text of [undefined, 123, "  ", "a".repeat(10001)]) assert.equal((await invoke(text)).code, 400);
  delete process.env.GEMINI_API_KEY;
  const unavailable = await invoke("Hello!");
  assert.equal(unavailable.code, 503);
  assert.match(unavailable.body.error!, /configurada/);
});

test("translation preserves source content as data, uses backend credentials, and excludes model reasoning", async () => {
  process.env.GEMINI_API_KEY = "translation-test-key";
  const text = "Hi John! Order #42 costs $50.\nSee https://example.com";
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/generativelanguage.googleapis.com\//);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "translation-test-key");
    const payload = JSON.parse(String(init?.body));
    assert.match(payload.systemInstruction.parts[0].text, /português do Brasil/);
    assert.equal(payload.contents[0].parts[0].text, text);
    assert(init?.signal);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private reasoning" }, { text: "Olá, John! Pedido #42 custa $50.\n" }, { text: "Veja https://example.com" }] } }] });
  };
  const result = await invoke(text);
  assert.equal(result.code, 200);
  assert.equal(result.body.text, "Olá, John! Pedido #42 custa $50.\nVeja https://example.com");
});

test("provider failures, blocked or truncated output, and connection errors remain retryable", async () => {
  process.env.GEMINI_API_KEY = "translation-test-key";
  const failures = [
    () => Response.json({ error: "quota" }, { status: 429 }),
    () => Response.json({ candidates: [] }),
    () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Partial" }] } }] }),
    () => Response.json({ candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "Blocked" }] } }] }),
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
