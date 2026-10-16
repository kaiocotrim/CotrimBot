import type { Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { notifyIncomingMessage, notifyReply } from "../services/notification.service.js";
import { getGroupInfo, getMediaMessage } from "../services/evolution.service.js";
import { contactDisplayName } from "../utils/contact-name.js";
import { extractSharedContacts } from "../utils/shared-contact.js";
import {
  findReplyContextInfo,
  getQuotedContent,
  isViewOnceMessage,
  unwrapWhatsAppMessage,
} from "../utils/whatsapp-message.js";
import { normalizeWhatsAppJid, whatsAppJidIdentifier } from "../utils/whatsapp-jid.js";

// Impede que sincronizações da Evolution repovoem o banco com o histórico antigo.
// Mantemos uma pequena tolerância para mensagens que estavam em trânsito no reinício.
const webhookStartedAt = Date.now();
const messageGracePeriodMs = 60_000;

function getMessageTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? parsed > 1_000_000_000_000 ? parsed : parsed * 1000
      : null;
  }

  if (value && typeof value === "object" && "low" in value) {
    const low = Number((value as { low: unknown }).low);
    return Number.isFinite(low) ? low * 1000 : null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getWhatsAppProfileName(value: unknown): string | null {
  if (!isRecord(value)) return null;

  const sender = isRecord(value.sender) ? value.sender : null;
  const candidate = [
    value.pushName,
    value.pushname,
    value.notifyName,
    value.senderName,
    sender?.pushName,
    sender?.pushname,
    sender?.notifyName,
    sender?.name,
  ].find((name): name is string => typeof name === "string" && Boolean(name.trim()));

  return candidate ? candidate.trim().replace(/\s+/g, " ").slice(0, 191) : null;
}

type PresenceStatus = "unavailable" | "available" | "composing" | "recording" | "paused";
const presenceStatuses = new Set<PresenceStatus>(["unavailable", "available", "composing", "recording", "paused"]);

function asPresenceStatus(value: unknown): PresenceStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase() as PresenceStatus;
  return presenceStatuses.has(normalized) ? normalized : null;
}

function getPresenceStatus(value: unknown): PresenceStatus | null {
  if (!isRecord(value)) return null;

  const directStatus = asPresenceStatus(value.presence)
    ?? asPresenceStatus(value.lastKnownPresence)
    ?? asPresenceStatus(value.status);
  if (directStatus) return directStatus;

  if (!isRecord(value.presences)) return null;
  const statuses = Object.values(value.presences)
    .map((presence) => isRecord(presence)
      ? asPresenceStatus(presence.lastKnownPresence) ?? asPresenceStatus(presence.presence) ?? asPresenceStatus(presence.status)
      : null)
    .filter((status): status is PresenceStatus => status !== null);

  return statuses.includes("composing") ? "composing" : statuses[0] ?? null;
}

function getPresenceJids(value: unknown) {
  if (!isRecord(value)) return [];
  const key = isRecord(value.key) ? value.key : null;
  const directCandidates = [value.id, value.remoteJid, value.remoteJidAlt, value.jid, key?.remoteJid, key?.remoteJidAlt]
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.includes("@"));

  if (directCandidates.length || !isRecord(value.presences)) return [...new Set(directCandidates)];
  return [...new Set(Object.keys(value.presences).filter((candidate) => candidate.includes("@")))];
}

function getDeletedMessageExternalId(value: unknown): string | null {
  if (!isRecord(value)) return null;

  const key = isRecord(value.key) ? value.key : null;
  const message = isRecord(value.message) ? value.message : null;
  const protocolMessage = isRecord(value.protocolMessage)
    ? value.protocolMessage
    : message && isRecord(message.protocolMessage)
      ? message.protocolMessage
      : null;
  const protocolKey = protocolMessage && isRecord(protocolMessage.key)
    ? protocolMessage.key
    : null;
  const candidates = [key?.id, value.id, value.keyId, protocolKey?.id];
  const externalId = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());

  return typeof externalId === "string" ? externalId.trim() : null;
}

async function markMessageAsDeleted(externalId: string) {
  const message = await prisma.message.findUnique({ where: { externalId } });
  if (!message || message.deletedAt) return;

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { deletedAt: new Date() },
  });

  getSocketServer().emit("message_deleted", {
    messageId: updated.id,
    deletedAt: updated.deletedAt,
  });
}

