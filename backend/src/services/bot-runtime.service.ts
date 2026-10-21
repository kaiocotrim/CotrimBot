import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { sendWhatsAppMessage, sendWhatsAppMedia } from "./evolution.service.js";
import { advanceBot, type BotFlow, type BotState } from "./bot-flow.js";
import { Prisma, type Prisma as PrismaTypes } from "../../generated/prisma/client.js";
import { contactDisplayName } from "../utils/contact-name.js";
import { isInforbotName } from "./bot.service.js";

export async function lockBotContact(tx: Prisma.TransactionClient, contactId: number) {
  await tx.$queryRaw`SELECT id FROM Contact WHERE id = ${contactId} FOR UPDATE`;
}

// Contact row locks serialize bot replies and assignment changes across workers.
export function createBotProcessor(database = prisma, send = sendWhatsAppMessage, emit: (payload: unknown) => void = payload => { getSocketServer().emit("new_message", payload); }, sendMedia = sendWhatsAppMedia) {
return async function processBotMessage(messageId: number, instance: unknown) {
  const runtimeInstance = process.env.EVOLUTION_INSTANCE;
  if (!runtimeInstance || typeof instance !== "string" || instance.trim() !== runtimeInstance.trim()) return;
  const input = await database.message.findUnique({ where: { id: messageId } });
  if (!input || input.direction !== "INCOMING" || input.type === "SYSTEM") return;
  let activeBotId: string | undefined;
  try {
    const emitted = await database.$transaction(async tx => {
      await lockBotContact(tx, input.contactId);
      const contact = await tx.contact.findUniqueOrThrow({ where: { id: input.contactId }, include: { assignments: true } });
      if (contact.isGroup || contact.blocked) return;
      const assignedMembers = contact.assignments.length
        ? await tx.member.findMany({
            where: { userId: { in: contact.assignments.map(assignment => assignment.userId) } },
            select: { userId: true, organizationId: true, displayName: true, user: { select: { name: true } } },
          })
        : [];
      const inforbotMember = assignedMembers.find(member =>
        isInforbotName(member.user.name) || isInforbotName(member.displayName)
      );
      if (!inforbotMember) return;
      const bot = await tx.bot.findFirst({
        where: { organizationId: inforbotMember.organizationId, published: { not: Prisma.JsonNull } },
        orderBy: [{ publishedRevision: "desc" }, { id: "asc" }],
      });
      if (!bot?.published) return;
      activeBotId = bot.id;
      if (await tx.botExecutionLog.findUnique({ where: { messageId } })) return;
      const savedSession = await tx.botSession.findUnique({ where: { instance_contactId: { instance: runtimeInstance, contactId: contact.id } } });
      const assignment = contact.assignments.find(item => item.userId === inforbotMember.userId);
      // A return to Inforbot starts a new service, including sessions left paused
      // by an older worker before assignment changes cleared the session.
      const previous = savedSession && assignment && assignment.assignedAt > savedSession.updatedAt ? null : savedSession;
      if (previous && ["WAITING_HUMAN", "HUMAN_ACTIVE", "CLOSED"].includes(previous.status)) return;
      // Any incoming message can start service; menu choices require text.
      if (previous && input.type !== "TEXT") return;
      const state = previous?.botId === bot.id && previous.revision === bot.publishedRevision
        ? previous.state as unknown as BotState
        : null;
      const result = advanceBot(bot.published as unknown as BotFlow, state, input.content);
      const image = result.imageId ? await tx.botImage.findFirst({ where: { id: result.imageId, organizationId: bot.organizationId } }) : null;
      if (result.imageId && !image) throw new Error("Bot image not found");
      // Commit the unique claim independently BEFORE contacting Evolution. It survives
      // an ambiguous timeout/transaction rollback and prevents a later duplicate send.
      await database.botExecutionLog.create({ data: { messageId, botId: bot.id, outcome: "PROCESSING" } });
      const messages = [];
      if (!image || result.text.trim()) {
        const response = await send(contact.phone, result.text);
        const externalId = response?.key?.id;
        if (typeof externalId !== "string" || !externalId) throw new Error("Missing Evolution message ID");
        messages.push(await tx.message.upsert({
          where: { externalId },
          create: { externalId, contactId: contact.id, direction: "OUTGOING", content: result.text, type: "TEXT" },
          update: {},
        }));
      }
      if (image) {
        const response = await sendMedia({
          number: contact.phone,
          mediatype: "image",
          mimetype: image.mimetype,
          media: Buffer.from(image.data).toString("base64"),
          fileName: image.fileName,
        });
        const externalId = response?.key?.id;
        if (typeof externalId !== "string" || !externalId) throw new Error("Missing Evolution media message ID");
        const message = await tx.message.upsert({
          where: { externalId },
          create: { externalId, contactId: contact.id, direction: "OUTGOING", content: "[Imagem]", type: "IMAGE" },
          update: {},
        });
        const media = { data: image.data, mimetype: image.mimetype, fileName: image.fileName };
        await tx.messageMedia.upsert({ where: { messageId: message.id }, create: { messageId: message.id, ...media }, update: media });
        messages.push(message);
      }
      await tx.botSession.upsert({ where: { instance_contactId: { instance: runtimeInstance, contactId: contact.id } },
        create: { instance: runtimeInstance, contactId: contact.id, botId: bot.id, revision: bot.publishedRevision, state: result.state as unknown as PrismaTypes.InputJsonValue, status: result.state.status },
        update: { botId: bot.id, revision: bot.publishedRevision, state: result.state as unknown as PrismaTypes.InputJsonValue, status: result.state.status } });
      // The claim was inserted on a separate connection after this transaction's
      // first read. MySQL REPEATABLE READ hides it from Prisma update's lookup;
      // updateMany writes directly, so saving the reply/session can commit.
      const completed = await tx.botExecutionLog.updateMany({ where: { messageId }, data: { outcome: "SENT" } });
      if (completed.count !== 1) throw new Error("Missing bot execution claim");
      return { messages, contact: { ...contact, name: contactDisplayName(contact), assignedUserIds: contact.assignments.map(assignment => assignment.userId) } };
    }, { timeout: 30000, maxWait: 10000 });
    if (emitted) {
      for (const message of emitted.messages) emit({ message, contact: emitted.contact });
    }
  } catch {
    // Do not retry ambiguous network sends automatically: WhatsApp has no exactly-once send primitive.
    if (activeBotId) await database.botExecutionLog.upsert({ where: { messageId }, create: { messageId, botId: activeBotId, outcome: "FAILED_OR_UNCERTAIN" }, update: { outcome: "FAILED_OR_UNCERTAIN" } });
    console.error("Falha no envio automático; consulte BotExecutionLog.");
  }
};
}

export const processBotMessage = createBotProcessor();
