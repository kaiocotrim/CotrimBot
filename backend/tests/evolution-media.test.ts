import assert from "node:assert/strict";
import test from "node:test";
import { sendWhatsAppMedia } from "../src/services/evolution.service.js";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  url: process.env.EVOLUTION_API_URL,
  key: process.env.EVOLUTION_API_KEY,
  instance: process.env.EVOLUTION_INSTANCE,
};

test("envia GIF MP4 com reprodução animada explícita", { concurrency: false }, async () => {
  process.env.EVOLUTION_API_URL = "https://evolution.example";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE = "test-instance";
  globalThis.fetch = async (_input, init) => {
    assert.equal(String(_input), "https://evolution.example/message/sendGif/test-instance");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.media, "data:video/mp4;base64,AQID");
    assert.equal(body.gifPlayback, true);
    assert.equal(body.mediatype, "video");
    return Response.json({ key: { id: "gif-message" } });
  };
  try {
    await sendWhatsAppMedia({ number: "5511999999999", mediatype: "video", mimetype: "video/mp4", media: "AQID", fileName: "gif-test.mp4", gifPlayback: true });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ EVOLUTION_API_URL: originalEnvironment.url, EVOLUTION_API_KEY: originalEnvironment.key, EVOLUTION_INSTANCE: originalEnvironment.instance })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("não envia GIF como vídeo quando a Evolution não oferece a rota nativa", { concurrency: false }, async () => {
  process.env.EVOLUTION_API_URL = "https://evolution.example";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE = "test-instance";
  const urls: string[] = [];
  globalThis.fetch = async (input) => { urls.push(String(input)); return new Response("not found", { status: 404 }); };
  try {
    await assert.rejects(sendWhatsAppMedia({ number: "5511999999999", mediatype: "video", mimetype: "video/mp4", media: "AQID", fileName: "gif-test.mp4", gifPlayback: true }), /Recompile e publique o serviço Evolution/);
    assert.deepEqual(urls, ["https://evolution.example/message/sendGif/test-instance"]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ EVOLUTION_API_URL: originalEnvironment.url, EVOLUTION_API_KEY: originalEnvironment.key, EVOLUTION_INSTANCE: originalEnvironment.instance })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("envia mídia como Data URL para a Evolution", { concurrency: false }, async () => {
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

test("tenta Base64 puro quando a Evolution rejeita a Data URL", { concurrency: false }, async () => {
  process.env.EVOLUTION_API_URL = "https://evolution.example";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE = "test-instance";
  let attempts = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { media: string };
    attempts += 1;
    if (attempts === 1) {
      assert.equal(body.media, "data:image/png;base64,AQID");
      return new Response("formato inválido", { status: 400 });
    }
    assert.equal(body.media, "AQID");
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
    assert.equal(attempts, 2);
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


test("encaminha bytes de áudio pela rota WhatsApp e propaga rejeições", { concurrency: false }, async () => {
  process.env.EVOLUTION_API_URL = "https://evolution.example";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE = "test-instance";
  let reject = false;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://evolution.example/message/sendWhatsAppAudio/test-instance");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.number, "5511999999999");
    assert.ok(["data:audio/ogg;base64,AQID", "AQID"].includes(body.audio));
    assert.equal(body.media, undefined);
    return reject ? new Response("audio rejected", { status: 500 }) : Response.json({ key: { id: "audio-message" } });
  };
  const input = { number: "5511999999999", mediatype: "audio" as const, mimetype: "audio/ogg", media: "AQID", fileName: "audio.ogg" };
  try {
    assert.equal((await sendWhatsAppMedia(input)).key.id, "audio-message");
    reject = true;
    await assert.rejects(sendWhatsAppMedia(input), /audio rejected/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ EVOLUTION_API_URL: originalEnvironment.url, EVOLUTION_API_KEY: originalEnvironment.key, EVOLUTION_INSTANCE: originalEnvironment.instance })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
