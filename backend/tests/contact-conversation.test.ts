import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { prisma } from "../src/lib/prisma.js";
import { createContactConversationHandler } from "../src/controllers/contact-conversation.controller.js";

test("opening a conversation creates an unsaved contact and preserves existing saved contact details", async () => {
  let existing: Record<string, any> | null = null;
  const handler = createContactConversationHandler({ contact: {
    upsert: async (query: Record<string, any>) => {
      assert.deepEqual(query.where, { phone: "5511999999999" });
      assert.deepEqual(query.update, {});
      if (!existing) existing = { id: 7, ...query.create, isGroup: false, assignments: [] };
      return existing;
    },
  } } as unknown as Pick<typeof prisma, "contact">);
  async function run(body: unknown) {
    const result = { code: 200, body: {} as Record<string, any>, status(code: number) { this.code = code; return this; }, json(value: Record<string, any>) { this.body = value; return this; } };
    await handler({ body } as Request, result as unknown as Response);
    return result;
  }
  const created = await run({ phone: "+55 (11) 99999-9999" });
  assert.equal(created.body.isSaved, false);
  assert.equal(created.body.phone, "5511999999999");
  assert.equal(created.body.id, 7);
  existing = { ...existing, isSaved: true, name: "Bruno", companyName: "Empresa", assignments: [{ userId: "me" }] };
  const saved = await run({ phone: "5511999999999", name: "Outro nome" });
  assert.equal(saved.body.isSaved, true);
  assert.equal(saved.body.name, "Bruno");
  assert.equal(saved.body.companyName, "Empresa");
  assert.deepEqual(saved.body.assignedUserIds, ["me"]);
  for (const body of [{}, { phone: "123" }, { phone: "1".repeat(16) }, { phone: 5511999999999 }]) {
    assert.equal((await run(body)).code, 400);
  }
});
