import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { prisma } from "../src/lib/prisma.js";
import { createSendPollHandler } from "../src/controllers/poll.controller.js";
import { extractPoll, normalizePoll } from "../src/utils/poll.js";
import { sendWhatsAppPoll } from "../src/services/evolution.service.js";

const poll = { question: "Qual horário?", options: ["Manhã", "Tarde"], selectableCount: 1 };

test("poll validation trims inputs and rejects duplicates, empty and excessive options", () => {
  assert.deepEqual(normalizePoll({ ...poll, question: " Qual horário? ", options: [" Manhã ", "Tarde"] }), poll);
  for (const invalid of [null, {}, { ...poll, question: " " }, { ...poll, options: ["Manhã"] }, { ...poll, options: ["Manhã", "manhã"] }, { ...poll, options: ["", "Tarde"] }, { ...poll, options: Array(13).fill("x") }, { ...poll, selectableCount: 0 }, { ...poll, selectableCount: 3 }, { ...poll, selectableCount: 1.5 }]) {
    assert.equal(normalizePoll(invalid), null);
  }
  for (const field of ["pollCreationMessage", "pollCreationMessageV2", "pollCreationMessageV3"]) {
    assert.deepEqual(extractPoll({ [field]: { name: poll.question, options: poll.options.map((optionName) => ({ optionName })), selectableOptionsCount: 1 } }), poll);
  }
  assert.equal(extractPoll({ pollCreationMessage: { options: [null] } }), null);
});

test("poll sending persists native metadata, emits once, and rejects invalid input before sending", async () => {
  const sent: unknown[] = [], emitted: unknown[] = [], writes: any[] = [];
  let fail = false;
  const database = {
    contact: { findUnique: async ({ where }: any) => where.id === 7 ? { id: 7, phone: "5511999999999", name: "Pessoa", isSaved: true, isGroup: false } : null },
    message: { upsert: async (query: any) => { writes.push(query); return { id: 9, ...query.create }; } },
  } as unknown as Pick<typeof prisma, "contact" | "message">;
  const handler = createSendPollHandler(database, async (number, input) => {
    sent.push({ number, input });
    if (fail) throw new Error("Falha simulada");
    return { key: { id: "poll-external" } };
  }, (payload) => { emitted.push(payload); });
  async function run(id: string, body: unknown) {
    const response = { code: 200, body: {} as any, status(value: number) { this.code = value; return this; }, json(value: unknown) { this.body = value; return this; } };
    await handler({ params: { id }, body, user: { id: "me" } } as unknown as Request, response as unknown as Response);
    return response;
  }
  assert.equal((await run("7", poll)).code, 201);
  assert.deepEqual(sent[0], { number: "5511999999999", input: poll });
  assert.equal(writes[0].create.type, "POLL");
  assert.deepEqual(writes[0].create.poll, poll);
  assert.equal(writes[0].create.sentByUserId, "me");
  assert.equal(emitted.length, 1);
  assert.equal((await run("bad", poll)).code, 400);
  assert.equal((await run("7", {})).code, 400);
  assert.equal((await run("8", poll)).code, 404);
  assert.equal(sent.length, 1);
  fail = true;
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal((await run("7", poll)).code, 502); }
  finally { console.error = originalError; }
  assert.equal(writes.length, 1);
  assert.equal(emitted.length, 1);
});

test("Evolution poll requests use the native endpoint and field names", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE"] as const;
  const previous = keys.map((key) => process.env[key]);
  process.env.EVOLUTION_API_URL = "https://evolution.invalid";
  process.env.EVOLUTION_API_KEY = "test-only";
  process.env.EVOLUTION_INSTANCE = "test";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://evolution.invalid/message/sendPoll/test");
    assert.deepEqual(JSON.parse(options!.body as string), { number: "5511999999999", name: poll.question, values: poll.options, selectableCount: 1 });
    return new Response(JSON.stringify({ key: { id: "poll" } }), { status: 201 });
  };
  try { await sendWhatsAppPoll("5511999999999", poll); }
  finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => { const value = previous[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  }
});
