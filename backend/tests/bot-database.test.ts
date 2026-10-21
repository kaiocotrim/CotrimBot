import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { fixture } from "./bot-fixture.js";
import type { Prisma } from "../generated/prisma/client.js";

test("MySQL: create bot, persist option CRUD/submenu, isolate organization and preserve publication", { skip: process.env.RUN_BOT_DB_TESTS !== "1" }, async () => {
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const org = await tx.organization.create({ data: { name: "Bot Builder test", slug: `bot-test-${randomUUID()}` } });
      const initial = fixture();
      const bot = await tx.bot.create({ data: { organizationId: org.id, name: "Infordoc test", draft: initial as unknown as Prisma.InputJsonValue, published: initial as unknown as Prisma.InputJsonValue } });
      assert.ok(bot.id);
      const draft = structuredClone(initial);
      draft.menus[0]!.options.push({ ...draft.menus[0]!.options[0]!, id: "added", number: "5" });
      await tx.bot.update({ where: { id: bot.id }, data: { draft: draft as unknown as Prisma.InputJsonValue } });
      draft.menus[0]!.options[0]!.response = "Resposta editada";
      draft.menus[0]!.options.splice(2, 1);
      await tx.bot.update({ where: { id: bot.id }, data: { draft: draft as unknown as Prisma.InputJsonValue } });
      const saved = await tx.bot.findUniqueOrThrow({ where: { id: bot.id } });
      assert.deepEqual(saved.draft, draft);
      assert.deepEqual(saved.published, initial);
      assert.equal(await tx.bot.count({ where: { id: bot.id, organizationId: "another-organization" } }), 0);
      throw new Error("ROLLBACK_BOT_TEST");
    }), /ROLLBACK_BOT_TEST/);
  } finally { await prisma.$disconnect(); }
});
