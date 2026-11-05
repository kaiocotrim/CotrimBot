import test from "node:test";
import assert from "node:assert/strict";
import { createBotProcessor } from "../src/services/bot-runtime.service.js";
import { fixture } from "./bot-fixture.js";
import type { prisma } from "../src/lib/prisma.js";
import { SAC_TEST_CATALOG } from '../src/services/bot-sac-test.js';

// Runtime imports load the local .env. Keep demo tests independent of real SAC
// credentials; the SDK test below configures its own mocked connection.
delete process.env.SAC_BASE_URL;
delete process.env.SAC_API_TOKEN;
delete process.env.SAC_TOKEN;

function harness() {
  const flow = fixture();
  const state = { sent: [] as string[], mediaSent: [] as any[], storedMedia: [] as any[], cachedMedia: [] as any[], outgoing: [] as any[], emitted: [] as unknown[], contactEvents: [] as unknown[], logs: new Map<number, Record<string, unknown>>(), session: null as any,
    contact: { id: 1, phone: "5511999999999", name: "Cliente", isGroup: false, blocked: false, assignments: [{ userId: "inforbot-id" }] as unknown[] },
    members: [{ userId: "inforbot-id", organizationId: "company-a", displayName: "Inforbot", user: { name: "Bot de atendimento" } }] as { userId: string; organizationId: string; displayName: string | null; user: { name: string } }[],
    message: { id: 1, contactId: 1, direction: "INCOMING", type: "TEXT", content: "Oi" }, failSend: false, failCatalog: false, imageAvailable: true,
    contacts: new Map<number, any>(), sessions: new Map<number, any>(),
    tickets: new Map<number, any>(), submissions: new Map<number, any>(), failTicketSave: false, publishedRevision: 1 };
  const db: any = {
    $queryRaw: async () => [],
    contactAssignment: { deleteMany: async ({ where }: any) => { state.contact.assignments = state.contact.assignments.filter((assignment: any) => assignment.userId !== where.userId); return { count: 1 }; } },
    contact: { findUniqueOrThrow: async ({ where }: any) => where.id === 1 ? state.contact : state.contacts.get(where.id) },
    message: { findUnique: async () => state.message, upsert: async ({ create }: any) => { state.outgoing.push(create); return { id: 100, ...create }; } },
    messageMedia: { upsert: async ({ create }: any) => { state.cachedMedia.push(create); } },
    member: { findMany: async () => state.members },
    bot: { findFirst: async ({ where }: any) => (where.OR ? where.OR.some((filter: any) => filter.organizationId === "company-a" && filter.published.equals === flow.assignedUserId) : where.organizationId === "company-a") ? { id: "bot-a", organizationId: "company-a", published: flow, publishedRevision: state.publishedRevision } : null },
    sacTestCompany: { findMany: async () => { if (state.failCatalog) throw new Error("catalog unavailable"); return structuredClone(SAC_TEST_CATALOG); } },
    botSacSubmission: {
      findUnique: async ({ where }: any) => state.submissions.get(where.startMessageId) ?? null,
      create: async ({ data }: any) => { if (state.submissions.has(data.startMessageId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' }); state.submissions.set(data.startMessageId, structuredClone(data)); return data; },
      update: async ({ where, data }: any) => state.submissions.set(where.startMessageId, { ...state.submissions.get(where.startMessageId), ...data }),
    },
    sacTestTicket: { upsert: async ({ where, create }: any) => {
      if (state.failTicketSave) throw new Error('database unavailable');
      if (!state.tickets.has(where.startMessageId)) state.tickets.set(where.startMessageId, create);
      return state.tickets.get(where.startMessageId);
    } },
    botImage: { findFirst: async ({ where }: any) => state.imageAvailable && where.organizationId === "company-a" && where.id === "image-a" ? { data: new Uint8Array([1, 2, 3]), mimetype: "image/png", fileName: "foto.png" } : null },
    botSession: {
      findUnique: async ({ where }: any) => where.instance_contactId.contactId === 1 ? state.session : state.sessions.get(where.instance_contactId.contactId),
      upsert: async ({ where, create, update }: any) => {
        const id = where.instance_contactId.contactId;
        const previous = id === 1 ? state.session : state.sessions.get(id);
        const saved = { ...(previous ? { ...previous, ...update } : create), updatedAt: new Date() };
        if (id === 1) state.session = saved; else state.sessions.set(id, saved);
      },
    },
    botExecutionLog: {
      findUnique: async ({ where }: any) => state.logs.get(where.messageId) ?? null,
      create: async ({ data }: any) => { if (state.logs.has(data.messageId)) throw new Error("duplicate"); state.logs.set(data.messageId, data); },
      // Model the MySQL snapshot: Prisma update cannot read the independently
      // inserted claim, while a direct UPDATE can write the committed row.
      update: async () => { throw new Error("P2025: claim not visible in transaction snapshot"); },
      updateMany: async ({ where, data }: any) => {
        if (!state.logs.has(where.messageId)) return { count: 0 };
        state.logs.set(where.messageId, { ...state.logs.get(where.messageId), ...data });
        return { count: 1 };
      },
      upsert: async ({ where, create, update }: any) => state.logs.set(where.messageId, state.logs.has(where.messageId) ? { ...state.logs.get(where.messageId), ...update } : create),
    },
  };
  let queue = Promise.resolve();
  db.$transaction = (fn: any) => { const next = queue.then(() => fn(db)); queue = next.catch(() => {}); return next; };
  const createProcess = () => createBotProcessor(db as typeof prisma, async (_phone, text) => { state.sent.push(text); if (state.failSend) throw new Error("timeout"); return { key: { id: `sent-${state.sent.length}` } }; }, event => { state.emitted.push(event); }, async input => { state.mediaSent.push(input); if (state.failSend) throw new Error("timeout"); return { key: { id: `image-${state.mediaSent.length}` } }; }, event => { state.contactEvents.push(event); }, async (data, mimetype) => { state.storedMedia.push({ size: data.byteLength, mimetype }); return `media/test-${state.storedMedia.length}`; });
  const restart = () => createProcess();
  return { state, process: createProcess(), flow, restart };
}

process.env.EVOLUTION_INSTANCE = "test-instance";

test('SAC SDK GET resolves CNPJ in the real runtime, preserves progress on failure and skips GET on cancellation', async () => {
  const previousEnv = { SAC_BASE_URL: process.env.SAC_BASE_URL, SAC_API_TOKEN: process.env.SAC_API_TOKEN };
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let unavailable = false;
  process.env.SAC_BASE_URL = 'https://sac.example.com';
  process.env.SAC_API_TOKEN = 'test-token';
  globalThis.fetch = async (url, options) => {
    requests.push(String(url));
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-token');
    if (unavailable) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify([{ valido: true, IdTenant: 'tenant-sdk', TenantName: 'Empresa SDK' }]));
  };
  try {
    const { state, process, flow } = harness();
    flow.menus[0]!.options[0]!.action = 'SAC_TEST';
    for (const [index, content] of ['Oi', '1', '05.540.238/0001-23'].entries()) {
      state.message = { ...state.message, id: index + 1, content };
      await process(index + 1, 'test-instance');
    }
    assert.deepEqual(requests, ['https://sac.example.com/api/check-tenant?cnpj=05540238000123']);
    assert.equal(state.session.state.sacTest.data.companyId, 'tenant-sdk');
    assert.match(state.sent.at(-1)!, /Empresa SDK/);
    await process(3, 'test-instance'); assert.equal(requests.length, 1);
    state.message = { ...state.message, id: 4, content: '2' }; await process(4, 'test-instance');
    unavailable = true;
    state.message = { ...state.message, id: 5, content: '05540238000123' }; await process(5, 'test-instance');
    assert.equal(state.session.state.sacTest.step, 'cnpj');
    assert.match(state.sent.at(-1)!, /Não foi possível consultar o SAC/);
    state.message = { ...state.message, id: 6, content: 'cancelar' }; await process(6, 'test-instance');
    assert.equal(state.session.state.sacTest, undefined); assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("an explicitly selected member runs the bot without the Inforbot name", async () => {
  const { state, process, flow } = harness();
  flow.assignedUserId = "tech-id";
  state.members = [{ userId: "tech-id", organizationId: "company-a", displayName: "Técnico", user: { name: "Kaio" } }];
  state.contact.assignments = [{ userId: "tech-id" }];
  await process(1, "test-instance");
  assert.equal(state.sent.length, 1);
  state.message = { ...state.message, id: 2, content: "1" };
  await process(2, "test-instance");
  assert.match(state.sent[1]!, /sac.infordoc.com.br/);
});

test("an explicit assignment never falls back to another member or organization", async () => {
  for (const assignedUserId of ["other-member", ""]) {
    const { state, process, flow } = harness();
    flow.assignedUserId = assignedUserId;
    await process(1, "test-instance");
    assert.equal(state.sent.length, 0);
  }
  const { state, process, flow } = harness();
  flow.assignedUserId = "tech-id";
  state.members = [{ userId: "tech-id", organizationId: "other-company", displayName: "Técnico", user: { name: "Kaio" } }];
  state.contact.assignments = [{ userId: "tech-id" }];
  await process(1, "test-instance");
  assert.equal(state.sent.length, 0);
});

test("runtime persists and emits replies, handles simultaneous duplicates and sends the configured option", async () => {
  const { state, process } = harness();
  await Promise.all([process(1, "test-instance"), process(1, "test-instance")]);
  assert.equal(state.sent.length, 1); assert.equal(state.emitted.length, 1);
  state.message = { ...state.message, id: 2, content: "1" };
  await process(2, "test-instance"); assert.match(state.sent[1]!, /sac.infordoc.com.br/);
  state.message = { ...state.message, id: 3, content: "0" };
  await process(3, "test-instance"); assert.match(state.sent[2]!, /Assistente Infordoc/);
});

test("independently committed claims complete and option 2 continues the saved menu", async () => {
  const { state, process, flow } = harness();
  flow.menus[0]!.options.find(option => option.number === "2")!.active = true;
  flow.menus[0]!.options.find(option => option.number === "2")!.response = "Resposta da opção 2";
  await process(1, "test-instance");
  assert.equal(state.logs.get(1)?.outcome, "SENT");
  assert.equal(state.session.status, "BOT_ACTIVE");
  state.message = { ...state.message, id: 2, content: "2" };
  await process(2, "test-instance");
  assert.equal(state.logs.get(2)?.outcome, "SENT");
  assert.equal(state.sent[1], "Resposta da opção 2\n\n0 — Voltar");
  assert.equal(state.emitted.length, 2);
});

test("inactive bot, other instance/organization, groups, outgoing messages and assignments suppress automation", async () => {
  for (const variant of ["inactive", "instance", "organization", "group", "outgoing", "assigned", "blocked"] as const) {
    const { state, process } = harness();
    if (variant === "inactive") state.members = [];
    if (variant === "organization") state.members = [{ userId: "inforbot-id", organizationId: "company-b", displayName: "Inforbot", user: { name: "Inforbot" } }];
    if (variant === "group") state.contact.isGroup = true;
    if (variant === "outgoing") state.message.direction = "OUTGOING";
    if (variant === "assigned") { state.contact.assignments = [{ userId: "tech" }]; state.members = []; }
    if (variant === "blocked") state.contact.blocked = true;
    await process(1, variant === "instance" ? "different" : "test-instance");
    assert.equal(state.sent.length, 0, variant);
  }
});

test("assignment to Inforbot enables the published flow", async () => {
  const { state, process } = harness();
  state.contact.assignments = [{ userId: "inforbot-id" }];
  await process(1, "test-instance");
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0]!, /Assistente Infordoc/);
  assert.deepEqual((state.emitted[0] as any).contact.assignedUserIds, ["inforbot-id"]);
});

test("a new Inforbot assignment restarts an old paused session and continues the menu", async () => {
  for (const status of ["WAITING_HUMAN", "HUMAN_ACTIVE", "CLOSED"]) {
    const { state, process } = harness();
    state.session = { status, updatedAt: new Date("2026-10-21T10:00:00Z") };
    state.contact.assignments = [{ userId: "inforbot-id", assignedAt: new Date("2026-10-21T11:00:00Z") }];
    await process(1, "test-instance");
    assert.match(state.sent[0]!, /Assistente Infordoc/, status);
    state.session.updatedAt = new Date("2026-10-21T11:01:00Z");
    state.message = { ...state.message, id: 2, content: "1" };
    await process(2, "test-instance");
    assert.match(state.sent[1]!, /sac.infordoc.com.br/, status);
  }
});

test("media starts service once, but does not select menu options", async () => {
  const { state, process } = harness();
  state.message.type = "IMAGE";
  await process(1, "test-instance");
  await process(1, "test-instance");
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0]!, /Assistente Infordoc/);
  state.message.id = 2;
  await process(2, "test-instance");
  assert.equal(state.sent.length, 1);
  state.message = { ...state.message, id: 3, type: "TEXT", content: "1" };
  await process(3, "test-instance");
  assert.match(state.sent[1]!, /sac.infordoc.com.br/);
});

test("human transfer stays paused until a new assignment and unassigned chats stay silent", async () => {
  const { state, process } = harness();
  state.session = { status: "WAITING_HUMAN", updatedAt: new Date("2026-10-21T11:00:00Z") };
  state.contact.assignments = [{ userId: "inforbot-id", assignedAt: new Date("2026-10-21T10:00:00Z") }];
  await process(1, "test-instance");
  assert.equal(state.sent.length, 0);
  state.contact.assignments = [];
  state.members = [];
  state.session = null;
  await process(1, "test-instance");
  assert.equal(state.sent.length, 0);
});

test("Inforbot is also recognized by the account name when display name is empty", async () => {
  const { state, process } = harness();
  state.members[0]!.displayName = " ";
  state.members[0]!.user.name = " InforBot ";
  await process(1, "test-instance");
  assert.match(state.sent[0]!, /Assistente Infordoc/);
});

test("Inforbot account with an Administrator display name starts and continues the published flow", async () => {
  const { state, process } = harness();
  state.members[0]!.displayName = "Administrador";
  state.members[0]!.user.name = "Inforbot";
  await process(1, "test-instance");
  assert.match(state.sent[0]!, /Assistente Infordoc/);
  state.message = { ...state.message, id: 2, content: "1" };
  await process(2, "test-instance");
  assert.match(state.sent[1]!, /sac.infordoc.com.br/);
  assert.deepEqual((state.emitted[1] as any).contact.assignedUserIds, ["inforbot-id"]);
});

test("human transfer stays paused; clearing session requires reassignment to Inforbot to restart", async () => {
  const { state, process } = harness();
  for (const [i, content] of ["Oi", "3", "4", "1"].entries()) { state.message = { ...state.message, id: i + 1, content }; await process(i + 1, "test-instance"); }
  assert.equal(state.session.status, "WAITING_HUMAN"); assert.equal(state.sent.length, 3);
  state.session.status = "HUMAN_ACTIVE";
  state.message.id = 5; await process(5, "test-instance"); assert.equal(state.sent.length, 3);
  state.session = null;
  // O encerramento limpa responsáveis. É a nova atribuição ao Inforbot que habilita o bot.
  state.contact.assignments = [{ userId: 'inforbot-id' }];
  state.message.id = 6; await process(6, "test-instance"); await process(6, "test-instance");
  assert.equal(state.sent.length, 4); assert.match(state.sent[3]!, /Assistente Infordoc/);
});

test('SAC test: persists through restart and revision, ignores duplicates and never creates tickets', async () => {
  const h = harness(); const { state, flow } = h;
  flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  const inputs = ['Oi', '1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com'];
  for (const [index, content] of inputs.entries()) {
    state.message = { ...state.message, id: index + 1, content };
    if (index === 5) state.publishedRevision++;
    const worker = index < 4 ? h.process : h.restart();
    await worker(index + 1, 'test-instance'); await worker(index + 1, 'test-instance');
    assert.equal(state.tickets.size, 0);
  }
  assert.equal(state.session.state.sacTest.step, 'nextStep');
  assert.equal(state.session.state.sacTest.data.email, 'teste@example.com'); assert.equal(state.sent.length, inputs.length);
  state.message = { ...state.message, id: 20, content: 'cancelar' }; await h.process(20, 'test-instance'); assert.equal(state.session.state.sacTest, undefined);
});
test('SAC test: catalog failure retains progress and cancellation needs no catalog', async () => {
  const { state, process, flow } = harness(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  for (const [index, content] of ['Oi', '1'].entries()) { state.message = { ...state.message, id: index + 1, content }; await process(index + 1, 'test-instance'); }
  state.failCatalog = true; state.message = { ...state.message, id: 3, content: '05540238000123' }; await process(3, 'test-instance');
  assert.equal(state.session.state.sacTest.step, 'cnpj'); assert.match(state.sent.at(-1)!, /base de teste/);
  state.failCatalog = false; state.message.id = 4; await process(4, 'test-instance'); assert.equal(state.session.state.sacTest.step, 'confirmCnpj');
  state.failCatalog = true; state.message = { ...state.message, id: 5, content: '0' }; await process(5, 'test-instance'); assert.equal(state.session.state.sacTest, undefined);
});

test('SAC test: media is explained without advancing; expired collection returns to menu', async () => {
  const { state, process, flow } = harness();
  flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  for (const [index, content] of ['Oi', '1'].entries()) {
    state.message = { ...state.message, id: index + 1, content };
    await process(index + 1, 'test-instance');
  }
  state.message = { ...state.message, id: 3, type: 'DOCUMENT', content: 'arquivo.pdf' };
  await process(3, 'test-instance');
  assert.match(state.sent.at(-1)!, /envie uma resposta em texto/);
  assert.equal(state.session.state.sacTest.step, 'cnpj');
  state.session.updatedAt = new Date('2020-01-01');
  state.message = { ...state.message, id: 4, type: 'TEXT', content: '05540238000123' };
  await process(4, 'test-instance');
  assert.equal(state.session.state.sacTest, undefined);
  assert.match(state.sent.at(-1)!, /expirou por inatividade/);
  assert.equal(state.tickets.size, 0);
});

test("ambiguous Evolution failures are recorded and never retried on duplicate delivery", async () => {
  const { state, process } = harness(); state.failSend = true;
  await process(1, "test-instance"); await process(1, "test-instance");
  assert.equal(state.sent.length, 1); assert.equal(state.logs.get(1)?.outcome, "FAILED_OR_UNCERTAIN");
  assert.equal(state.emitted.length, 0);
});

test("image greetings and option photos use media, persist image bytes and keep menu navigation", async () => {
  const { state, process, flow } = harness();
  flow.menus[0]!.imageId = "image-a";
  const option = flow.menus[0]!.options[0]!;
  option.action = "IMAGE"; option.imageId = "image-a"; option.response = "Legenda da foto";
  await process(1, "test-instance");
  await process(1, "test-instance");
  assert.equal(state.mediaSent.length, 1);
  assert.equal(state.mediaSent[0].media, "AQID");
  assert.equal(state.mediaSent[0].caption, undefined);
  assert.match(state.sent[0]!, /Assistente Infordoc/);
  assert.equal(state.outgoing[0].type, "TEXT");
  assert.equal(state.outgoing[1].type, "IMAGE");
  assert.equal(state.cachedMedia[0].mimetype, "image/png");
  assert.equal(state.cachedMedia[0].data, null);
  assert.equal(state.cachedMedia[0].storageKey, "media/test-1");
  assert.deepEqual(state.storedMedia[0], { size: 3, mimetype: "image/png" });
  assert.equal(state.logs.get(1)?.outcome, "SENT");
  state.message = { ...state.message, id: 2, content: "1" };
  await process(2, "test-instance");
  assert.match(state.sent[1]!, /Legenda da foto/);
  state.message = { ...state.message, id: 3, content: "0" };
  await process(3, "test-instance");
  assert.equal(state.mediaSent.length, 3);
  assert.match(state.sent[2]!, /Assistente Infordoc/);
  assert.equal(state.emitted.length, 6);
});

test("missing/foreign images and ambiguous media failures do not send or retry photos", async () => {
  for (const missing of [true, false]) {
    const { state, process, flow } = harness();
    flow.menus[0]!.imageId = "image-a";
    state.imageAvailable = !missing; state.failSend = !missing;
    await process(1, "test-instance"); await process(1, "test-instance");
    assert.equal(state.mediaSent.length, 0);
    assert.equal(state.logs.get(1)?.outcome, "FAILED_OR_UNCERTAIN");
    assert.equal(state.emitted.length, 0);
  }
});

test('SAC test: concurrent contacts use independent persisted sessions', async () => {
  const { state, process, flow } = harness(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  state.contacts.set(2, { ...structuredClone(state.contact), id: 2, phone: '5527999999999' });
  let id = 100;
  for (const content of ['Oi', '1', '05540238000123', '1', 'NAME', 'PHONE', '1', 'EMAIL']) {
    const pending = [1, 2].map(contactId => {
      const text = content === 'NAME' ? (contactId === 1 ? 'Pessoa Um' : 'Pessoa Dois') : content === 'PHONE' ? (contactId === 1 ? '27999999999' : '11988888888') : content === 'EMAIL' ? (contactId === 1 ? 'um@example.com' : 'dois@example.com') : content;
      state.message = { ...state.message, id: ++id, contactId, content: text };
      return process(id, 'test-instance');
    });
    await Promise.all(pending);
  }
  assert.equal(state.session.contactId, 1); assert.equal(state.sessions.get(2).contactId, 2);
  assert.equal(state.session.state.sacTest.data.email, 'um@example.com');
  assert.equal(state.sessions.get(2).state.sacTest.data.email, 'dois@example.com');
  assert.equal(state.session.state.sacTest.data.phone, '27999999999');
  assert.equal(state.sessions.get(2).state.sacTest.data.phone, '11988888888');
});

test('SAC test: a send failure retains collected data; a new answer resumes without replaying duplicates', async () => {
  const { state, process, flow } = harness(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  for (const [index, content] of ['Oi', '1', '05540238000123', '1', 'Pessoa Teste'].entries()) {
    state.message = { ...state.message, id: index + 1, content }; await process(index + 1, 'test-instance');
  }
  const saved = structuredClone(state.session.state);
  state.failSend = true; state.message = { ...state.message, id: 6, content: '27999999999' };
  await process(6, 'test-instance'); await process(6, 'test-instance');
  assert.deepEqual(state.session.state, saved); assert.equal(state.logs.get(6)?.outcome, 'FAILED_OR_UNCERTAIN');
  state.failSend = false; state.message.id = 7; await process(7, 'test-instance');
  assert.equal(state.session.state.sacTest.step, 'address');
  assert.equal(state.session.state.sacTest.data.requester, 'Pessoa Teste');
  state.message = { ...state.message, id: 8, type: 'DOCUMENT', content: 'arquivo.pdf' };
  await process(8, 'test-instance');
  assert.equal(state.session.state.sacTest.step, 'address');
  assert.match(state.sent.at(-1)!, /envie uma resposta em texto/);
  assert.match(state.sent.at(-1)!, /1 — RODOVIA BR-262/);
});


test('real WhatsApp flow posts once after confirmation and recovers its protocol after a send failure', async () => {
  const originalFetch = globalThis.fetch;
  const savedUrl = process.env.SAC_BASE_URL;
  const savedToken = process.env.SAC_API_TOKEN;
  process.env.SAC_BASE_URL = 'https://sac.example.com'; process.env.SAC_API_TOKEN = 'test-token';
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/check-tenant') return new Response(JSON.stringify([{ valido: true, IdTenant: 'tenant-a', TenantName: 'Empresa SDK' }]));
    if (path === '/api/tenants/register/tenant-a') return new Response(JSON.stringify([{ IdCliente: 1, ativo: true, cnpj: '05540238000123', endereco: 'Rua A', numero: '10', enderecosEntrega: [] }]));
    if (path === '/api/maquinas') return new Response(JSON.stringify([{ IdEstoque: 123, Descricao: ['Scanner', 'Serie A'] }]));
    assert.equal(path, '/api/newTicket'); assert.equal(options?.method, 'POST'); posts++;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.IdTenant, 'tenant-a'); assert.equal(body.IdEstoque, 123);
    assert.equal(body.Motivo, 'Scanner nao liga');
    return new Response(JSON.stringify([{ Protocolo: 12345 }]));
  };
  try {
    const { state, process, flow, restart } = harness(); flow.menus[0]!.options[0]!.action = 'SAC_TICKET';
    const inputs = ['Oi', '1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com', '1', 'Administrativo', 'Scanner nao liga'];
    for (const [index, content] of inputs.entries()) { state.message = { ...state.message, id: index + 1, content }; await process(index + 1, 'test-instance'); }
    assert.equal(state.session.state.sacTest.step, 'review'); assert.equal(posts, 0);
    state.failSend = true; state.message = { ...state.message, id: 12, content: '1' }; await process(12, 'test-instance');
    assert.equal(posts, 1); assert.equal(state.submissions.get(2).protocol, '12345');
    assert.equal(state.session.state.sacTest.step, 'review');
    state.failSend = false; state.message.id = 13; await restart()(13, 'test-instance');
    assert.equal(posts, 1); assert.equal(state.session.state.sacTest, undefined);
    assert.match(state.sent.at(-1)!, /12345/);
    await process(13, 'test-instance'); assert.equal(posts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.SAC_BASE_URL; else process.env.SAC_BASE_URL = savedUrl;
    if (savedToken === undefined) delete process.env.SAC_API_TOKEN; else process.env.SAC_API_TOKEN = savedToken;
  }
});
