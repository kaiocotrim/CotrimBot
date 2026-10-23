import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { contactDisplayName } from "../utils/contact-name.js";
import { sendWhatsAppMessage } from "./evolution.service.js";
import { setTimeout as pause } from "node:timers/promises";
import { companyKey } from "./announcement-policy.js";
import { getClientAccess } from "./client-access.service.js";

export async function sendScheduledMessage(id: string, database: typeof prisma = prisma, send = sendWhatsAppMessage) {
  const claimed = await database.scheduledMessage.updateMany({
    where: { id, status: "PENDING", scheduledAt: { lte: new Date() } },
    data: { status: "PROCESSING" },
  });
  if (!claimed.count) return;

  const scheduled = await database.scheduledMessage.findUniqueOrThrow({ where: { id } });
  try {
    const contact = scheduled.announcementId ? await database.contact.findUnique({ where: { id: scheduled.announcementContactId ?? -1 } }) : await database.contact.upsert({
      where: { phone: scheduled.phone },
      update: {},
      create: { phone: scheduled.phone, name: scheduled.phone },
    });
    if (!contact) throw new Error("O contato não existe mais.");
    if (scheduled.announcementId) {
      const announcement = await database.announcement.findUniqueOrThrow({ where: { id: scheduled.announcementId } });
      const access = await getClientAccess(scheduled.userId, announcement.organizationId ?? undefined, (userId, organizationId) => database.member.findMany({
        where: { userId, ...(organizationId ? { organizationId } : {}) }, select: { organizationId: true }, take: 2,
      }));
      const client = announcement.clientId && await database.client.findFirst({ where: { AND: [access.where, { id: announcement.clientId }] } });
      const companies = await database.client.findMany({ select: { name: true } });
      if (!client || companyKey(client.name) !== companyKey(announcement.companyName)
        || companies.filter((item) => companyKey(item.name) === companyKey(client.name)).length !== 1
        || contact.blocked || contact.isGroup || contact.phone.replace(/\D/g, "") !== scheduled.phone
        || companyKey(contact.companyName ?? "") !== companyKey(client.name)) {
        throw new Error("Envio suspenso: o vínculo com a empresa ou a disponibilidade do contato mudou.");
      }
    }
    const evolutionResponse = await send(scheduled.phone, scheduled.content);
    const externalId = evolutionResponse.key?.id;
    if (!externalId) throw new Error("A Evolution API não confirmou o ID da mensagem.");

    const message = await database.message.upsert({
      where: { externalId },
      update: { content: scheduled.content, sentByUserId: scheduled.userId },
      create: {
        externalId,
        content: scheduled.content,
        direction: "OUTGOING",
        contactId: contact.id,
        sentByUserId: scheduled.userId,
      },
      include: { sentByUser: { select: { id: true, name: true, image: true } } },
    });

    await database.scheduledMessage.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    try {
      getSocketServer().emit("new_message", { message, contact: { ...contact, name: contactDisplayName(contact) } });
    } catch (error) {
      console.error(`Mensagem programada ${id} enviada, mas a atualização em tempo real falhou:`, error);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Falha desconhecida no envio";
    console.error(`Falha ao enviar mensagem programada ${id}:`, error);
    await database.scheduledMessage.update({ where: { id }, data: { status: "FAILED", error: detail.slice(0, 2000) } });
  }
}

let running = false;

async function processDueMessages() {
  if (running) return;
  running = true;
  try {
    await prisma.scheduledMessage.updateMany({
      where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
      data: { status: "FAILED", error: "O envio foi interrompido; confirme o destinatário antes de programar novamente." },
    });
    const due = await prisma.scheduledMessage.findMany({
      where: { status: "PENDING", scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
      select: { id: true, announcementId: true },
    });
    for (const message of due) {
      await sendScheduledMessage(message.id);
      if (message.announcementId) await pause(3000);
    }
  } catch (error) {
    console.error("Falha ao processar mensagens programadas:", error);
  } finally {
    running = false;
  }
}

export function startScheduledMessageWorker() {
  void processDueMessages();
  const timer = setInterval(() => void processDueMessages(), 15_000);
  timer.unref();
}
