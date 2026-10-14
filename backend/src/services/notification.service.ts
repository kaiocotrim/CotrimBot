import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { sendPushToUser } from "./push.service.js";
import { contactDisplayName } from "../utils/contact-name.js";
import { processInBatches } from "../utils/batch.js";

export type NotificationType = "CONVERSATION_ASSIGNED" | "MENTION" | "NEW_MESSAGE";

export function userRoom(userId: string) {
  return `user:${userId}`;
}

type NewNotification = {
  userId: string;
  type: Exclude<NotificationType, "NEW_MESSAGE">;
  title: string;
  body: string;
  contactId?: number;
};

async function createNotification(data: NewNotification) {
  const notification = await prisma.notification.create({ data });
  getSocketServer().to(userRoom(data.userId)).emit("notification_created", notification);
  // O push chega ao sistema operacional mesmo com o app fechado (PWA).
  await safely(sendPushToUser(data.userId, {
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
  return task.catch((error) => console.error("Erro ao gerar notificação:", error));
}

export function notifyAssignment(
  contact: { id: number; name: string; phone: string; isGroup: boolean; isSaved: boolean },
  userIds: string[],
  actor: { id: string; name: string },
) {
  void safely(
    processInBatches(
      userIds.filter((userId) => userId !== actor.id),
      (userId) =>
        safely(
          createNotification({
            userId,
            type: "CONVERSATION_ASSIGNED",
            title: "Nova conversa atribuída",
            body: `${actor.name} atribuiu a conversa com ${contactDisplayName(contact)} a você.`,
            contactId: contact.id,
          })
        ),
      1
    )
  );
}

export function notifyMention(
  contact: { id: number; name: string; phone: string; isGroup: boolean; isSaved: boolean },
  message: { content: string },
  userIds: string[],
  actor: { id: string; name: string },
) {
  const preview = message.content.trim();
  const bodyPreview = preview.length > 110 ? `${preview.slice(0, 107)}...` : preview;
  void safely(
    processInBatches(
      [...new Set(userIds)].filter((userId) => userId !== actor.id),
      (userId) => safely(createNotification({
        userId,
        type: "MENTION",
        title: `${actor.name} mencionou você`,
        body: `${contactDisplayName(contact)}: ${bodyPreview}`,
        contactId: contact.id,
      })),
      1,
    ),
  );
}

export function notifyIncomingMessage(
  contact: { id: number; name: string; phone: string; isGroup: boolean; isSaved: boolean },
  message: { content: string; type: string },
) {
  safely(
    (async () => {
      const assignments = await prisma.contactAssignment.findMany({
        where: { contactId: contact.id },
        select: { userId: true },
      });
      if (!assignments.length) return;

      const preview = message.content.trim() || `[${message.type.toLowerCase()}]`;
      const body = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
      // Mensagens são apenas push: não entram na central de notificações.
      await processInBatches(
        assignments,
        ({ userId }) =>
          safely(
            sendPushToUser(userId, {
              id: null,
              type: "NEW_MESSAGE",
              title: contactDisplayName(contact),
              body,
              contactId: contact.id,
            })
          ),
        1
      );
    })()
  );
}
