import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { sendPushToUser } from "./push.service.js";
import { contactDisplayName } from "../utils/contact-name.js";
import { processInBatches } from "../utils/batch.js";

export type NotificationType =
  | "CONVERSATION_ASSIGNED"
  | "MENTION"
  | "REPLY"
  | "INTERNAL_MENTION"
  | "INTERNAL_REPLY"
  | "NEW_MESSAGE";

export function userRoom(userId: string) {
  return `user:${userId}`;
}

type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  contactId?: number;
  internalConversationId?: string;
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
    internalConversationId: notification.internalConversationId,
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

export function notifyInternalMention(
  conversationId: string,
  conversationName: string,
  content: string,
  userIds: string[],
  actor: { id: string; name: string },
) {
  const preview = content.trim();
  const bodyPreview = preview.length > 110 ? `${preview.slice(0, 107)}...` : preview;
  void safely(processInBatches(
    [...new Set(userIds)].filter((userId) => userId !== actor.id),
    (userId) => safely(createNotification({
      userId,
      type: "INTERNAL_MENTION",
      title: `${actor.name} mencionou você`,
      body: `${conversationName}: ${bodyPreview}`,
      internalConversationId: conversationId,
    })),
    1,
  ));
}

export function notifyReply(
  contact: { id: number; name: string; phone: string; isGroup: boolean; isSaved: boolean },
  message: { content: string; type: string; senderName?: string | null },
  userId: string,
) {
  const preview = message.content.trim() || `[${message.type.toLowerCase()}]`;
  const body = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
  const senderName = message.senderName?.trim() || contactDisplayName(contact);
  void safely((async () => {
    // Uma resposta só deve avisar quem continua responsável por essa conversa.
    const assignment = await prisma.contactAssignment.findUnique({
      where: { contactId_userId: { contactId: contact.id, userId } },
      select: { contactId: true },
    });
    if (!assignment) return;
    await createNotification({
      userId,
      type: "REPLY",
      title: `${senderName} respondeu você`,
      body,
      contactId: contact.id,
    });
  })());
}

export function notifyInternalReply(
  conversationId: string,
  conversationName: string,
  content: string,
  userId: string,
  actor: { id: string; name: string },
) {
  if (userId === actor.id) return;
  const preview = content.trim();
  const bodyPreview = preview.length > 110 ? `${preview.slice(0, 107)}...` : preview;
  void safely(createNotification({
    userId,
    type: "INTERNAL_REPLY",
    title: `${actor.name} respondeu você`,
    body: `${conversationName}: ${bodyPreview}`,
    internalConversationId: conversationId,
  }));
}

export function notifyIncomingMessage(
  contact: { id: number; name: string; phone: string; isGroup: boolean; isSaved: boolean },
  message: { content: string; type: string },
  excludedUserIds: string[] = [],
) {
  safely(
    (async () => {
      const assignments = await prisma.contactAssignment.findMany({
        where: { contactId: contact.id },
        select: { userId: true },
      });
      const excludedUsers = new Set(excludedUserIds);
      const recipients = assignments.filter(({ userId }) => !excludedUsers.has(userId));
      if (!recipients.length) return;

      const preview = message.content.trim() || `[${message.type.toLowerCase()}]`;
      const body = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
      // Além do push, cria a notificação para o socket tocar o som com o app aberto.
      await processInBatches(
        recipients,
        ({ userId }) =>
          safely(
            createNotification({
              userId,
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
