import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { createAnnouncementRouter } from "../src/routes/announcement.routes.js";
import { announcementRecipients, announcementPreviewToken } from "../src/services/announcement-policy.js";
import { sendScheduledMessage } from "../src/services/scheduled-message.service.js";
import { prisma } from "../src/lib/prisma.js";
import { randomUUID } from "node:crypto";

const contact = (id: number, patch = {}) => ({ id, name: `Contato ${id}`, phone: `552799999${String(id).padStart(4, "0")}`, companyName: "Infordoc", blocked: false, isGroup: false, ...patch });

test("destinatários: empresa exata, sem bloqueados, grupos, números inválidos ou duplicados", () => {
  const result = announcementRecipients(" INFORDOC ", [contact(1), contact(2, { blocked: true }), contact(3, { isGroup: true }), contact(4, { phone: "123" }), contact(5, { companyName: "Outra" }), contact(6, { phone: contact(1).phone })]);
  assert.deepEqual(result.recipients.map((item) => item.id), [1]);
  assert.equal(result.excluded, 4);
});

type RecordData = Record<string, unknown>;
function matches(record: RecordData, where: RecordData): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as RecordData[]).every((item) => matches(record, item));
    if (key === "OR") return (value as RecordData[]).some((item) => matches(record, item));
    return value === undefined || record[key] === value;
  });
}

async function harness(t: TestContext) {
  const clients = [
    { id: "client-a", name: "Infordoc", userId: "owner", organizationId: "org-a" },
    { id: "client-b", name: "Outra", userId: "other", organizationId: "org-b" },
  ];
  const contacts = [contact(1), contact(2, { blocked: true })];
  const stored: RecordData[] = [];
  const database = {
    member: { findMany: async ({ where }: { where: RecordData }) => where.userId === "owner" && (!where.organizationId || where.organizationId === "org-a") ? [{ organizationId: "org-a" }] : [] },
    client: {
      findFirst: async ({ where }: { where: RecordData }) => clients.find((item) => matches(item, where)) ?? null,
      findMany: async () => clients,
    },
    contact: { findMany: async () => contacts },
    announcement: {
      findUnique: async ({ where }: { where: { userId_requestKey: RecordData } }) => {
        const item = stored.find((item) => matches(item, where.userId_requestKey));
        return item ? { ...item, messages: (item.messages as { create: RecordData[] }).create } : null;
      },
      findMany: async ({ where }: { where: RecordData }) => stored.filter((item) => matches(item, where)),
      create: async ({ data }: { data: RecordData }) => { const item = { id: "announcement-1", ...data }; stored.push(item); return item; },
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.get("x-user")) req.user = { id: req.get("x-user")! } as NonNullable<typeof req.user>;
    req.activeOrganizationId = req.get("x-org"); next();
  });
  app.use("/api", createAnnouncementRouter(database as unknown as Parameters<typeof createAnnouncementRouter>[0]));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = (path: string, body?: RecordData, user = "owner", org = "org-a") => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(user ? { "x-user": user } : {}), ...(org ? { "x-org": org } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const body = { clientId: "client-a", content: "Novidade", requestKey: "test-unique-request-1234" };
  return { clients, contacts, stored, request, body };
}

test("prévia não grava; confirmação cria fila individual e repetição HTTP não duplica", async (t) => {
  const h = await harness(t);
  const preview = await (await h.request("/announcements/preview", h.body)).json();
  assert.equal(h.stored.length, 0);
  assert.equal(preview.recipients.length, 1);
  const response = await h.request("/announcements", { ...h.body, previewToken: preview.previewToken });
  assert.equal(response.status, 201);
  assert.equal(h.stored.length, 1);
  const messages = (h.stored[0]!.messages as { create: RecordData[] }).create;
  assert.equal(messages.length, 1); assert.equal(messages[0]!.phone, contact(1).phone);
  assert.equal((await h.request("/announcements", { ...h.body, previewToken: preview.previewToken })).status, 200);
  assert.equal(h.stored.length, 1);
});