async function cacheMessageMedia(messageId: number, externalId: string) {
  const media = await getMediaMessage(externalId);
  await prisma.messageMedia.upsert({
    where: { messageId },
    create: {
      messageId,
      data: Buffer.from(media.base64, "base64"),
      mimetype: media.mimetype,
      fileName: media.fileName ?? null,
    },
    update: {
      data: Buffer.from(media.base64, "base64"),
      mimetype: media.mimetype,
      fileName: media.fileName ?? null,
    },
  });
}

export async function whatsappWebhook(req: Request, res: Response) {
  const body = req.body;

  if (body.event === "presence.update") {
    const updates = Array.isArray(body.data) ? body.data : [body.data];
    for (const update of updates) {
      const presence = getPresenceStatus(update);
      const jids = getPresenceJids(update);
      if (!presence || !jids.length) continue;

      const normalizedJids = jids.map(normalizeWhatsAppJid);
      const phones = normalizedJids.map(whatsAppJidIdentifier);
      const contact = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: { in: phones } },
            { whatsappLid: { in: normalizedJids } },
          ],
        },
      });
      if (!contact) continue;

      getSocketServer().emit("contact_presence", {
        contactId: contact.id,
        presence,
        isTyping: presence === "composing",
      });
    }
    return res.status(200).json({ received: true });
  }

  // Mantém a separação entre conversas ativas e arquivadas sincronizada com o WhatsApp.
  if (body.event === "chats.update" || body.event === "chats.upsert") {
    const chats = Array.isArray(body.data) ? body.data : [body.data];
    for (const chat of chats) {
      const rawRemoteJid = chat?.id ?? chat?.remoteJid;
      const archived = chat?.archive ?? chat?.archived;
      if (typeof rawRemoteJid !== "string" || typeof archived !== "boolean") continue;

      const phone = whatsAppJidIdentifier(rawRemoteJid);
      const contact = await prisma.contact.findUnique({ where: { phone } });
      if (!contact || contact.archived === archived) continue;

      const updatedContact = await prisma.contact.update({
        where: { id: contact.id },
        data: { archived },
      });
      getSocketServer().emit("contact_updated", { ...updatedContact, name: contactDisplayName(updatedContact) });
    }
    return res.status(200).json({ received: true });
  }

  // Confirmações de entrega/leitura das mensagens enviadas pelo CotrimBot.
  if (body.event === "messages.delete") {
    const deletions = Array.isArray(body.data) ? body.data : [body.data];
    for (const deletion of deletions) {
      const externalId = getDeletedMessageExternalId(deletion);
      if (externalId) await markMessageAsDeleted(externalId);
    }
    return res.status(200).json({ received: true });
  }

  if (body.event === "messages.update" || body.event === "send.message.update") {
    const updates = Array.isArray(body.data) ? body.data : [body.data];
    for (const update of updates) {
      const externalId = update?.key?.id ?? update?.id;
      const status = String(update?.status ?? update?.update?.status ?? "").toUpperCase();
      if (externalId && status === "DELETED") {
        await markMessageAsDeleted(externalId);
        continue;
      }
      if (!externalId || !["READ", "PLAYED", "4"].includes(status)) continue;

      const message = await prisma.message.findUnique({ where: { externalId } });
      if (!message || message.direction !== "OUTGOING" || message.readAt) continue;

      const updated = await prisma.message.update({ where: { id: message.id }, data: { readAt: new Date() } });
      getSocketServer().emit("message_read", { messageId: updated.id, readAt: updated.readAt });
    }
    return res.status(200).json({ received: true });
  }

  // Aceitamos somente eventos de nova mensagem
  if (body.event !== "messages.upsert") {
    return res.status(200).json({
      received: true,
    });
  }

  const data = Array.isArray(body.data) ? body.data[0] : body.data;

  const messageTimestamp = getMessageTimestamp(data?.messageTimestamp);
  if (
    messageTimestamp !== null &&
    messageTimestamp < webhookStartedAt - messageGracePeriodMs
  ) {
    console.log("Mensagem antiga ignorada durante sincronização.");
    return res.status(200).json({ received: true });
  }

  const viewOnce = isViewOnceMessage(data?.message);
  const messagePayload = unwrapWhatsAppMessage(data?.message);
  data.message = messagePayload;
  const revokedExternalId = getDeletedMessageExternalId({ message: messagePayload });
  if (revokedExternalId && messagePayload.protocolMessage) {
    await markMessageAsDeleted(revokedExternalId);
    return res.status(200).json({ received: true });
  }
  const dataContextInfo = [data.contextInfo, data.messageContextInfo];
  const replyContextInfo = findReplyContextInfo(messagePayload, dataContextInfo);
  const rawQuotedExternalId = replyContextInfo?.stanzaId;
  const quotedExternalId = typeof rawQuotedExternalId === "string" && rawQuotedExternalId.trim()
    ? rawQuotedExternalId.trim()
    : null;
  const quotedContent = replyContextInfo
    ? getQuotedContent(replyContextInfo.quotedMessage)
    : null;

  const rawRemoteJid = data.key?.remoteJid;
  const rawRemoteJidAlt = data.key?.remoteJidAlt;
  const remoteJid = typeof rawRemoteJid === "string" ? normalizeWhatsAppJid(rawRemoteJid) : null;
  const remoteJidAlt = typeof rawRemoteJidAlt === "string" ? normalizeWhatsAppJid(rawRemoteJidAlt) : null;
  const fromMe = data.key?.fromMe === true;

  // Ignora mensagens sem identificação.
  if (!remoteJid) {
    console.log("Mensagem sem remoteJid.");

    return res.status(200).json({
      received: true,
    });
  }

  // Esse será o JID que usaremos para descobrir
  // o telefone real do contato.
  let contactJid: string;

  // Formato tradicional do WhatsApp.
  if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@s.whatsapp.net")) {
    contactJid = remoteJid;
  }

  // Alguns contatos chegam usando o formato @lid.
  // Quando isso acontecer, tentamos usar o JID alternativo
  // que contém o número tradicional.
  else if (
    remoteJid.endsWith("@lid") &&
    remoteJidAlt?.endsWith("@s.whatsapp.net")
  ) {
    contactJid = remoteJidAlt;

    console.log("Contato @lid convertido para telefone:", {
      lid: remoteJid,
      jid: contactJid,
    });
  }

  // Se ainda não conseguimos descobrir o telefone,
  // não tentamos criar um contato errado no banco.
  else {
    console.log(
      "Formato de contato ainda não suportado:",
      {
        remoteJid,
        remoteJidAlt,
      }
    );

    return res.status(200).json({
      received: true,
    });
  }

  // ID original da mensagem enviado pelo WhatsApp/Evolution.
  // Usamos isso para impedir mensagens duplicadas no banco.
  const externalId = data.key?.id;

  const isGroup = contactJid.endsWith("@g.us");
  const rawPrimaryParticipantJid = isGroup ? data.key?.participant ?? data.participant : null;
  const rawAlternateParticipantJid = isGroup ? data.key?.participantAlt : null;
  const primaryParticipantJid = typeof rawPrimaryParticipantJid === "string"
    ? normalizeWhatsAppJid(rawPrimaryParticipantJid)
    : null;
  const alternateParticipantJid = typeof rawAlternateParticipantJid === "string"
    ? normalizeWhatsAppJid(rawAlternateParticipantJid)
    : null;
  const participantJid = typeof primaryParticipantJid === "string"
    && primaryParticipantJid.endsWith("@lid")
    && typeof alternateParticipantJid === "string"
    && alternateParticipantJid.endsWith("@s.whatsapp.net")
      ? alternateParticipantJid
      : primaryParticipantJid ?? alternateParticipantJid;
  const senderPhone = typeof participantJid === "string"
    ? whatsAppJidIdentifier(participantJid)
    : null;
  const senderIdentifiers = [...new Set([
    senderPhone,
    typeof primaryParticipantJid === "string"
      ? whatsAppJidIdentifier(primaryParticipantJid)
      : null,
    typeof alternateParticipantJid === "string"
      ? whatsAppJidIdentifier(alternateParticipantJid)
      : null,
  ].filter((identifier): identifier is string => Boolean(identifier)))];
  const savedSender = isGroup && !fromMe && senderPhone
    ? await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: senderPhone },
            ...(typeof primaryParticipantJid === "string" && primaryParticipantJid.endsWith("@lid")
              ? [{ whatsappLid: primaryParticipantJid }]
              : []),
          ],
        },
        select: { id: true, name: true, isSaved: true, whatsappLid: true },
      })
    : null;
  const whatsappSenderName = getWhatsAppProfileName(data);
  const senderName = isGroup && !fromMe
    ? savedSender?.isSaved ? savedSender.name : whatsappSenderName ?? senderPhone ?? "Participante"
    : null;
  const backfillGroupSenderName = async (contactId: number) => {
    if (!isGroup || fromMe || savedSender?.isSaved || !whatsappSenderName || !senderIdentifiers.length) return;

    const result = await prisma.message.updateMany({
      where: {
        contactId,
        senderPhone: { in: senderIdentifiers },
        OR: [
          { senderName: null },
          { senderName: "Participante" },
          { senderName: { in: senderIdentifiers } },
        ],
      },
      data: { senderName: whatsappSenderName },
    });

    if (result.count) {
      getSocketServer().emit("group_sender_updated", {
        contactId,
        senderPhones: senderIdentifiers,
        senderName: whatsappSenderName,
      });
    }
  };
  const reportedMessageType = String(data.messageType ?? data.type ?? body.messageType ?? "").toLowerCase();

  // Tipo da mensagem que será salvo no banco.
  let messageType: "TEXT" | "CONTACT" | "AUDIO" | "IMAGE" | "STICKER" | "VIDEO" | "DOCUMENT";
  const sharedContacts = extractSharedContacts(data.message ?? {});

  // Conteúdo exibido no CotrimBot.
  let content: string;

  // Mensagem de texto normal.
  if (data.message?.contactMessage || data.message?.contactsArrayMessage) {
    messageType = "CONTACT";
    content = sharedContacts.length ? sharedContacts.map((card) => `${card.name}: +${card.phone}`).join("\n") : "[Contato compartilhado]";
  }
  else if (data.message?.conversation) {
    messageType = "TEXT";
    content = data.message.conversation;
  }
  // Algumas mensagens de texto chegam neste formato.
  else if (data.message?.extendedTextMessage?.text) {
    messageType = "TEXT";
    content = data.message.extendedTextMessage.text;
  }
  // Áudio.
  else if (data.message?.audioMessage) {
    messageType = "AUDIO";
    content = "[Áudio]";

    console.log(
      "🎵 Payload do áudio recebido:",
      JSON.stringify(
        data.message.audioMessage,
        null,
        2
      )
    );
  }
  // Imagem: usa a legenda quando disponível.
  else if (data.message?.stickerMessage || reportedMessageType.includes("sticker")) {
    messageType = "STICKER";
    content = "[Figurinha]";
  }
  else if (data.message?.imageMessage) {
    messageType = "IMAGE";
    content = data.message.imageMessage.caption || "[Imagem]";
  }
  // Vídeo: usa a legenda quando disponível.
  else if (data.message?.videoMessage) {
    messageType = "VIDEO";
    content = data.message.videoMessage.caption || "[Vídeo]";
  }
  // Documento: usa o nome do arquivo quando disponível.
  else if (data.message?.documentMessage) {
    messageType = "DOCUMENT";
    content = data.message.documentMessage.fileName || "[Documento]";
  }
  // Tipo que ainda não sabemos processar.
  else {
    console.log("Tipo de mensagem ainda não suportado:", data.message);

    return res.status(200).json({
      received: true,
    });
  }

  // Contatos usam somente o número; grupos preservam o JID necessário para responder.
  const phone = whatsAppJidIdentifier(contactJid);

  // Ignora mensagens sem ID.
  if (!externalId) {
    console.log("Mensagem sem ID. Ignorando.");

    return res.status(200).json({
      received: true,
    });
  }

  // Verifica se essa mensagem já foi registrada.
  const existingMessage = await prisma.message.findUnique({
    where: {
      externalId,
    },
  });

  // A Evolution pode repetir o mesmo ID com os metadados completos alguns
  // instantes depois. Só enriquecemos como resposta quando há quotedMessage.
  if (existingMessage) {
    await backfillGroupSenderName(existingMessage.contactId);

    if (replyContextInfo && !existingMessage.quotedMessageId) {
      const quotedMessage = quotedExternalId
        ? await prisma.message.findFirst({
            where: { externalId: quotedExternalId, contactId: existingMessage.contactId },
          })
        : null;
      const contact = await prisma.contact.findUnique({ where: { id: existingMessage.contactId } });
      const quotedParticipant = typeof replyContextInfo.participant === "string"
        ? whatsAppJidIdentifier(replyContextInfo.participant)
        : null;
      const quotedSenderName = quotedMessage
        ? quotedMessage.direction === "OUTGOING" ? "Você" : quotedMessage.senderName ?? (contact ? contactDisplayName(contact) : null)
        : quotedParticipant;

      const updatedMessage = await prisma.message.update({
        where: { id: existingMessage.id },
        data: {
          quotedExternalId,
          quotedMessageId: quotedMessage?.id ?? null,
          quotedContent: quotedMessage?.content ?? quotedContent,
          quotedSenderName,
        },
      });

      getSocketServer().emit("message_quote_updated", {
        messageId: updatedMessage.id,
        quotedExternalId: updatedMessage.quotedExternalId,
        quotedMessageId: updatedMessage.quotedMessageId,
        quotedContent: updatedMessage.quotedContent,
        quotedSenderName: updatedMessage.quotedSenderName,
      });
      if (existingMessage.direction === "INCOMING" && quotedMessage?.direction === "OUTGOING" && quotedMessage.sentByUserId && contact) {
        notifyReply(contact, existingMessage, quotedMessage.sentByUserId);
      }
    }

    console.log("Mensagem já registrada:", externalId);

    return res.status(200).json({
      received: true,
    });
  }

  const existingContact = await prisma.contact.findUnique({ where: { phone } });
  let name = existingContact?.name ?? phone;
  if (isGroup && !existingContact) {
    name = data.groupMetadata?.subject ?? "Grupo do WhatsApp";
    try {
      const group = await getGroupInfo(contactJid);
      if (group.subject?.trim()) name = group.subject.trim();
    } catch (error) {
      console.error("Não foi possível buscar o nome do grupo:", error);
    }
  }

  // Procura o contato pelo telefone/JID.
  // Se não existir, cria.
  // Se já existir, atualiza o nome.
  const contact = await prisma.contact.upsert({
    where: {
      phone,
    },

    update: {
      name,
      isGroup,
      ...(remoteJid.endsWith("@lid") ? { whatsappLid: remoteJid } : {}),
    },

    create: {
      name,
      phone,
      isGroup,
      ...(remoteJid.endsWith("@lid") ? { whatsappLid: remoteJid } : {}),
    },
  });

  await backfillGroupSenderName(contact.id);

  const quotedMessage = replyContextInfo && quotedExternalId
    ? await prisma.message.findFirst({ where: { externalId: quotedExternalId, contactId: contact.id } })
    : null;
  const quotedParticipant = replyContextInfo && typeof replyContextInfo.participant === "string"
    ? whatsAppJidIdentifier(replyContextInfo.participant)
    : null;
  const quotedSenderName = replyContextInfo
    ? quotedMessage
      ? quotedMessage.direction === "OUTGOING" ? "Você" : quotedMessage.senderName ?? contactDisplayName(contact)
      : quotedParticipant
    : null;

  // Salva a mensagem recebida no banco.
  // INCOMING significa que a mensagem veio do usuário para o CotrimBot.
  const incomingMessage = await prisma.message.create({
    data: {
      externalId,
      content,
      direction: fromMe ? "OUTGOING" : "INCOMING",
      type: messageType,
      ...(messageType === "CONTACT" ? { sharedContacts } : {}),
      contactId: contact.id,
      senderName,
      senderPhone,
      viewOnce,
      quotedExternalId: replyContextInfo ? quotedExternalId : null,
      quotedMessageId: replyContextInfo ? quotedMessage?.id ?? null : null,
      quotedContent: replyContextInfo ? quotedMessage?.content ?? quotedContent : null,
      quotedSenderName,
    },
  });

  if (messageType === "IMAGE" || messageType === "VIDEO") {
    try {
      await cacheMessageMedia(incomingMessage.id, incomingMessage.externalId);
    } catch (error) {
      console.error("Não foi possível guardar a mídia recebida:", error);
    }
  }

  const waitingReplies = await prisma.message.findMany({
    where: { contactId: contact.id, quotedExternalId: externalId, quotedMessageId: null },
    select: { id: true },
  });
  if (waitingReplies.length) {
    await prisma.message.updateMany({
      where: { id: { in: waitingReplies.map((reply) => reply.id) } },
      data: { quotedMessageId: incomingMessage.id },
    });
  }

  const io = getSocketServer();

  // Dispara um evento para os navegadores conectados.
  io.emit("new_message", {
    message: incomingMessage,
    contact: { ...contact, name: contactDisplayName(contact) },
  });
  const repliedUserId = !fromMe && quotedMessage?.direction === "OUTGOING"
    ? quotedMessage.sentByUserId
    : null;
  if (!contact.isGroup && !fromMe) notifyIncomingMessage(contact, incomingMessage, repliedUserId ? [repliedUserId] : []);
  if (repliedUserId) {
    notifyReply(contact, incomingMessage, repliedUserId);
  }
  for (const reply of waitingReplies) {
    io.emit("message_reply_resolved", { messageId: reply.id, quotedMessageId: incomingMessage.id });
  }

  console.log("Evento new_message enviado pelo WebSocket.");

  console.log("Mensagem recebida salva no banco:");
  console.log({
    contato: contact.name,
    telefone: contact.phone,
    mensagem: incomingMessage.content,
    externalId: incomingMessage.externalId,
  });

  // Respondemos 200 para informar à Evolution
  // que o webhook foi recebido corretamente.
  return res.status(200).json({
    received: true,
  });
}
