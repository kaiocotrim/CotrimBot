import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { createCsatRouter } from "../src/routes/csat.routes.js";
import {
  CSAT_COMMENT_WINDOW_MS,
  createCsatSurvey,
  parseCsatRating,
  recordCsatReply,
  summarizeCsat,
  type CsatDatabase,
} from "../src/services/csat.service.js";

type Row = {
  id: number;
  contactId: number;
  messageId: number | null;
  status: "PENDING" | "ANSWERED" | "EXPIRED";
  rating: number | null;
  comment: string | null;
  sentByUserId: string | null;
  sentAt: Date;
  answeredAt: Date | null;
  commentUntil: Date | null;
  contact?: { id: number; name: string; phone: string; isGroup: boolean; isSaved: boolean };
};

// Filtro mínimo compatível com os operadores usados pelo módulo.
function matches(row: Row, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (condition === undefined) return true;
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return (condition.in as unknown[]).includes(value);
      if ("gte" in condition || "lte" in condition) {
        const time = (value as Date).getTime();
        return (!condition.gte || time >= condition.gte.getTime()) && (!condition.lte || time <= condition.lte.getTime());
      }
    }
    return value === condition;
  });
}

function fakeDatabase(initial: Partial<Row>[] = []): CsatDatabase & { rows: Row[] } {
  const rows: Row[] = initial.map((row, index) => ({
    id: index + 1, contactId: 1, messageId: null, status: "PENDING", rating: null, comment: null,
    sentByUserId: "agent", sentAt: new Date("2026-11-01T12:00:00Z"), answeredAt: null, commentUntil: null, ...row,
  }));
  let nextId = rows.length + 1;
  const database = {
    rows,
    csatSurvey: {
      create: async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: nextId++, contactId: 1, messageId: null, status: "PENDING", rating: null, comment: null,
          sentByUserId: null, sentAt: new Date(), answeredAt: null, commentUntil: null, ...data,
        } as Row;
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Record<string, any> }) => {
        const found = rows
          .filter((row) => matches(row, where))
          .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
        return found ?? null;
      },
      findMany: async ({ where }: { where: Record<string, any> }) => rows.filter((row) => matches(row, where)),
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Partial<Row> }) => {
        const targets = rows.filter((row) => matches(row, where));
        targets.forEach((row) => Object.assign(row, data));
        return { count: targets.length };
      },
    },
  };
  return database as unknown as CsatDatabase & { rows: Row[] };
}

test("interpreta notas de 1 a 5 com comentário opcional e ignora outras mensagens", () => {
  assert.deepEqual(parseCsatRating("4"), { rating: 4, comment: null });
  assert.deepEqual(parseCsatRating(" 5  "), { rating: 5, comment: null });
  assert.deepEqual(parseCsatRating("2 demorou muito"), { rating: 2, comment: "demorou muito" });
  assert.equal(parseCsatRating("0"), null);
  assert.equal(parseCsatRating("10"), null);
  assert.equal(parseCsatRating("5ótimo"), null);
  assert.equal(parseCsatRating("3.5"), null);
  assert.equal(parseCsatRating("quero abrir um chamado"), null);
});

test("pontuação CSAT considera notas 4 e 5 como satisfeitas", () => {
  const summary = summarizeCsat([
    { status: "ANSWERED", rating: 5, comment: "ótimo" },
    { status: "ANSWERED", rating: 4, comment: null },
    { status: "ANSWERED", rating: 2, comment: "lento" },
    { status: "PENDING", rating: null, comment: null },
    { status: "EXPIRED", rating: null, comment: null },
  ]);
  assert.equal(summary.sent, 5);
  assert.equal(summary.answered, 3);
  assert.equal(summary.pending, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.responseRate, 60);
  assert.equal(summary.averageRating, 3.67);
  assert.equal(summary.satisfactionScore, 66.7);
  assert.equal(summary.commentsCount, 2);
  assert.deepEqual(summary.distribution, { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 });
});

test("sem respostas, métricas ficam zeradas e sem divisão por zero", () => {
  const summary = summarizeCsat([]);
  assert.equal(summary.responseRate, 0);
  assert.equal(summary.averageRating, null);
  assert.equal(summary.satisfactionScore, null);
});