test("mudança de destinatários/texto exige nova revisão", async (t) => {
  const h = await harness(t);
  const preview = await (await h.request("/announcements/preview", h.body)).json();
  assert.notEqual(preview.previewToken, announcementPreviewToken(h.body.clientId, "Outro texto", preview.recipients));
  h.contacts[0]!.blocked = true;
  h.contacts.push(contact(3));
  assert.equal((await h.request("/announcements", { ...h.body, previewToken: preview.previewToken })).status, 409);
  assert.equal(h.stored.length, 0);
});

test("confirmação enfileira apenas os contatos selecionados e mantém a seleção em repetições", async (t) => {
  const h = await harness(t);
  h.contacts.push(contact(3));
  const preview = await (await h.request("/announcements/preview", h.body)).json();
  const body = { ...h.body, previewToken: preview.previewToken, recipientIds: [3] };
  assert.equal((await h.request("/announcements", body)).status, 201);
  const messages = (h.stored[0]!.messages as { create: RecordData[] }).create;
  assert.deepEqual(messages.map(message => message.announcementContactId), [3]);
  assert.equal((await h.request("/announcements", body)).status, 200);
  assert.equal((await h.request("/announcements", { ...body, recipientIds: [1] })).status, 409);
  assert.equal(h.stored.length, 1);
});

test("seleção vazia, repetida, inválida ou fora da prévia não cria fila", async (t) => {
  const h = await harness(t);
  const preview = await (await h.request("/announcements/preview", h.body)).json();
  for (const recipientIds of [[], [1, 1], [2], [999], [0], [-1], [1.5], ["1"], null]) {
    assert.equal((await h.request("/announcements", { ...h.body, previewToken: preview.previewToken, recipientIds })).status, 400);
  }
  assert.equal(h.stored.length, 0);
});

test("selecionar um subconjunto não dispensa a validação da prévia", async (t) => {
  const h = await harness(t);
  h.contacts.push(contact(3));
  const preview = await (await h.request("/announcements/preview", h.body)).json();
  h.contacts[0]!.blocked = true;
  assert.equal((await h.request("/announcements", { ...h.body, previewToken: preview.previewToken, recipientIds: [3] })).status, 409);
  assert.equal(h.stored.length, 0);
});

test("bloqueia empresa de outra organização, sessão ausente e empresa ativa indevida", async (t) => {
  const h = await harness(t);
  assert.equal((await h.request("/announcements/preview", { ...h.body, clientId: "client-b" })).status, 404);
  assert.equal((await h.request("/announcements", undefined, "", "")).status, 401);
  assert.equal((await h.request("/announcements", undefined, "owner", "org-b")).status, 403);
});

test("nomes de empresas ambíguos não expõem lista de destinatários", async (t) => {
  const h = await harness(t);
  h.clients.push({ id: "duplicate", name: " INFORDOC ", userId: "other", organizationId: "org-b" });
  assert.equal((await h.request("/announcements/preview", h.body)).status, 409);
  assert.equal(h.stored.length, 0);
});

test("histórico fica no usuário e organização ativos", async (t) => {
  const h = await harness(t);
  h.stored.push({ userId: "owner", organizationId: "org-a", id: "own" }, { userId: "other", organizationId: "org-a", id: "other" }, { userId: "owner", organizationId: "org-b", id: "foreign" });
  assert.deepEqual((await (await h.request("/announcements")).json()).announcements.map((item: RecordData) => item.id), ["own"]);
});

