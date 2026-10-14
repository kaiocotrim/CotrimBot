import { Router } from "express";
import type { InternalConversationType, InternalParticipantRole } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { userRoom } from "../services/notification.service.js";

export const internalConversationRouter = Router();

const MAX_MESSAGE_LENGTH = 4_000;
const conversationInclude = {
  participants: {
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  },
  messages: {
    where: { deletedAt: null },
    orderBy: { id: "desc" as const },
    take: 1,
    include: { sender: { select: { id: true, name: true, image: true } } },
  },
} as const;

function stringValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : null;
}

function participantIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

async function membership(organizationId: string, userId: string) {
  return prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true, displayName: true, role: true },
  });
}

async function conversationAccess(organizationId: string, conversationId: string, userId: string) {
  return prisma.internalConversation.findFirst({
    where: {
      id: conversationId,
      organizationId,
      participants: { some: { userId } },
    },
    include: conversationInclude,
  });
}

function publicConversation(conversation: Awaited<ReturnType<typeof conversationAccess>>) {
  if (!conversation) return null;
  const lastMessage = conversation.messages[0] ?? null;
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    type: conversation.type,
    name: conversation.name,
    avatarUrl: conversation.avatarUrl,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    participants: conversation.participants.map(({ user, role, joinedAt, lastReadAt }) => ({
      user,
      role,
      joinedAt,
      lastReadAt,
    })),
    lastMessage,
  };
}

function emitToParticipants(conversation: { participants: Array<{ userId: string }> }, event: string, payload: unknown) {
  const io = getSocketServer();
  for (const participant of conversation.participants) {
    io.to(userRoom(participant.userId)).emit(event, payload);
  }
}

internalConversationRouter.get("/organizations/:organizationId/internal-conversations/members", async (request, response) => {
  const { organizationId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!await membership(organizationId, userId)) return response.status(403).json({ error: "Você não pertence a esta empresa." });

  const members = await prisma.member.findMany({
    where: { organizationId },
    orderBy: [{ displayName: "asc" }, { createdAt: "asc" }],
    select: {
      userId: true,
      displayName: true,
      role: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  return response.json({ members });
});

internalConversationRouter.get("/organizations/:organizationId/internal-conversations", async (request, response) => {
  const { organizationId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!await membership(organizationId, userId)) return response.status(403).json({ error: "Você não pertence a esta empresa." });

  const conversations = await prisma.internalConversation.findMany({
    where: { organizationId, participants: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: conversationInclude,
  });
  const result = conversations.map((conversation) => {
    const item = publicConversation(conversation);
    const participant = conversation.participants.find((entry) => entry.userId === userId);
    const lastMessage = conversation.messages[0];
    return {
      ...item,
      unreadCount: participant?.lastReadAt && lastMessage
        ? (lastMessage.createdAt > participant.lastReadAt ? 1 : 0)
        : lastMessage && lastMessage.senderId !== userId ? 1 : 0,
    };
  });
  return response.json({ conversations: result });
});

internalConversationRouter.post("/organizations/:organizationId/internal-conversations", async (request, response) => {
  const { organizationId } = request.params;
  const userId = request.user?.id;
  const type = request.body?.type as InternalConversationType | undefined;
  const name = request.body?.name === undefined ? null : stringValue(request.body.name, 100);
  const requestedIds = participantIds(request.body?.participantIds);
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (type !== "DIRECT" && type !== "GROUP") return response.status(400).json({ error: "Tipo de conversa inválido." });
  if (request.body?.name !== undefined && name === null) return response.status(400).json({ error: "Nome do grupo inválido." });
  if (!requestedIds) return response.status(400).json({ error: "Participantes inválidos." });

  const ids = [...new Set([userId, ...requestedIds])];
  if (type === "DIRECT" && ids.length !== 2) return response.status(400).json({ error: "Uma conversa individual precisa de dois participantes." });
  if (type === "GROUP" && ids.length < 2) return response.status(400).json({ error: "Um grupo precisa de pelo menos dois participantes." });

  if (!await membership(organizationId, userId)) return response.status(403).json({ error: "Você não pertence a esta empresa." });
  const members = await prisma.member.findMany({
    where: { organizationId, userId: { in: ids } },
    select: { userId: true },
  });
  if (members.length !== ids.length) return response.status(400).json({ error: "Todos os participantes devem pertencer à empresa." });

  const directKey = type === "DIRECT" ? [...ids].sort().join(":") : null;
  const conversation = await prisma.$transaction(async (tx) => {
    if (directKey) {
      const existing = await tx.internalConversation.findUnique({
        where: { organizationId_directKey: { organizationId, directKey } },
        include: conversationInclude,
      });
      if (existing) return existing;
    }
    const created = await tx.internalConversation.create({
      data: {
        organizationId,
        type,
        name: type === "GROUP" ? name : null,
        directKey,
      },
    });
    await tx.internalConversationParticipant.createMany({
      data: ids.map((participantId) => ({
        conversationId: created.id,
        organizationId,
        userId: participantId,
        role: type === "GROUP" && participantId === userId ? "ADMIN" as InternalParticipantRole : "MEMBER" as InternalParticipantRole,
      })),
    });
    return tx.internalConversation.findUniqueOrThrow({
      where: { id: created.id },
      include: conversationInclude,
    });
  });
  return response.status(201).json({ conversation: publicConversation(conversation) });
});

internalConversationRouter.get("/organizations/:organizationId/internal-conversations/:conversationId", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  return response.json({ conversation: publicConversation(conversation) });
});

internalConversationRouter.get("/organizations/:organizationId/internal-conversations/:conversationId/messages", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const userId = request.user?.id;
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(request.query.limit ?? 50) || 50)));
  const before = request.query.before ? Number(request.query.before) : undefined;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (before !== undefined && (!Number.isInteger(before) || before <= 0)) return response.status(400).json({ error: "Paginação inválida." });
  if (!await conversationAccess(organizationId, conversationId, userId)) return response.status(404).json({ error: "Conversa não encontrada." });

  const messages = await prisma.internalMessage.findMany({
    where: { organizationId, conversationId, ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: {
      sender: { select: { id: true, name: true, image: true } },
      replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } },
      reactions: { select: { userId: true, emoji: true } },
    },
  });
  const hasMore = messages.length > limit;
  return response.json({ messages: messages.slice(0, limit).reverse(), hasMore, nextCursor: hasMore ? messages[limit - 1]?.id ?? null : null });
});

