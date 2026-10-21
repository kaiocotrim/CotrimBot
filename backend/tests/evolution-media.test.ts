import assert from "node:assert/strict";
import test from "node:test";
import { sendWhatsAppMedia } from "../src/services/evolution.service.js";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  url: process.env.EVOLUTION_API_URL,
  key: process.env.EVOLUTION_API_KEY,
  instance: process.env.EVOLUTION_INSTANCE,
};

test("envia mídia Base64 como Data URL para a Evolution", async () => {
  process.env.EVOLUTION_API_URL = "https://evolution.example";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE = "test-instance";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { media: string };
    assert.equal(body.media, "data:image/png;base64,AQID");
    return Response.json({ key: { id: "message-id" } });
  };

  try {
    await sendWhatsAppMedia({
      number: "5511999999999",
      mediatype: "image",
      mimetype: "image/png",
      media: "AQID",
      fileName: "foto.png",
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      EVOLUTION_API_URL: originalEnvironment.url,
      EVOLUTION_API_KEY: originalEnvironment.key,
      EVOLUTION_INSTANCE: originalEnvironment.instance,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
