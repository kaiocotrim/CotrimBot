import { Router, type ErrorRequestHandler, type Request, type Response } from "express";
import multer from "multer";
import type { InternalConversationType, InternalParticipantRole } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { notifyInternalMention, notifyInternalReply, userRoom } from "../services/notification.service.js";
import { transcribeAudio } from "../services/transcription.service.js";
import { getSignedOutgoingText } from "../services/user-signature.service.js";

export const internalConversationRouter = Router();

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_MEDIA_SIZE = 25 * 1024 * 1024;
const uploadMedia = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MEDIA_SIZE } });
const mediaSelect = { mimeType: true, fileName: true } as const;
const messageInclude = {
  sender: { select: { id: true, name: true, image: true } },
  replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } },
  reactions: { select: { userId: true, emoji: true } },
  media: { select: mediaSelect },
} as const;

function imageMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function acceptedMedia(file: Express.Multer.File): { mimeType: string; label: string } | null {
  if (!file.buffer.length) return null;
  const imageType = imageMimeType(file.buffer);
  if (imageType) return { mimeType: imageType, label: "[Imagem]" };
  const bytes = file.buffer;
  const declared = file.mimetype.split(";")[0]?.toLowerCase();
  const extension = file.originalname.split(".").pop()?.toLowerCase();
  const ebml = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const mp4 = bytes.subarray(4, 8).toString("ascii") === "ftyp";
  if (declared === "video/webm" && ebml) return { mimeType: "video/webm", label: "[Vídeo]" };
  if (declared === "audio/webm" && ebml) return { mimeType: "audio/webm", label: "[Áudio]" };
  if (declared === "video/mp4" && mp4) return { mimeType: "video/mp4", label: "[Vídeo]" };
  if ((declared === "audio/mp4" || declared === "audio/x-m4a") && mp4) return { mimeType: "audio/mp4", label: "[Áudio]" };
  if ((declared === "audio/ogg" || declared === "application/ogg") && bytes.subarray(0, 4).toString("ascii") === "OggS") return { mimeType: "audio/ogg", label: "[Áudio]" };
  if (declared === "audio/mpeg" && (bytes.subarray(0, 3).toString("ascii") === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0))) return { mimeType: "audio/mpeg", label: "[Áudio]" };
  if ((declared === "audio/wav" || declared === "audio/x-wav") && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") return { mimeType: "audio/wav", label: "[Áudio]" };
  if (extension === "pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return { mimeType: "application/pdf", label: file.originalname };
  const officeZip = ["docx", "xlsx", "pptx", "zip"].includes(extension ?? "") && bytes.subarray(0, 2).toString("ascii") === "PK";
  const oldOffice = ["doc", "xls", "ppt"].includes(extension ?? "") && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const plainText = ["txt", "csv"].includes(extension ?? "") && !bytes.includes(0);
  if (officeZip || oldOffice || plainText) return { mimeType: "application/octet-stream", label: file.originalname };
  return null;
}
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
    include: { sender: { select: { id: true, name: true, image: true } }, media: { select: mediaSelect } },
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
      pinned: participant?.pinned ?? false,
      archived: participant?.archived ?? false,
      unreadCount: participant?.lastReadAt && lastMessage
        ? (lastMessage.createdAt > participant.lastReadAt ? 1 : 0)
        : lastMessage && lastMessage.senderId !== userId ? 1 : 0,
    };
  });
  return response.json({ conversations: result });
});