test("novo envio expira a pesquisa pendente anterior", async () => {
  const database = fakeDatabase([{ contactId: 7, status: "PENDING" }]);
  await createCsatSurvey(database, { contactId: 7, messageId: 10, sentByUserId: "agent" });
  assert.deepEqual(database.rows.map((row) => row.status), ["EXPIRED", "PENDING"]);
});

test("nota respondida fecha a pesquisa e aceita comentário dentro da janela", async () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const database = fakeDatabase([{ contactId: 7, status: "PENDING" }]);

  assert.deepEqual(await recordCsatReply(database, { contactId: 7, text: "oi, preciso de ajuda", now }), { handled: false });
  assert.deepEqual(await recordCsatReply(database, { contactId: 7, text: "4", now }), { handled: true, rating: 4 });
  assert.equal(database.rows[0]!.status, "ANSWERED");
  assert.equal(database.rows[0]!.commentUntil?.getTime(), now.getTime() + CSAT_COMMENT_WINDOW_MS);

  const later = new Date(now.getTime() + 60_000);
  assert.deepEqual(await recordCsatReply(database, { contactId: 7, text: "Muito bom, obrigado!", now: later }), { handled: true });
  assert.equal(database.rows[0]!.comment, "Muito bom, obrigado!");
  assert.equal(database.rows[0]!.commentUntil, null);
  assert.deepEqual(await recordCsatReply(database, { contactId: 7, text: "mais um comentário", now: later }), { handled: false });
});

test("nota com comentário na mesma mensagem não espera comentário adicional", async () => {
  const database = fakeDatabase([{ contactId: 7, status: "PENDING" }]);
  await recordCsatReply(database, { contactId: 7, text: "1 fiquei sem resposta" });
  assert.equal(database.rows[0]!.comment, "fiquei sem resposta");
  assert.equal(database.rows[0]!.commentUntil, null);
});

test("comentário fora da janela segue para o bot", async () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const database = fakeDatabase([{ contactId: 7, status: "PENDING" }]);
  await recordCsatReply(database, { contactId: 7, text: "5", now });
  const expired = new Date(now.getTime() + CSAT_COMMENT_WINDOW_MS + 1);
  assert.deepEqual(await recordCsatReply(database, { contactId: 7, text: "depois de um tempo", now: expired }), { handled: false });
  assert.equal(database.rows[0]!.comment, null);
});

test("contatos sem pesquisa pendente não são afetados", async () => {
  const database = fakeDatabase([{ contactId: 8, status: "PENDING" }]);
  assert.deepEqual(await recordCsatReply(database, { contactId: 7, text: "5" }), { handled: false });
  assert.equal(database.rows[0]!.status, "PENDING");
});

async function harness(t: TestContext, database: CsatDatabase) {
  const app = express();
  app.use((req, _res, next) => { req.user = { id: "agent" } as NonNullable<typeof req.user>; next(); });
  app.use("/api", createCsatRouter(database));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return (path: string) => fetch(`http://127.0.0.1:${address.port}/api${path}`);
}

test("GET /csat/metrics devolve métricas do período e valida datas", async (t) => {
  const database = fakeDatabase([
    { contactId: 1, status: "ANSWERED", rating: 5, comment: "ótimo", sentAt: new Date("2026-11-02T10:00:00Z"), answeredAt: new Date("2026-11-02T10:05:00Z"), contact: { id: 1, name: "Ana", phone: "5527999990001", isGroup: false, isSaved: true } },
    { contactId: 2, status: "PENDING", sentAt: new Date("2026-11-03T10:00:00Z") },
    { contactId: 3, status: "ANSWERED", rating: 2, sentAt: new Date("2025-01-01T10:00:00Z"), answeredAt: new Date("2025-01-01T10:05:00Z") },
  ]);
  const request = await harness(t, database);

  const response = await request("/csat/metrics?from=2026-11-01T00:00:00Z&to=2026-11-05T00:00:00Z");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sent, 2);
  assert.equal(body.answered, 1);
  assert.equal(body.satisfactionScore, 100);
  assert.equal(body.recentResponses.length, 1);
  assert.equal(body.recentResponses[0].contact.name, "Ana");

  assert.equal((await request("/csat/metrics?from=nao-e-data")).status, 400);
  assert.equal((await request("/csat/metrics?from=2026-11-05T00:00:00Z&to=2026-11-01T00:00:00Z")).status, 400);
});
