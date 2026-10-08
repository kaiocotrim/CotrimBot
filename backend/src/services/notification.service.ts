import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { sendPushToUser } from "./push.service.js";

export type NotificationType = "CONVERSATION_ASSIGNED" | "NEW_MESSAGE";

export function userRoom(userId: string) {
  return `user:${userId}`;
}

type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  contactId?: number;
};

async function createNotification(data: NewNotification) {
  const notification = await prisma.notification.create({ data });
  getSocketServer().to(userRoom(data.userId)).emit("notification_created", notification);
  // O push chega ao sistema operacional mesmo com o app fechado (PWA).
  safely(sendPushToUser(data.userId, {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    contactId: notification.contactId,
  }));
  return notification;
}

// Falhas aqui não podem interromper o fluxo principal (webhook/atribuição).
function safely(task: Promise<unknown>) {
  task.catch((error) => console.error("Erro ao gerar notificação:", error));
}

export function notifyAssignment(
  contact: { id: number; name: string },
  userIds: string[],
  actor: { id: string; name: string },
) {
  for (const userId of userIds) {
    if (userId === actor.id) continue;
    safely(createNotification({
      userId,
      type: "CONVERSATION_ASSIGNED",
      title: "Nova conversa atribuída",
      body: `${actor.name} atribuiu a conversa com ${contact.name} a você.`,
      contactId: contact.id,
    }));
  }
}

export function notifyIncomingMessage(
  contact: { id: number; name: string },
  message: { content: string; type: string },
) {
  safely((async () => {
    const assignments = await prisma.contactAssignment.findMany({
      where: { contactId: contact.id },
      select: { userId: true },
    });
    if (!assignments.length) return;

    const preview = message.content.trim() || `[${message.type.toLowerCase()}]`;
    const body = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
    await Promise.all(assignments.map(({ userId }) => createNotification({
      userId,
      type: "NEW_MESSAGE",
      title: contact.name,
      body,
      contactId: contact.id,
    })));
  })());
}