internalConversationRouter.patch("/organizations/:organizationId/internal-conversations/:conversationId/preferences", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (typeof request.body?.pinned !== "boolean" && typeof request.body?.archived !== "boolean") {
    return response.status(400).json({ error: "Preferências inválidas." });
  }
  if (!await conversationAccess(organizationId, conversationId, userId)) {
    return response.status(404).json({ error: "Conversa não encontrada." });
  }
  const participant = await prisma.internalConversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: {
      ...(typeof request.body.pinned === "boolean" ? { pinned: request.body.pinned } : {}),
      ...(typeof request.body.archived === "boolean" ? { archived: request.body.archived } : {}),
    },
    select: { pinned: true, archived: true },
  });
  return response.json(participant);
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
  emitToParticipants(conversation, "internal:conversation:updated", { organizationId, conversationId: conversation.id });
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
    include: messageInclude,
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
  const isPrivate = request.body?.private ?? false;
  const includeSignature = request.body?.includeSignature ?? true;
  const mentionedUserIds = request.body?.mentionedUserIds ?? [];
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!content) return response.status(400).json({ error: "A mensagem não pode estar vazia." });
  if (typeof isPrivate !== "boolean" || typeof includeSignature !== "boolean") return response.status(400).json({ error: "Opções da mensagem inválidas." });
  const mentions = participantIds(mentionedUserIds);
  if (!mentions || mentions.length > 20) return response.status(400).json({ error: "Menções inválidas." });
  if (clientId === undefined || (replyToMessageId !== null && (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0))) {
    return response.status(400).json({ error: "Dados da mensagem inválidos." });
  }
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  if (mentions.some((id) => !conversation.participants.some((participant) => participant.userId === id))) {
    return response.status(400).json({ error: "Um ou mais membros mencionados não participam desta conversa." });
  }
  const repliedMessage = replyToMessageId === null
    ? null
    : await prisma.internalMessage.findFirst({ where: { id: replyToMessageId, organizationId, conversationId } });
  if (replyToMessageId !== null && !repliedMessage) {
    return response.status(400).json({ error: "A mensagem respondida não pertence a esta conversa." });
  }

  const finalContent = isPrivate ? content : await getSignedOutgoingText(userId, organizationId, content, undefined, includeSignature);
  const message = await prisma.internalMessage.create({
    data: { organizationId, conversationId, senderId: userId, content: finalContent, private: isPrivate, clientId, replyToMessageId },
    include: messageInclude,
  });
  await prisma.internalConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  emitToParticipants(conversation, "internal:message:new", { organizationId, conversationId, message });
  if (mentions.length) notifyInternalMention(
    conversationId,
    conversation.type === "DIRECT" ? message.sender.name : conversation.name || "Grupo interno",
    content,
    mentions,
    { id: userId, name: message.sender.name },
  );
  if (repliedMessage && !mentions.includes(repliedMessage.senderId)) notifyInternalReply(
    conversationId,
    conversation.type === "DIRECT" ? message.sender.name : conversation.name || "Grupo interno",
    content,
    repliedMessage.senderId,
    { id: userId, name: message.sender.name },
  );
  for (const mentionedUserId of mentions) {
    if (mentionedUserId !== userId) getSocketServer().to(userRoom(mentionedUserId)).emit("internal:mention", { organizationId, conversationId, messageId: message.id, senderName: message.sender.name });
  }
  return response.status(201).json({ message });
});

const receiveMedia = async (request: Request, response: Response) => {
  const organizationId = String(request.params.organizationId);
  const conversationId = String(request.params.conversationId);
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  const file = request.file;
  const media = file && acceptedMedia(file);
  if (!file || !media) return response.status(400).json({ error: "Formato de arquivo não suportado." });
  const caption = typeof request.body?.caption === "string" ? request.body.caption.trim() : "";
  if (caption.length > MAX_MESSAGE_LENGTH) return response.status(400).json({ error: "Legenda muito longa." });
  const includeSignature = request.body?.includeSignature !== "false";
  const replyToMessageId = request.body?.replyToMessageId ? Number(request.body.replyToMessageId) : null;
  const repliedMessage = replyToMessageId === null || !Number.isInteger(replyToMessageId)
    ? null
    : await prisma.internalMessage.findFirst({ where: { id: replyToMessageId, organizationId, conversationId } });
  if (replyToMessageId !== null && !repliedMessage) {
    return response.status(400).json({ error: "A mensagem respondida não pertence a esta conversa." });
  }
  const content = caption ? await getSignedOutgoingText(userId, organizationId, caption, undefined, includeSignature) : media.label;
  const message = await prisma.internalMessage.create({
    data: {
      organizationId, conversationId, senderId: userId, type: "FILE", content, replyToMessageId,
      media: { create: { mimeType: media.mimeType, fileName: file.originalname.slice(0, 255), data: Uint8Array.from(file.buffer) } },
    },
    include: messageInclude,
  });
  await prisma.internalConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  emitToParticipants(conversation, "internal:message:new", { organizationId, conversationId, message });
  if (repliedMessage) notifyInternalReply(
    conversationId,
    conversation.type === "DIRECT" ? message.sender.name : conversation.name || "Grupo interno",
    content,
    repliedMessage.senderId,
    { id: userId, name: message.sender.name },
  );
  return response.status(201).json({ message });
};
internalConversationRouter.post("/organizations/:organizationId/internal-conversations/:conversationId/media", uploadMedia.single("file"), receiveMedia);
internalConversationRouter.post("/organizations/:organizationId/internal-conversations/:conversationId/images", uploadMedia.single("file"), receiveMedia);

