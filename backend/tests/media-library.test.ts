import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { prisma } from "../src/lib/prisma.js";
import { createMediaLibraryHandler, extractMessageLinks } from "../src/controllers/media-library.controller.js";

type Row = Record<string, any>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((condition: Row) => matches(row, condition));
    if (key === "OR") return value.some((condition: Row) => matches(row, condition));
    if (key === "deletions") return !row.deletions.some((deletion: Row) => matches(deletion, value.none));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("contains" in value) return String(row[key] ?? "").includes(value.contains);
      return matches(row[key] ?? {}, value);
    }
    return row[key] === value;
  });
}
function response() {
  return { code: 200, body: {} as any, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
}

test("library excludes deleted, private, view-once and individually hidden messages", async () => {
  const base = { type: "IMAGE", content: "Foto", createdAt: new Date(), deletedAt: null, private: false, viewOnce: false, deletions: [], direction: "INCOMING", senderName: null, cachedMedia: null, sentByUser: null, contact: { id: 1, name: "Pessoa", phone: "5511000000000", isSaved: true, isGroup: false } };
  const rows: Row[] = [
    { ...base, id: 1 }, { ...base, id: 2, private: true }, { ...base, id: 3, viewOnce: true },
    { ...base, id: 4, deletedAt: new Date() }, { ...base, id: 5, deletions: [{ userId: "me" }] },
    { ...base, id: 6, deletions: [{ userId: "other" }] }, { ...base, id: 7, type: "DOCUMENT", content: "manual.pdf" },
    { ...base, id: 8, type: "TEXT", content: "Acesse https://example.com" },
  ];
  const queries: Row[] = [];
  const database = { message: { findMany: async (query: Row) => { queries.push(query); return rows.filter((row) => matches(row, query.where)); } } } as unknown as Pick<typeof prisma, "message">;
  const handler = createMediaLibraryHandler(database);
  async function run(query: Row) {
    const result = response();
    await handler({ query, user: { id: "me" } } as unknown as Request, result as unknown as Response);
    return result;
  }
  assert.deepEqual((await run({})).body.items.map((item: Row) => item.id), [1, 6]);
  assert.deepEqual((await run({ tab: "documents" })).body.items.map((item: Row) => item.id), [7]);
  assert.deepEqual((await run({ tab: "links" })).body.items[0].links, ["https://example.com/"]);
  assert.equal((await run({ q: "nonexistent" })).body.items.length, 0);
  await run({ sort: "oldest", cursor: "6" });
  assert.deepEqual(queries.at(-1)!.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(queries.at(-1)!.cursor, { id: 6 });
  assert.equal((await run({ cursor: "not-an-id" })).code, 400);
  assert.equal((await run({ tab: "unknown" })).code, 400);
});

test("library paginates and emits a cursor for the last included message", async () => {
  const messages = Array.from({ length: 49 }, (_, index) => ({ id: index + 1, type: "IMAGE", content: "Foto", createdAt: new Date(), direction: "INCOMING", senderName: "Pessoa", cachedMedia: null, sentByUser: null, contact: { id: 1, name: "Pessoa", phone: "5511000000000", isGroup: false, isSaved: true } }));
  const handler = createMediaLibraryHandler({ message: { findMany: async () => messages } } as unknown as Pick<typeof prisma, "message">);
  const result = response();
  await handler({ query: {}, user: { id: "me" } } as unknown as Request, result as unknown as Response);
  assert.equal(result.body.items.length, 48);
  assert.equal(result.body.hasMore, true);
  assert.equal(result.body.nextCursor, 48);
});

test("link extraction accepts only web URLs, removes punctuation and duplicates", () => {
  assert.deepEqual(extractMessageLinks("https://example.com, www.example.org. https://example.com javascript:alert(1) https://"), ["https://example.com/", "https://www.example.org/"]);
});
