import test from "node:test";
import assert from "node:assert/strict";
import { createBotProcessor } from "../src/services/bot-runtime.service.js";
import { fixture } from "./bot-fixture.js";
import type { prisma } from "../src/lib/prisma.js";
import { SAC_TEST_CATALOG } from '../src/services/bot-sac-test.js';

function harness() {
  const flow = fixture();
  const state = { sent: [] as string[], mediaSent: [] as any[], cachedMedia: [] as any[], outgoing: [] as any[], emitted: [] as unknown[], contactEvents: [] as unknown[], logs: new Map<number, Record<string, unknown>>(), session: null as any,
    contact: { id: 1, phone: "5511999999999", name: "Cliente", isGroup: false, blocked: false, assignments: [{ userId: "inforbot-id" }] as unknown[] },
    members: [{ userId: "inforbot-id", organizationId: "company-a", displayName: "Inforbot", user: { name: "Bot de atendimento" } }] as { userId: string; organizationId: string; displayName: string | null; user: { name: string } }[],
    message: { id: 1, contactId: 1, direction: "INCOMING", type: "TEXT", content: "Oi" }, failSend: false, imageAvailable: true,
    tickets: new Map<number, any>(), failTicketSave: false, publishedRevision: 1 };
  const db: any = {
    $queryRaw: async () => [],
    contactAssignment: { deleteMany: async ({ where }: any) => { state.contact.assignments = state.contact.assignments.filter((assignment: any) => assignment.userId !== where.userId); return { count: 1 }; } },
    contact: { findUniqueOrThrow: async () => state.contact },
    message: { findUnique: async () => state.message, upsert: async ({ create }: any) => { state.outgoing.push(create); return { id: 100, ...create }; } },
    messageMedia: { upsert: async ({ create }: any) => { state.cachedMedia.push(create); } },
    member: { findMany: async () => state.members },
    bot: { findFirst: async ({ where }: any) => where.organizationId === "company-a" ? { id: "bot-a", organizationId: "company-a", published: flow, publishedRevision: state.publishedRevision } : null },
    sacTestCompany: { findMany: async () => structuredClone(SAC_TEST_CATALOG) },
    sacTestTicket: { upsert: async ({ where, create }: any) => {
      if (state.failTicketSave) throw new Error('database unavailable');
      if (!state.tickets.has(where.startMessageId)) state.tickets.set(where.startMessageId, create);
      return state.tickets.get(where.startMessageId);
    } },
    botImage: { findFirst: async ({ where }: any) => state.imageAvailable && where.organizationId === "company-a" && where.id === "image-a" ? { data: new Uint8Array([1, 2, 3]), mimetype: "image/png", fileName: "foto.png" } : null },
    botSession: { findUnique: async () => state.session, upsert: async ({ create, update }: any) => { state.session = { ...(state.session ? { ...state.session, ...update } : create), updatedAt: new Date() }; } },
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
  const process = createBotProcessor(db as typeof prisma, async (_phone, text) => { state.sent.push(text); if (state.failSend) throw new Error("timeout"); return { key: { id: `sent-${state.sent.length}` } }; }, event => { state.emitted.push(event); }, async input => { state.mediaSent.push(input); if (state.failSend) throw new Error("timeout"); return { key: { id: `image-${state.mediaSent.length}` } }; }, event => { state.contactEvents.push(event); });
  return { state, process, flow };
}

process.env.EVOLUTION_INSTANCE = "test-instance";

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

test('SAC test: persists collection across revisions, saves once, and returns to menu', async () => {
  const { state, process, flow } = harness();
  flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  const inputs = ['Oi', '1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com', '1', 'Erro 123 no scanner', '1'];
  for (const [index, content] of inputs.entries()) {
    state.message = { ...state.message, id: index + 1, content };
    if (index === 5) state.publishedRevision++;
    await process(index + 1, 'test-instance');
    await process(index + 1, 'test-instance');
    if (index < inputs.length - 1) assert.equal(state.tickets.size, 0);
  }
  assert.equal(state.tickets.size, 1);
  const ticket = [...state.tickets.values()][0];
  assert.equal(ticket.organizationId, 'company-a');
  assert.equal(ticket.contactId, 1);
  assert.equal(ticket.startMessageId, 2);
  assert.equal(ticket.mode, 'TEST');
  assert.equal(ticket.data.equipmentLabel, 'SCANNER C240 (40PPM) | HD370664');
  assert.equal(ticket.data.description, 'Erro 123 no scanner');
  assert.equal(state.session.state.sacTest, undefined);
  assert.match(state.sent.at(-1)!, /Nenhum chamado foi aberto no SAC/);
  state.message = { ...state.message, id: 20, content: '0' };
  await process(20, 'test-instance');
  assert.match(state.sent.at(-1)!, /Assistente Infordoc/);
});

test('SAC test: saving failure retains review and a new confirmation retries safely', async () => {
  const { state, process, flow } = harness();
  flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  for (const [index, content] of ['Oi', '1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com', '1', 'Não liga'].entries()) {
    state.message = { ...state.message, id: index + 1, content };
    await process(index + 1, 'test-instance');
  }
  state.failTicketSave = true;
  state.message = { ...state.message, id: 11, content: '1' };
  await process(11, 'test-instance');
  assert.equal(state.tickets.size, 0);
  assert.equal(state.session.state.sacTest.step, 'review');
  assert.match(state.sent.at(-1)!, /Não foi possível salvar/);
  state.failTicketSave = false;
  state.message.id = 12;
  await process(12, 'test-instance');
  assert.equal(state.tickets.size, 1);
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