internalConversationRouter.get("/organizations/:organizationId/internal-conversations/:conversationId/messages/:messageId/media", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const messageId = Number(request.params.messageId);
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!Number.isInteger(messageId) || !await conversationAccess(organizationId, conversationId, userId)) {
    return response.status(404).json({ error: "Arquivo não encontrado." });
  }
  const message = await prisma.internalMessage.findFirst({
    where: { id: messageId, organizationId, conversationId, deletedAt: null },
    select: { media: true },
  });
  if (!message?.media) return response.status(404).json({ error: "Arquivo não encontrado." });
  const media = message.media;
  const bytes = Buffer.from(media.data);
  const inline = /^(image|video|audio)\//.test(media.mimeType) && request.query.download !== "1";
  response.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(media.fileName)}`);
  response.setHeader("Content-Type", message.media.mimeType);
  response.setHeader("Cache-Control", "private, max-age=3600");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Accept-Ranges", "bytes");
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : bytes.length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end >= bytes.length) {
      response.setHeader("Content-Range", `bytes */${bytes.length}`);
      return response.status(416).end();
    }
    response.setHeader("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
    response.setHeader("Content-Length", end - start + 1);
    return response.status(206).end(bytes.subarray(start, end + 1));
  }
  response.setHeader("Content-Length", bytes.length);
  return response.end(bytes);
});

internalConversationRouter.post("/organizations/:organizationId/internal-conversations/:conversationId/messages/:messageId/transcribe", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const messageId = Number(request.params.messageId);
  const userId = request.user?.id;
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!Number.isInteger(messageId) || !await conversationAccess(organizationId, conversationId, userId)) {
    return response.status(404).json({ error: "Áudio não encontrado." });
  }
  const message = await prisma.internalMessage.findFirst({
    where: { id: messageId, organizationId, conversationId, deletedAt: null },
    select: { media: true },
  });
  if (!message?.media?.mimeType.startsWith("audio/")) return response.status(400).json({ error: "Essa mensagem não é um áudio." });
  const transcription = await transcribeAudio({
    base64: Buffer.from(message.media.data).toString("base64"),
    mimetype: message.media.mimeType,
    fileName: message.media.fileName,
  });
  return response.json({ messageId, transcription });
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

internalConversationRouter.post("/organizations/:organizationId/internal-conversations/:conversationId/participants", async (request, response) => {
  const { organizationId, conversationId } = request.params;
  const userId = request.user?.id;
  const ids = participantIds(request.body?.participantIds);
  if (!userId) return response.status(401).json({ error: "Não autenticado." });
  if (!ids?.length) return response.status(400).json({ error: "Selecione pelo menos um participante." });
  const conversation = await conversationAccess(organizationId, conversationId, userId);
  if (!conversation) return response.status(404).json({ error: "Conversa não encontrada." });
  if (conversation.type !== "GROUP" || conversation.participants.find((item) => item.userId === userId)?.role !== "ADMIN") {
    return response.status(403).json({ error: "Apenas administradores podem adicionar participantes ao grupo." });
  }
  const members = await prisma.member.findMany({ where: { organizationId, userId: { in: ids } }, select: { userId: true } });
  if (members.length !== ids.length) return response.status(400).json({ error: "Todos os participantes devem pertencer à empresa." });
  await prisma.internalConversationParticipant.createMany({
    data: ids.map((participantId) => ({ organizationId, conversationId, userId: participantId })),
    skipDuplicates: true,
  });
  await prisma.internalConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  const updated = await prisma.internalConversation.findUniqueOrThrow({ where: { id: conversationId }, include: conversationInclude });
  emitToParticipants(updated, "internal:conversation:updated", { organizationId, conversationId });
  return response.json({ conversation: publicConversation(updated) });
});

const internalChatErrorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  console.error("Erro no chat interno:", error);
  if (response.headersSent) return;
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({ error: "O arquivo deve ter no máximo 25 MB." });
    return;
  }
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "P2021") {
    response.status(503).json({ error: "O banco ainda não tem as tabelas do chat interno. Aplique as migrações do Prisma." });
    return;
  }
  if (code === "P2022") {
    response.status(503).json({ error: "O banco ainda não tem todos os campos do chat interno. Aplique as migrações do Prisma." });
    return;
  }
  if (code === "P1001" || code === "P1002") {
    response.status(503).json({ error: "O banco de dados está inacessível. Verifique a conexão com o MySQL." });
    return;
  }
  response.status(500).json({ error: "Falha no servidor ao carregar o chat interno. Consulte o terminal do backend." });
};
internalConversationRouter.use(internalChatErrorHandler);
