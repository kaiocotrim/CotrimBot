import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createContactPhoneInspector } from "../src/services/contact-phone.service.js";
import { createContactPhoneCheckHandler, createContactRegistrationHandler } from "../src/controllers/contact-registration.controller.js";
import { checkWhatsAppNumber } from "../src/services/evolution.service.js";

const phone = "5511932075075";
const record = (patch = {}) => ({ id: 1, phone, name: "Kaio", isSaved: true, isGroup: false, companyName: "Empresa", jobTitle: null, assignments: [], ...patch });

function response() {
  const state = { status: 200, body: null as any };
  const res = { status(code: number) { state.status = code; return this; }, json(value: unknown) { state.body = value; return this; }, setHeader() { return this; } } as unknown as Response;
  return { state, res };
}

test("saved duplicate is returned without needing a working WhatsApp connection", async () => {
  let calls = 0;
  const inspect = createContactPhoneInspector({
    database: { contact: { findFirst: async () => record() } } as never,
    checkWhatsApp: async () => { calls++; throw new Error("Offline"); },
  });
  const result = await inspect(phone);
  assert.equal(result.contact?.name, "Kaio");
  assert.equal(result.contact?.isSaved, true);
  assert.equal(result.whatsapp, null);
  assert.equal(calls, 0);
});

test("canonical WhatsApp number finds an existing registration with a different ninth-digit representation", async () => {
  const canonical = "551132075075";
  const inspect = createContactPhoneInspector({
    database: { contact: { findFirst: async ({ where }: any) => where.phone.in.includes(canonical) ? record({ phone: canonical }) : null } } as never,
    checkWhatsApp: async () => ({ exists: true, phone: canonical }),
  });
  const result = await inspect(phone);
  assert.equal(result.contact?.id, 1);
  assert.equal(result.phone, canonical);
});

function registration(options: { saved?: boolean; exists?: boolean; offline?: boolean; race?: string; unsaved?: boolean } = {}) {
  const writes: unknown[] = [], events: unknown[] = [];
  const handler = createContactRegistrationHandler({
    database: { contact: {
      create: async (data: any) => { if (options.race) throw { code: options.race }; writes.push(data); return record(data.data); },
      update: async (data: any) => { if (options.race) throw { code: options.race }; writes.push(data); return record(data.data); },
    } } as never,
    inspect: async () => {
      if (options.offline) throw new Error("Offline");
      return { phone, whatsapp: options.exists !== false, contact: options.saved || options.unsaved ? { ...record({ isSaved: Boolean(options.saved) }), assignedUserIds: [], unreadCount: 0, assignments: undefined } as never : null };
    },
    emit: (event, data) => events.push({ event, data }),
  });
  return { writes, events, async run() {
    const { state, res } = response();
    await handler({ body: { name: "Novo nome", phone, companyName: "Empresa" } } as Request, res);
    return state;
  } };
}

test("registration rejects saved duplicates without overwriting their data", async () => {
  const app = registration({ saved: true });
  assert.equal((await app.run()).status, 409);
  assert.deepEqual(app.writes, []);
  assert.deepEqual(app.events, []);
});

test("registration distinguishes missing WhatsApp from connection failure and writes neither", async () => {
  for (const [options, expected] of [[{ exists: false }, 400], [{ offline: true }, 502]] as const) {
    const app = registration(options);
    assert.equal((await app.run()).status, expected);
    assert.deepEqual(app.writes, []);
    assert.deepEqual(app.events, []);
  }
});

test("registration saves verified new and unsaved contacts, then broadcasts", async () => {
  for (const options of [{}, { unsaved: true }]) {
    const app = registration(options);
    const result = await app.run();
    assert.equal(result.status, 200);
    assert.equal(result.body.name, "Novo nome");
    assert.equal(result.body.isSaved, true);
    assert.equal(app.writes.length, 1);
    assert.equal(app.events.length, 1);
    if (options.unsaved) assert.deepEqual((app.writes[0] as any).where, { id: 1, isSaved: false });
  }
});

test("a simultaneous registration cannot overwrite the other user's contact", async () => {
  for (const options of [{ race: "P2002" }, { race: "P2025", unsaved: true }]) {
    const app = registration(options);
    assert.equal((await app.run()).status, 409);
    assert.deepEqual(app.writes, []);
    assert.deepEqual(app.events, []);
  }
});

test("preflight rejects invalid phone numbers and treats verification errors as temporary", async () => {
  const handler = createContactPhoneCheckHandler(async () => { throw new Error("Offline"); });
  for (const [number, status] of [["abc", 400], [phone, 502]] as const) {
    const { state, res } = response();
    await handler({ body: { phone: number } } as Request, res);
    assert.equal(state.status, status);
  }
});

test("Evolution lookup sends one international number and validates existence responses", async t => {
  const old = { url: process.env.EVOLUTION_API_URL, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE };
  process.env.EVOLUTION_API_URL = "https://evolution.test/";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE = "test instance";
  t.after(() => {
    for (const [name, value] of Object.entries({ EVOLUTION_API_URL: old.url, EVOLUTION_API_KEY: old.key, EVOLUTION_INSTANCE: old.instance })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  let payload: unknown = [{ exists: true, number: phone, jid: "551132075075@s.whatsapp.net" }];
  let status = 200;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://evolution.test/chat/whatsappNumbers/test%20instance");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { numbers: [phone] });
    return globalThis.Response.json(payload, { status });
  });
  assert.deepEqual(await checkWhatsAppNumber(phone), { exists: true, phone: "551132075075" });
  payload = [{ exists: false, number: phone }];
  assert.deepEqual(await checkWhatsAppNumber(phone), { exists: false, phone });
  for (const invalid of [[], {}, [{ exists: "false", number: phone }], [{ exists: true, number: phone, jid: "123@lid" }], [{ exists: true, number: "other", jid: `${phone}@s.whatsapp.net` }]]) {
    payload = invalid;
    await assert.rejects(checkWhatsAppNumber(phone));
  }
  status = 503;
  await assert.rejects(checkWhatsAppNumber(phone));
});
