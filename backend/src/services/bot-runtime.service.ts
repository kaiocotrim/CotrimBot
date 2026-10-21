import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { sendWhatsAppMessage } from "./evolution.service.js";
import { advanceBot, type BotFlow, type BotState } from "./bot-flow.js";
import { Prisma, type Prisma as PrismaTypes } from "../../generated/prisma/client.js";
import { contactDisplayName } from "../utils/contact-name.js";

export async function lockBotContact(tx: Prisma.TransactionClient, contactId: number) {
  await tx.$queryRaw`SELECT id FROM Contact WHERE id = ${contactId} FOR UPDATE`;
}

// Contact row locks serialize bot replies and assignment changes across workers.
export function createBotProcessor(database = prisma, send = sendWhatsAppMessage, emit: (payload: unknown) => void = payload => { getSocketServer().emit("new_message", payload); }) {
return async function processBotMessage(messageId: number, instance: unknown) {
  const runtimeInstance = process.env.EVOLUTION_INSTANCE;
  if (!runtimeInstance || typeof instance !== "string" || instance.trim() !== runtimeInstance.trim()) return;
  const input = await database.message.findUnique({ where: { id: messageId } });
  if (!input || input.direction !== "INCOMING" || input.type !== "TEXT") return;
  let activeBotId: string | undefined;
  try {
    const emitted = await database.$transaction(async tx => {
      await lockBotContact(tx, input.contactId);
      const contact = await tx.contact.findUniqueOrThrow({ where: { id: input.contactId }, include: { assignments: true } });
      if (contact.isGroup || contact.blocked) return;
      const assignedMembers = contact.assignments.length
        ? await tx.member.findMany({
            where: { userId: { in: contact.assignments.map(assignment => assignment.userId) } },
            select: { organizationId: true, displayName: true, user: { select: { name: true } } },
          })
        : [];
      const inforbotMember = assignedMembers.find(member =>
        (member.displayName?.trim() || member.user.name).toLocaleLowerCase("pt-BR") === "inforbot"
      );
      if (!inforbotMember) return;
      const bot = await tx.bot.findFirst({
        where: { organizationId: inforbotMember.organizationId, published: { not: Prisma.JsonNull } },
        orderBy: { publishedRevision: "desc" },
      });
      if (!bot?.published) return;
      activeBotId = bot.id;
      if (await tx.botExecutionLog.findUnique({ where: { messageId } })) return;
      const previous = await tx.botSession.findUnique({ where: { instance_contactId: { instance: runtimeInstance, contactId: contact.id } } });
      if (previous && ["WAITING_HUMAN", "HUMAN_ACTIVE", "CLOSED"].includes(previous.status)) return;
      const state = previous?.botId === bot.id && previous.revision === bot.publishedRevision
        ? previous.state as unknown as BotState
        : null;
      const result = advanceBot(bot.published as unknown as BotFlow, state, input.content);
      // Commit the unique claim independently BEFORE contacting Evolution. It survives
      // an ambiguous timeout/transaction rollback and prevents a later duplicate send.
      await database.botExecutionLog.create({ data: { messageId, botId: bot.id, outcome: "PROCESSING" } });
      const response = await send(contact.phone, result.text);
      const externalId = response?.key?.id;
      if (typeof externalId !== "string" || !externalId) throw new Error("Missing Evolution message ID");
      const message = await tx.message.upsert({ where: { externalId }, create: { externalId, contactId: contact.id, direction: "OUTGOING", content: result.text }, update: {} });
      await tx.botSession.upsert({ where: { instance_contactId: { instance: runtimeInstance, contactId: contact.id } },
        create: { instance: runtimeInstance, contactId: contact.id, botId: bot.id, revision: bot.publishedRevision, state: result.state as unknown as PrismaTypes.InputJsonValue, status: result.state.status },
        update: { botId: bot.id, revision: bot.publishedRevision, state: result.state as unknown as PrismaTypes.InputJsonValue, status: result.state.status } });
      await tx.botExecutionLog.update({ where: { messageId }, data: { outcome: "SENT" } });
      return { message, contact: { ...contact, name: contactDisplayName(contact), assignedUserIds: [] } };
    }, { timeout: 30000, maxWait: 10000 });
    if (emitted) emit(emitted);
  } catch {
    // Do not retry ambiguous network sends automatically: WhatsApp has no exactly-once send primitive.
    if (activeBotId) await database.botExecutionLog.upsert({ where: { messageId }, create: { messageId, botId: activeBotId, outcome: "FAILED_OR_UNCERTAIN" }, update: { outcome: "FAILED_OR_UNCERTAIN" } });
    console.error("Falha no envio automático; consulte BotExecutionLog.");
  }
};
}

export const processBotMessage = createBotProcessor();
