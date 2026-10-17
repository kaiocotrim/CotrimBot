import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import type { Server } from "socket.io";
import { prisma } from "../src/lib/prisma.js";
import { setSocketServer } from "../src/lib/socket.js";
import webhookRoutes from "../src/routes/webhook.routes.js";
import { createPresenceUpdateHandler } from "../src/controllers/webhook.controller.js";
import { isPresenceEvent, parsePresenceUpdate, presenceDebug, presenceIdentifiers } from "../src/utils/whatsapp-presence.js";

const phone = "5511999999999@s.whatsapp.net";
const lid = "987654321@lid";

test("presence parses Evolution/Baileys maps, PN/LID aliases, devices, flat payloads and separate participants", () => {
  assert.equal(isPresenceEvent("PRESENCE_UPDATE"), true);
  assert.equal(isPresenceEvent("presence.update"), true);
  assert.equal(isPresenceEvent("presence-update"), true);
  assert.equal(isPresenceEvent("messages.upsert"), false);
  const parsed = parsePresenceUpdate({ id: "987654321:2@lid", presences: { [phone]: { lastKnownPresence: "recording" } } });
  assert.deepEqual(parsed.updates, [{ presence: "recording", jids: [phone, lid] }]);
  for (const presence of ["composing", "recording", "paused", "available", "unavailable"]) {
    assert.equal(parsePresenceUpdate({ key: { remoteJid: phone, remoteJidAlt: lid }, presence }).updates[0]?.presence, presence);
  }
  const multiple = parsePresenceUpdate({ id: phone, presences: { [phone]: { lastKnownPresence: "paused" }, [lid]: { lastKnownPresence: "composing" } } });
  assert.deepEqual(multiple.updates, [{ presence: "paused", jids: [phone] }, { presence: "composing", jids: [lid] }]);
  assert.equal(parsePresenceUpdate({ id: phone, presence: "invalid", status: " RECORDING " }).updates[0]?.presence, "recording");
});

test("presence ignores malformed payloads, groups and outgoing updates without guessing an identity", () => {
  assert.deepEqual(parsePresenceUpdate(null).ignored, ["invalid_payload"]);
  assert.deepEqual(parsePresenceUpdate({ id: "group@g.us", presences: { [phone]: { lastKnownPresence: "composing" } } }).ignored, ["group"]);
  assert.deepEqual(parsePresenceUpdate({ key: { fromMe: true, remoteJid: phone }, presence: "composing" }).ignored, ["self"]);
  assert.deepEqual(parsePresenceUpdate({ id: phone }).ignored, ["missing_status"]);
  assert.deepEqual(parsePresenceUpdate({ id: "5511999999999", presence: "composing" }).ignored, ["missing_jid"]);
  assert.equal(parsePresenceUpdate({ presences: { [lid]: { lastKnownPresence: "paused" } } }).updates[0]?.presence, "paused");
});

test("presence lookup never treats LID digits as a phone and skips missing or ambiguous contacts", async () => {
  const queries: any[] = [], events: any[] = [];
  let contacts = [{ id: 7 }];
  const database = { contact: { findMany: async (query: unknown) => { queries.push(query); return contacts; } } } as unknown as Pick<typeof prisma, "contact">;
  const handler = createPresenceUpdateHandler(database, event => events.push(event));
  await handler({ id: lid, presences: { [phone]: { lastKnownPresence: "recording" } } });
  assert.deepEqual(queries[0].where, { isGroup: false, OR: [{ phone: { in: ["5511999999999"] } }, { whatsappLid: { in: [lid] } }] });
  assert.deepEqual(events[0], { contactId: 7, presence: "recording", isTyping: false });
  await handler({ id: lid, presence: "composing" });
  assert.deepEqual(queries[1].where.OR[0].phone.in, []);
  assert.equal(events[1].isTyping, true);
  contacts = [];
  await handler({ id: phone, presence: "paused" });
  contacts = [{ id: 7 }, { id: 8 }];
  await handler({ id: phone, presence: "composing" });
  assert.equal(events.length, 2);
});

test("temporary presence diagnostics are opt-in and anonymize identifiers", () => {
  const previous = process.env.PRESENCE_DEBUG;
  const originalInfo = console.info;
  const logs: string[] = [];
  console.info = (...values) => { logs.push(values.join(" ")); };
  try {
    delete process.env.PRESENCE_DEBUG;
    presenceDebug("received", { count: 1 });
    assert.equal(logs.length, 0);
    process.env.PRESENCE_DEBUG = "true";
    const identifiers = presenceIdentifiers([phone, lid]);
    assert.deepEqual(presenceIdentifiers([phone, lid]), identifiers);
    presenceDebug("contact_not_found", { identifiers, presence: "recording" });
    assert.equal(logs.length, 1);
    assert.ok(!logs[0]!.includes("5511999999999") && !logs[0]!.includes("987654321"));
    assert.ok(logs[0]!.includes("contact_not_found"));
    for (let i = 0; i < 200; i++) presenceDebug("received");
    assert.ok(logs.length <= 120);
  } finally {
    console.info = originalInfo;
    if (previous === undefined) delete process.env.PRESENCE_DEBUG; else process.env.PRESENCE_DEBUG = previous;
  }
});

test("the existing webhook HTTP route accepts presence variants and returns 200 after emitting contact_presence", async () => {
  const originalFindMany = prisma.contact.findMany;
  const events: unknown[] = [];
  prisma.contact.findMany = (async () => [{ id: 42 }]) as typeof prisma.contact.findMany;
  setSocketServer({ emit: (...args: unknown[]) => events.push(args) } as unknown as Server);
  const app = express();app.use(express.json());app.use("/api", webhookRoutes);
  const server = createServer(app);
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();assert.ok(address && typeof address === "object");
    for (const event of ["presence.update", "PRESENCE_UPDATE", "presence-update"]) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/webhook/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, apikey: "must-not-be-logged", data: { id: lid, presences: { [phone]: { lastKnownPresence: "composing" } } } }) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { received: true });
    }
    assert.equal(events.length, 3);
    assert.deepEqual(events[0], ["contact_presence", { contactId: 42, presence: "composing", isTyping: true }]);
  } finally {
    prisma.contact.findMany = originalFindMany;
    setSocketServer(null as unknown as Server);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
