import type { Prisma } from "../../generated/prisma/client.js";
import type { BotFlow } from "./bot-flow.js";

type BotConfigurationDatabase = Pick<Prisma.TransactionClient, "botInstance" | "bot"> &
  Partial<Pick<Prisma.TransactionClient, "botSession">>;

export async function activeBotFlow(
  database: BotConfigurationDatabase,
  organizationId?: string | null,
  contactId?: number,
): Promise<BotFlow | null> {
  if (organizationId && contactId && database.botSession) {
    const session = await database.botSession.findFirst({
      where: { contactId, bot: { organizationId } },
      orderBy: { updatedAt: "desc" },
      select: { bot: { select: { published: true } } },
    });
    if (session?.bot.published) return session.bot.published as BotFlow;
  }

  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  if (!instance || !organizationId) return null;
  const binding = await database.botInstance.findUnique({ where: { instance } });
  if (!binding || binding.organizationId !== organizationId || !binding.activeBotId) {
    const fallbackBot = (await database.bot.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    })).find(bot => bot.published);
    return fallbackBot?.published as BotFlow | null ?? null;
  }
  const bot = await database.bot.findUnique({ where: { id: binding.activeBotId } });
  return bot?.published as BotFlow | null ?? null;
}

export function assignmentTarget(flow: BotFlow | null, key: "onContactCreateUserId" | "onCloseUserId"): string | undefined {
  const hasSpecificTarget = flow?.assignment && Object.prototype.hasOwnProperty.call(flow.assignment, key);
  const value = hasSpecificTarget ? flow.assignment?.[key] : flow?.assignedUserId;
  return typeof value === "string" && value.trim() ? value : undefined;
}
