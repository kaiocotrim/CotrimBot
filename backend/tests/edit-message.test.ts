import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createEditMessageHandler } from "../src/controllers/edit-message.controller.js";
import { editWhatsAppMessage } from "../src/services/evolution.service.js";

function setup(overrides: Record<string, unknown> = {}, fails = false) {
  const message = { id: 7, content: "Original", direction: "OUTGOING", type: "TEXT", createdAt: new Date(), externalId: "wa-original", private: false, deletedAt: null, contact: { isGroup: false, phone: "5511999999999", whatsappLid: "123@lid" }, ...overrides };
  const edits: unknown[] = [], saved: unknown[] = [], events: unknown[] = [];
  const handler = createEditMessageHandler({
    database: { message: {
      findUnique: async () => message,
      update: async ({ data }: { data: object }) => { saved.push(data); return { ...message, ...data }; },
    } } as never,
    sendEdit: async data => { edits.push(data); if (fails) throw new Error("Offline"); },
    emit: (event, data) => events.push({ event, data }),
  });
  let status = 200;
  let body: any;
  const res = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } } as Response;
  const run = async (text: unknown = "Corrigida", authenticated = true) => {
    await handler({ params: { id: "7" }, body: { text }, user: authenticated ? { id: "user" } : undefined } as unknown as Request, res);
    return { status, body };
  };
  return { run, edits, saved, events };
}

test("edits the original WhatsApp message before saving and notifying other clients", async () => {
  const state = setup();
  const result = await state.run("  Corrigida  ");
  assert.equal(result.status, 200);
  assert.deepEqual(state.edits, [{ remoteJid: "123@lid", id: "wa-original", text: "Corrigida" }]);
  assert.equal(result.body.content, "Corrigida");
  assert.ok(result.body.editedAt instanceof Date);
  assert.equal(state.events.length, 1);
  assert.equal((state.events[0] as any).event, "message_edited");
});

test("preserves group JIDs", async () => {
  const state = setup({ contact: { isGroup: true, phone: "123@g.us" } });
  await state.run();
  assert.equal((state.edits[0] as any).remoteJid, "123@g.us");
});

test("rejects received, deleted, private, media and expired messages without changing them", async () => {
  for (const override of [{ direction: "INCOMING" }, { deletedAt: new Date() }, { private: true }, { externalId: "private:7" }, { type: "IMAGE" }, { createdAt: new Date(Date.now() - 15 * 60_000) }]) {
    const state = setup(override);
    assert.equal((await state.run()).status, 400);
    assert.equal(state.edits.length, 0);
    assert.equal(state.saved.length, 0);
  }
});

test("rejects empty text and unauthenticated requests and skips unchanged content", async () => {
  assert.equal((await setup().run(" ")).status, 400);
  assert.equal((await setup().run("a", false)).status, 401);
  const state = setup();
  assert.equal((await state.run("Original")).status, 200);
  assert.equal(state.edits.length, 0);
});

test("does not save or broadcast when WhatsApp rejects the edit", async () => {
  const state = setup({}, true);
  assert.equal((await state.run()).status, 502);
  assert.equal(state.saved.length, 0);
  assert.equal(state.events.length, 0);
});

test("Evolution adapter sends the edit key, destination and text", async () => {
  const oldFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  try {
    process.env.EVOLUTION_API_URL = "https://evolution.test";
    process.env.EVOLUTION_API_KEY = "test-key";
    process.env.EVOLUTION_INSTANCE = "test";
    globalThis.fetch = (async (url, options) => {
      assert.equal(url, "https://evolution.test/chat/updateMessage/test");
      assert.equal(options?.method, "POST");
      assert.deepEqual(JSON.parse(options?.body as string), { number: "123@g.us", key: { remoteJid: "123@g.us", fromMe: true, id: "wa-id" }, text: "Corrigida" });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await editWhatsAppMessage({ remoteJid: "123@g.us", id: "wa-id", text: "Corrigida" });
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE"]) {
      if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
    }
  }
});
