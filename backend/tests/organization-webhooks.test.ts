import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

// O módulo de rotas importa o Prisma client; valores fictícios bastam porque o banco é substituído por um fake.
process.env.DATABASE_HOST ??= "127.0.0.1";
process.env.DATABASE_PORT ??= "3306";
process.env.DATABASE_USER ??= "test";
process.env.DATABASE_PASSWORD ??= "test";
process.env.DATABASE_NAME ??= "test";

const { ORGANIZATION_WEBHOOK_EVENTS, normalizeWebhookEvents } = await import("../src/services/organization-webhook-events.js");
const service = await import("../src/services/organization-webhook.service.js");
const { createOrganizationWebhookRouter } = await import("../src/routes/organization-webhook.routes.js");

type Row = Record<string, any>;

function fakeDatabase(initial: { webhooks?: Row[]; members?: Row[] } = {}) {
  const webhooks: Row[] = [...(initial.webhooks ?? [])];
  const members: Row[] = initial.members ?? [];
  const deliveries: Row[] = [];
  return {
    webhooks,
    deliveries,
    member: {
      findUnique: async ({ where }: Row) => {
        const key = where.organizationId_userId;
        return members.find((m) => m.organizationId === key.organizationId && m.userId === key.userId) ?? null;
      },
    },
    organizationWebhook: {
      findMany: async ({ where }: Row) => webhooks
        .filter((w) => (where.organizationId === undefined || w.organizationId === where.organizationId)
          && (where.active === undefined || w.active === where.active))
        .map((w) => ({ ...w })),
      findFirst: async ({ where }: Row) => webhooks.find((w) => w.id === where.id && w.organizationId === where.organizationId) ?? null,
      create: async ({ data }: Row) => {
        const row = { id: `wh_${webhooks.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        webhooks.push(row);
        return row;
      },
    },
    organizationWebhookDelivery: {
      create: async ({ data }: Row) => {
        deliveries.push(data);
        return data;
      },
    },
  };
}

const noSleep = async () => undefined;

test("catálogo aceita apenas eventos conhecidos, sem repetição e não vazio", () => {
  const known = ORGANIZATION_WEBHOOK_EVENTS.map((event) => event.key);
  assert.deepEqual(normalizeWebhookEvents([known[0]]), [known[0]]);
  assert.equal(normalizeWebhookEvents([]), null);
  assert.equal(normalizeWebhookEvents(["bot.unknown"]), null);
  assert.equal(normalizeWebhookEvents([known[0], known[0]]), null);
  assert.equal(normalizeWebhookEvents("client.created"), null);
});

test("URL do webhook exige http(s) e não aceita credenciais embutidas", () => {
  assert.equal(service.normalizeWebhookUrl("https://exemplo.com/hook"), "https://exemplo.com/hook");
  assert.equal(service.normalizeWebhookUrl("ftp://exemplo.com/hook"), null);
  assert.equal(service.normalizeWebhookUrl("https://user:senha@exemplo.com/hook"), null);
  assert.equal(service.normalizeWebhookUrl("não é url"), null);
  assert.equal(service.normalizeWebhookUrl(42), null);
});

test("assinatura HMAC-SHA256 cobre timestamp e corpo", () => {
  const expected = `sha256=${createHmac("sha256", "segredo").update("1700000000.{\"a\":1}").digest("hex")}`;
  assert.equal(service.signWebhookPayload("segredo", "1700000000", "{\"a\":1}"), expected);
  assert.match(service.generateWebhookSecret(), /^whsec_[A-Za-z0-9_-]{43}$/);
});

test("entrega reenvia após falhas, assina a requisição e registra sucesso", async () => {
  const database = fakeDatabase();
  const seen: Array<{ headers: Record<string, string>; body: string }> = [];
  const responses = [
    () => { throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }); },
    () => new Response("erro", { status: 500 }),
    () => new Response("ok", { status: 200 }),
  ];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    seen.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
    return responses[seen.length - 1]!();
  }) as typeof fetch;

  const status = await service.deliverOrganizationWebhook(
    database as never,
    { id: "wh_1", url: "https://exemplo.com/hook", secret: "segredo" },
    "client.created",
    "org_1",
    { clientId: 7 },
    { fetch: fakeFetch, sleep: noSleep },
  );

  assert.equal(status, "SUCCEEDED");
  assert.equal(seen.length, 3);
  const last = seen[2]!;
  assert.equal(last.headers["X-CotrimBot-Event"], "client.created");
  const expectedSignature = service.signWebhookPayload("segredo", last.headers["X-CotrimBot-Timestamp"]!, last.body);
  assert.equal(last.headers["X-CotrimBot-Signature"], expectedSignature);
  assert.equal(JSON.parse(last.body).data.clientId, 7);
  assert.equal(database.deliveries.length, 1);
  assert.equal(database.deliveries[0].status, "SUCCEEDED");
  assert.equal(database.deliveries[0].attempts, 3);
  assert.equal(database.deliveries[0].responseStatus, 200);
});

test("entrega esgotada registra FAILED com o último erro e não lança exceção", async () => {
  const database = fakeDatabase();
  const fakeFetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  const status = await service.deliverOrganizationWebhook(
    database as never,
    { id: "wh_1", url: "https://exemplo.com/hook", secret: "segredo" },
    "bot.published",
    "org_1",
    {},
    { fetch: fakeFetch, sleep: noSleep },
  );
  assert.equal(status, "FAILED");
  assert.equal(database.deliveries[0].attempts, 3);
  assert.equal(database.deliveries[0].error, "HTTP 503");
});

test("disparo envia somente para webhooks ativos que assinam o evento", async () => {
  const database = fakeDatabase({
    webhooks: [
      { id: "a", organizationId: "org_1", url: "https://a.test/h", secret: "s1", events: ["client.created"], active: true },
      { id: "b", organizationId: "org_1", url: "https://b.test/h", secret: "s2", events: ["bot.published"], active: true },
      { id: "c", organizationId: "org_1", url: "https://c.test/h", secret: "s3", events: ["client.created"], active: false },
      { id: "d", organizationId: "org_2", url: "https://d.test/h", secret: "s4", events: ["client.created"], active: true },
    ],
  });
  const called: string[] = [];
  const fakeFetch = (async (url: string) => {
    called.push(url);
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  const count = await service.dispatchOrganizationWebhookEvent(
    database as never,
    "org_1",
    "client.created",
    { clientId: 1 },
    { fetch: fakeFetch, sleep: noSleep },
  );
  assert.equal(count, 1);
  assert.deepEqual(called, ["https://a.test/h"]);
});

test("rotas exigem owner ou admin e validam a criação", async () => {
  const database = fakeDatabase({
    members: [
      { organizationId: "org_1", userId: "admin", role: "admin" },
      { organizationId: "org_1", userId: "comum", role: "member" },
    ],
  });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const user = req.get("x-test-user");
    if (!user) return res.sendStatus(401);
    req.user = { id: user } as NonNullable<typeof req.user>;
    req.activeOrganizationId = req.get("x-test-org");
    next();
  });
  app.use("/api", createOrganizationWebhookRouter(database as never));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organization-webhooks`;
  const send = (user: string, body?: unknown, method = "POST") => fetch(base, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": user, "x-test-org": "org_1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  try {
    const forbidden = await send("comum", { name: "CRM", url: "https://exemplo.com/h", events: ["client.created"] });
    assert.equal(forbidden.status, 403);

    const invalidEvent = await send("admin", { name: "CRM", url: "https://exemplo.com/h", events: ["nao.existe"] });
    assert.equal(invalidEvent.status, 400);

    const invalidUrl = await send("admin", { name: "CRM", url: "javascript:alert(1)", events: ["client.created"] });
    assert.equal(invalidUrl.status, 400);

    const created = await send("admin", { name: "CRM", url: "https://exemplo.com/h", events: ["client.created"] });
    assert.equal(created.status, 201);
    const payload = await created.json() as { secret: string; webhook: { name: string } };
    assert.match(payload.secret, /^whsec_/);
    assert.equal(payload.webhook.name, "CRM");
    assert.equal(database.webhooks.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