internalConversationRouter.post("/organizations/:organizationId/internal-conversations/:conversationId/messages", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const userId = request.user?.id;
  const content = stringValue(request.body?.content, MAX_MESSAGE_LENGTH);
  const clientId = request.body?.clientId === undefined ? null : stringValue(request.body.clientId, 80);
  const replyToMessageId = request.body?.replyToMessageId === undefined ? null : Number(request.body.replyToMessageId);
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!content) return response.status(400).json({ error: "A mensagem não pode estar vazia." });
  if (clientId === undefined || (replyToMessageId !== null && (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0))) {
    return response.status(400).json({ error: "Dados da mensagem inválidos." });
  }
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  if (replyToMessageId !== null) {
    const reply = await prisma.internalMessage.findFirst({ where: { id: replyToMessageId, organizationId, conversationId } });
    if (!reply) return response.status(400).json({ error: "A mensagem respondida não pertence a esta conversa." });
  }

  const message = await prisma.internalMessage.create({
    data: { organizationId, conversationId, senderId: userId, content, clientId, replyToMessageId },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } },
      reactions: { select: { userId: true, emoji: true } },
    },
  });
  await prisma.internalConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  emitToParticipants(conversation, "internal:message:new", { organizationId, conversationId, message });
  return response.status(201).json({ message });
});

internalConversationRouter.patch("/organizations/:organizationId/internal-conversations/:conversationId/read", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  const participant = await prisma.internalConversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });
  emitToParticipants(conversation, "internal:conversation:read", { organizationId, conversationId, userId, lastReadAt: participant.lastReadAt });
  return response.json({ lastReadAt: participant.lastReadAt });
});

internalConversationRouter.post("/organizations/:organizationId/internal-conversations/:conversationId/messages/:messageId/reactions", async (request, response) => {
  const { organizationId, conversationId, messageId } = request.params;
  const userId = request.user?.id;
  const emoji = stringValue(request.body?.emoji, 32);
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!emoji) return response.status(400).json({ error: "Emoji inválido." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  const message = await prisma.internalMessage.findFirst({ where: { id: Number(messageId), organizationId, conversationId } });
  if (!message) return response.status(404).json({ error: "Mensagem não encontrada." });
  const reaction = await prisma.internalMessageReaction.upsert({
    where: { messageId_userId: { messageId: message.id, userId } },
    update: { emoji },
    create: { messageId: message.id, userId, emoji },
  });
  emitToParticipants(conversation, "internal:reaction:updated", { organizationId, conversationId, messageId: message.id, reaction });
  return response.json({ reaction });
});

internalConversationRouter.delete("/organizations/:organizationId/internal-conversations/:conversationId/messages/:messageId/reactions", async (request, response) => {
  const { organizationId, conversationId, messageId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  await prisma.internalMessageReaction.deleteMany({ where: { messageId: Number(messageId), userId } });
  emitToParticipants(conversation, "internal:reaction:updated", { organizationId, conversationId, messageId: Number(messageId), userId, reaction: null });
  return response.status(204).send();
});

internalConversationRouter.delete("/organizations/:organizationId/internal-conversations/:conversationId/messages/:messageId", async (request, response) => {
  const { organizationId, conversationId, messageId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  const message = await prisma.internalMessage.findFirst({ where: { id: Number(messageId), organizationId, conversationId, senderId: userId } });
  if (!message) return response.status(404).json({ error: "Mensagem não encontrada ou sem permissão." });
  const deleted = await prisma.internalMessage.update({ where: { id: message.id }, data: { deletedAt: new Date(), content: "" } });
  emitToParticipants(conversation, "internal:message:deleted", { organizationId, conversationId, messageId: deleted.id });
  return response.json({ messageId: deleted.id });
});

internalConversationRouter.get("/organizations/:organizationId/internal-conversations/:conversationId/participants", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  return response.json({ participants: conversation.participants });
});
