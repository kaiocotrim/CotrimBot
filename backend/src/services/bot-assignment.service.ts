import type { Prisma } from "../../generated/prisma/client.js";
import type { BotFlow } from "./bot-flow.js";

type BotConfigurationDatabase = Pick<Prisma.TransactionClient, "botInstance" | "bot">;

export async function activeBotFlow(
  database: BotConfigurationDatabase,
  organizationId?: string | null,
): Promise<BotFlow | null> {
  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  if (!instance || !organizationId) return null;
  const binding = await database.botInstance.findUnique({ where: { instance } });
  if (!binding || binding.organizationId !== organizationId || !binding.activeBotId) return null;
  const bot = await database.bot.findUnique({ where: { id: binding.activeBotId } });
  return bot?.published as BotFlow | null ?? null;
}

export function assignmentTarget(flow: BotFlow | null, key: "onContactCreateUserId" | "onCloseUserId"): string | undefined {
  const value = flow?.assignment?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
