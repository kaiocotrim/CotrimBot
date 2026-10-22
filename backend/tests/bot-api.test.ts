import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createBotRouter } from "../src/routes/bot.routes.js";
import type { prisma } from "../src/lib/prisma.js";
import { fixture } from "./bot-fixture.js";

test("administrative API enforces membership, tenant isolation, optimistic revisions and safe publication", async () => {
  const records = new Map<string, any>();
  const images = new Map<string, any>();
  const db: any = {
    botImage: {
      create: async ({ data }: any) => { const image = { id: `image-${images.size}`, ...data }; images.set(image.id, image); return { id: image.id, mimetype: image.mimetype, fileName: image.fileName }; },
      findUnique: async ({ where }: any) => images.get(where.id) ?? null,
      findFirst: async ({ where }: any) => { const image = images.get(where.id); return image?.organizationId === where.organizationId ? image : null; },
      findMany: async ({ where }: any) => [...images.values()].filter(image => where.id.in.includes(image.id) && image.organizationId === where.organizationId),
    },
    member: {
      findUnique: async ({ where }: any) => where.organizationId_userId.userId === "admin" ? { role: "admin" } : { role: "member" },
      findFirst: async ({ where }: any) => where.userId === "admin" ? { organizationId: "a", role: "admin" } : null,
    },
    botInstance: { findUnique: async () => null },
    bot: {
      findMany: async ({ where }: any) => [...records.values()].filter(b => b.organizationId === where.organizationId),
      create: async ({ data }: any) => { const bot = { id: `bot-${records.size}`, revision: 0, publishedRevision: 0, published: null, ...structuredClone(data) }; records.set(bot.id, bot); return bot; },
      findFirst: async ({ where }: any) => { const bot = records.get(where.id); return bot?.organizationId === where.organizationId ? bot : null; },
      findUnique: async ({ where }: any) => records.get(where.id),
      updateMany: async ({ where, data }: any) => { const bot = records.get(where.id); if (!bot || (where.organizationId && bot.organizationId !== where.organizationId) || bot.revision !== where.revision) return { count: 0 }; records.set(bot.id, { ...bot, ...structuredClone(data), revision: bot.revision + 1, publishedRevision: bot.publishedRevision + (data.publishedRevision ? 1 : 0) }); return { count: 1 }; },
    },
  };
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (!req.get("x-test-user")) { res.sendStatus(401); return; } req.user = { id: req.get("x-test-user") } as any; req.activeOrganizationId = req.get("x-test-org"); next(); });
  app.use(createBotRouter(db as typeof prisma));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  async function request(path: string, body?: unknown, user = "admin", org = "a", method = "POST") {
    return fetch(`http://127.0.0.1:${port}/bots${path}`, { method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json", "x-test-user": user, "x-test-org": org }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  try {
    assert.equal((await request("", undefined, "")).status, 401);
    assert.equal((await request("", undefined, "member")).status, 403);
    assert.equal((await request("", undefined, "admin", "")).status, 200);
    const created = await request("", { name: "Infordoc", draft: fixture() }); assert.equal(created.status, 201);
    const bot = await created.json() as any;
    assert.equal((await request(`/${bot.id}/publish`, { revision: 0 }, "admin", "b")).status, 404);
    assert.equal((await (await request("", undefined, "admin", "b")).json() as any).bots.length, 0);
    assert.equal((await request(`/${bot.id}/publish`, { revision: 0 })).status, 200);
    assert.equal((await request(`/${bot.id}/publish`, { revision: 1 }, "admin", "", "POST")).status, 200);
    assert.equal((await request(`/${bot.id}/publish`, {})).status, 400);
    const draft = fixture(); draft.menus[0]!.options[0]!.response = "Resposta editada";
    assert.equal((await request(`/${bot.id}`, { revision: 0, name: "Infordoc", draft }, "admin", "a", "PUT")).status, 409);
    assert.equal((await request(`/${bot.id}`, { revision: 2, name: "Infordoc", draft }, "admin", "a", "PUT")).status, 200);
    assert.match(records.get(bot.id).published.menus[0].options[0].response, /sac.infordoc/);
    assert.equal(records.get(bot.id).draft.menus[0].options[0].response, "Resposta editada");
    assert.equal((await request(`/${bot.id}`, { revision: 3, name: "Intruso", draft }, "admin", "b", "PUT")).status, 409);
    const invalid = fixture(); invalid.menus[0]!.options[0]!.response = "";
    assert.equal((await request(`/${bot.id}`, { revision: 3, name: "Infordoc", draft: invalid }, "admin", "a", "PUT")).status, 200);
    assert.equal((await request(`/${bot.id}/publish`, { revision: 4 })).status, 400);
    const simulated = await request("/simulate", { flow: fixture(), inputs: ["3", "4", "0"] }); assert.equal(simulated.status, 200);
    assert.equal((await simulated.json() as any).state.status, "WAITING_HUMAN");
    assert.equal((await request("/simulate", { flow: fixture(), inputs: [] }, "admin", "")).status, 200);
    assert.equal((await request("/simulate", { flow: fixture(), inputs: Array(101).fill("0") })).status, 400);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    async function upload(file: Blob, user = "admin") {
      const data = new FormData(); data.append("file", file, "foto.png");
      return fetch(`http://127.0.0.1:${port}/bots/images`, { method: "POST", headers: { "x-test-user": user, "x-test-org": "a" }, body: data });
    }
    assert.equal((await upload(new Blob([png], { type: "image/png" }), "member")).status, 403);
    assert.equal((await upload(new Blob(["<svg></svg>"], { type: "image/png" }))).status, 400);
    assert.equal((await upload(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }))).status, 413);
    const uploaded = await upload(new Blob([png], { type: "image/png" }));
    assert.equal(uploaded.status, 201);
    const image = await uploaded.json() as any;
    const preview = await request(`/images/${image.id}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
    assert.equal((await request(`/images/${image.id}`, undefined, "admin", "")).status, 200);
    assert.equal((await request(`/images/${image.id}`, undefined, "admin", "b")).status, 404);
    assert.equal((await request(`/images/${image.id}`, undefined, "member")).status, 403);
    const imageFlow = fixture(); imageFlow.menus[0]!.imageId = image.id;
    assert.equal((await request("", { name: "Foto", draft: imageFlow }, "admin", "b")).status, 400);
    const withImage = await request("", { name: "Foto", draft: imageFlow });
    assert.equal(withImage.status, 201);
    const imageBot = await withImage.json() as any;
    assert.equal((await request(`/${imageBot.id}/publish`, { revision: 0 })).status, 200);
    const imageSimulation = await request("/simulate", { flow: imageFlow, inputs: [] });
    assert.equal((await imageSimulation.json() as any).messages[0].imageId, image.id);
    const returnFlow = fixture();
    returnFlow.menus[1]!.options.push({ id: "restart", number: "5", label: "Voltar ao início", active: true, action: "SUBMENU", response: "", targetMenuId: returnFlow.rootMenuId });
    const returnBotResponse = await request("", { name: "Com retorno ao início", draft: returnFlow });
    assert.equal(returnBotResponse.status, 201);
    const returnBot = await returnBotResponse.json() as any;
    assert.equal((await request(`/${returnBot.id}/publish`, { revision: 0 })).status, 200);
    const returnSimulation = await request("/simulate", { flow: returnFlow, inputs: ["3", "5", "0"] });
    assert.equal(returnSimulation.status, 200);
    const returned = await returnSimulation.json() as any;
    assert.equal(returned.state.menuId, returnFlow.rootMenuId);
    assert.deepEqual(returned.state.stack, []);
    assert.match(returned.messages.at(-1).text, /Assistente Infordoc/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