test("worker revalida contato bloqueado antes de chamar WhatsApp e não repete mensagem já reclamada", async () => {
  const scheduled = { id: "queue-1", userId: "owner", phone: contact(1).phone, content: "Novidade", announcementId: "a", announcementContactId: 1 };
  let status = "PENDING";
  let sends = 0;
  const database = {
    scheduledMessage: {
      updateMany: async () => { if (status !== "PENDING") return { count: 0 }; status = "PROCESSING"; return { count: 1 }; },
      findUniqueOrThrow: async () => scheduled,
      update: async ({ data }: { data: { status: string } }) => { status = data.status; },
    },
    contact: { findUnique: async () => contact(1, { blocked: true }) },
    announcement: { findUniqueOrThrow: async () => ({ clientId: "client-a", organizationId: "org-a", companyName: "Infordoc" }) },
    member: { findMany: async () => [{ organizationId: "org-a" }] },
    client: { findFirst: async () => ({ name: "Infordoc" }), findMany: async () => [{ name: "Infordoc" }] },
  };
  const send: Parameters<typeof sendScheduledMessage>[2] = async () => { sends++; throw new Error("O transporte não deve ser chamado"); };
  await sendScheduledMessage(scheduled.id, database as unknown as Parameters<typeof sendScheduledMessage>[1], send);
  assert.equal(status, "FAILED"); assert.equal(sends, 0);
  await sendScheduledMessage(scheduled.id, database as unknown as Parameters<typeof sendScheduledMessage>[1], send);
  assert.equal(sends, 0);
});

test("worker envia uma vez, salva na conversa e registra o autor", async (t) => {
  t.mock.method(console, "error", () => {}); // Socket.IO não é iniciado neste teste.
  let status = "PENDING";
  let sends = 0;
  let saved: RecordData | undefined;
  const database = {
    scheduledMessage: {
      updateMany: async () => { if (status !== "PENDING") return { count: 0 }; status = "PROCESSING"; return { count: 1 }; },
      findUniqueOrThrow: async () => ({ userId: "owner", phone: contact(1).phone, content: "Novidade", announcementId: "a", announcementContactId: 1 }),
      update: async ({ data }: { data: { status: string } }) => { status = data.status; },
    },
    contact: { findUnique: async () => contact(1) },
    announcement: { findUniqueOrThrow: async () => ({ clientId: "client-a", organizationId: "org-a", companyName: "Infordoc" }) },
    member: { findMany: async () => [{ organizationId: "org-a" }] },
    client: { findFirst: async () => ({ name: "Infordoc" }), findMany: async () => [{ name: "Infordoc" }] },
    message: { upsert: async ({ create }: { create: RecordData }) => { saved = create; return create; } },
  };
  const send: Parameters<typeof sendScheduledMessage>[2] = async (phone, text) => {
    sends++; assert.equal(phone, contact(1).phone); assert.equal(text, "Novidade");
    return { key: { id: "fake-external-id" } };
  };
  await sendScheduledMessage("queue-1", database as unknown as Parameters<typeof sendScheduledMessage>[1], send);
  assert.equal(status, "SENT");
  assert.equal(saved?.contactId, 1); assert.equal(saved?.sentByUserId, "owner");
  assert.equal(saved?.externalId, "fake-external-id");
  await sendScheduledMessage("queue-1", database as unknown as Parameters<typeof sendScheduledMessage>[1], send);
  assert.equal(sends, 1);
});

test("MySQL: comunicado e fila são persistidos juntos e revertidos ao final", { skip: process.env.RUN_ANNOUNCEMENT_DB_TESTS !== "1" }, async () => {
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: "Teste rollback Notícias", email: `noticias-${randomUUID()}@example.invalid` } });
      const client = await tx.client.create({ data: { userId: user.id, name: "Empresa teste rollback", links: [] } });
      const announcement = await tx.announcement.create({ data: {
        userId: user.id, clientId: client.id, companyName: client.name, content: "Teste sem envio", requestKey: randomUUID(),
        messages: { create: [{ userId: user.id, phone: "5527999990000", recipientName: "Teste", content: "Teste sem envio", scheduledAt: new Date("2099-01-01") }] },
      }, include: { messages: true } });
      assert.equal(announcement.messages.length, 1);
      assert.equal(announcement.messages[0]!.announcementId, announcement.id);
      assert.equal(announcement.messages[0]!.status, "PENDING");
      assert.equal(await tx.announcement.count({ where: { userId: "outro-usuario", id: announcement.id } }), 0);
      throw new Error("ROLLBACK_ANNOUNCEMENT_TEST");
    }), /ROLLBACK_ANNOUNCEMENT_TEST/);
  } finally { await prisma.$disconnect(); }
});
