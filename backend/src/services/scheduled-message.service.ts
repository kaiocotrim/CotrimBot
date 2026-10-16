import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { contactDisplayName } from "../utils/contact-name.js";
import { sendWhatsAppMessage } from "./evolution.service.js";

async function sendScheduledMessage(id: string) {
  const claimed = await prisma.scheduledMessage.updateMany({
    where: { id, status: "PENDING", scheduledAt: { lte: new Date() } },
    data: { status: "PROCESSING" },
  });
  if (!claimed.count) return;

  const scheduled = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id } });
  try {
    const contact = await prisma.contact.upsert({
      where: { phone: scheduled.phone },
      update: {},
      create: { phone: scheduled.phone, name: scheduled.phone },
    });
    const evolutionResponse = await sendWhatsAppMessage(scheduled.phone, scheduled.content);
    const externalId = evolutionResponse.key?.id;
    if (!externalId) throw new Error("A Evolution API não confirmou o ID da mensagem.");

    const message = await prisma.message.upsert({
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

    await prisma.scheduledMessage.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    try {
      getSocketServer().emit("new_message", { message, contact: { ...contact, name: contactDisplayName(contact) } });
    } catch (error) {
      console.error(`Mensagem programada ${id} enviada, mas a atualização em tempo real falhou:`, error);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Falha desconhecida no envio";
    console.error(`Falha ao enviar mensagem programada ${id}:`, error);
    await prisma.scheduledMessage.update({ where: { id }, data: { status: "FAILED", error: detail.slice(0, 2000) } });
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
      take: 20,
      select: { id: true },
    });
    for (const message of due) await sendScheduledMessage(message.id);
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
