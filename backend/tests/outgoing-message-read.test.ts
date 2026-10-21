import assert from "node:assert/strict";
import test from "node:test";
import type { prisma } from "../src/lib/prisma.js";
import { createOutgoingMessageReadRecorder } from "../src/services/outgoing-message-read.service.js";

function fixture(available = true) {
  let readAt: Date | null = null;
  let queries = 0;
  const emitted: Array<{ messageId: number; readAt: Date }> = [];
  const database = { message: {
    findFirst: async ({ where }: any) => {
      queries++;
      assert.deepEqual(where, { externalId: "sent-id", direction: "OUTGOING", private: false, deletedAt: null, readAt: null });
      return available && !readAt ? { id: 7 } : null;
    },
    updateMany: async ({ where, data }: any) => {
      assert.deepEqual(where, { id: 7, readAt: null });
      if (readAt) return { count: 0 };
      readAt = data.readAt;
      return { count: 1 };
    },
  } } as unknown as Pick<typeof prisma, "message">;
  return { save: createOutgoingMessageReadRecorder(database, payload => emitted.push(payload)), emitted, queries: () => queries };
}

test("Evolution and native read/played statuses persist and notify the UI", async () => {
  for (const status of ["READ", "PLAYED", 4, 5, "4", "5"]) {
    for (const update of [{ keyId: "sent-id", status }, { key: { id: "sent-id", fromMe: true }, update: { status } }]) {
      const state = fixture();
      assert.equal(await state.save(update), true);
      assert.equal(state.emitted[0]?.messageId, 7);
      assert.ok(state.emitted[0]?.readAt instanceof Date);
    }
  }
});

test("individual read receipts confirm viewing; delivery and a single group reader do not", async () => {
  for (const remoteJid of ["5511999999999@s.whatsapp.net", "12345@lid"]) {
    for (const receipt of [{ readTimestamp: 1792584000 }, { readTimestamp: 0, playedTimestamp: 1792584001 }]) {
      const state = fixture();
      assert.equal(await state.save({ key: { id: "sent-id", fromMe: true, remoteJid }, receipt }), true);
    }
  }
  for (const update of [
    { keyId: "sent-id", status: "DELIVERY_ACK" },
    { keyId: "sent-id", status: 3 },
    { keyId: "sent-id", status: "SERVER_ACK" },
    { key: { id: "sent-id", remoteJid: "5511999999999@s.whatsapp.net" }, receipt: { receiptTimestamp: 1792584000 } },
    { key: { id: "sent-id", remoteJid: "12345@g.us" }, receipt: { readTimestamp: 1792584000 } },
    { key: { id: "sent-id", fromMe: false }, update: { status: 4 } },
    null,
  ]) {
    const state = fixture();
    assert.equal(await state.save(update), false);
    assert.equal(state.queries(), 0);
    assert.equal(state.emitted.length, 0);
  }
});

test("duplicate concurrent confirmations emit once and unavailable messages remain unchanged", async () => {
  const state = fixture();
  await Promise.all(Array.from({ length: 4 }, () => state.save({ keyId: "sent-id", status: "READ" })));
  assert.equal(state.emitted.length, 1);
  const unavailable = fixture(false);
  assert.equal(await unavailable.save({ keyId: "sent-id", status: "READ" }), false);
  assert.equal(unavailable.emitted.length, 0);
});
