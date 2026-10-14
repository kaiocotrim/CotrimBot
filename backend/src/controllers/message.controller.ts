// Importa somente os tipos HTTP do Express usados nas assinaturas dos controllers.
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

// Importa a instância do Prisma usada para consultar contatos e salvar mensagens.
import { prisma } from "../lib/prisma.js";

// Importa o servidor de socket para enviar notificações em tempo real.
import { getSocketServer } from "../lib/socket.js";

// Importa o service que concentra toda a comunicação HTTP com a Evolution API.
import {
  deleteWhatsAppMessage,
  getMediaMessage,
  getProfilePicture,
  sendWhatsAppReaction,
  sendWhatsAppMessage,
  sendWhatsAppMedia
} from "../services/evolution.service.js";

import {
  transcribeAudio
} from "../services/transcription.service.js";

import { getSatisfactionSurvey } from "../services/bot.service.js";
import { getSignedOutgoingText, SignatureMembershipError } from "../services/user-signature.service.js";
import { contactDisplayName } from "../utils/contact-name.js";

const sentByUserInclude = {
  sentByUser: { select: { id: true, name: true, image: true } },
} as const;

export async function getGroupSenderAvatar(req: Request, res: Response) {
  const messageId = Number(req.params.id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ message: "Mensagem inválida" });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { contact: true },
  });
  if (!message) return res.status(404).json({ message: "Mensagem não encontrada" });
  if (!message.contact.isGroup || !message.senderPhone) {
    return res.json({ profilePictureUrl: null });
  }
  if (message.senderProfilePictureUrl) {
    return res.json({ profilePictureUrl: message.senderProfilePictureUrl });
  }

  const cached = await prisma.message.findFirst({
    where: {
      senderPhone: message.senderPhone,
      senderProfilePictureUrl: { not: null },
    },
    select: { senderProfilePictureUrl: true },
  });
  if (cached?.senderProfilePictureUrl) {
    await prisma.message.update({ where: { id: message.id }, data: { senderProfilePictureUrl: cached.senderProfilePictureUrl } });
    return res.json({ profilePictureUrl: cached.senderProfilePictureUrl });
  }

  try {
    const profile = await getProfilePicture(message.senderPhone);
    if (profile.profilePictureUrl) {
      await prisma.message.updateMany({
        where: { senderPhone: message.senderPhone },
        data: { senderProfilePictureUrl: profile.profilePictureUrl },
      });
    }
    return res.json({ profilePictureUrl: profile.profilePictureUrl ?? null });
  } catch (error) {
    console.error("Erro ao buscar avatar do participante:", error);
    return res.json({ profilePictureUrl: null });
  }
}

// GET /contacts/:id/messages - Retorna as mensagens de um contato
export async function getMessages(req: Request, res: Response) {
  const contactId = Number(req.params.id);
  const requestedLimit = Number(req.query.limit ?? 30);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : 30;
  const before = req.query.before ? Number(req.query.before) : null;

  if (!Number.isInteger(contactId) || contactId <= 0 || (before !== null && (!Number.isInteger(before) || before <= 0))) {
    return res.status(400).json({ message: "Parâmetros de paginação inválidos" });
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  const messages = await prisma.message.findMany({
    where: {
      contactId,
      ...(req.user?.id ? { deletions: { none: { userId: req.user.id } } } : {}),
      ...(before ? { id: { lt: before } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: sentByUserInclude,
  });

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse().map((message) => ({
    ...message,
    pinned: message.pinned && (!message.pinnedUntil || message.pinnedUntil.getTime() > Date.now()),
    private: message.externalId.startsWith("private:"),
  }));

  return res.json({
    messages: page,
    hasMore,
    nextCursor: hasMore ? page[0]?.id ?? null : null,
  });
}

export async function getFavoriteMessages(req: Request, res: Response) {
  const contactId = Number(req.params.id);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    return res.status(400).json({ message: "Contato inválido" });
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });

  const messages = await prisma.message.findMany({
    where: {
      contactId,
      favorited: true,
      deletedAt: null,
      ...(req.user?.id ? { deletions: { none: { userId: req.user.id } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: sentByUserInclude,
  });

  return res.json(messages.map((message) => ({
    ...message,
    private: message.externalId.startsWith("private:"),
  })));
}

export async function reactToMessage(req: Request, res: Response) {
  const messageId = Number(req.params.id);
  const reaction = typeof req.body.reaction === "string" ? req.body.reaction : null;
  if (!Number.isInteger(messageId) || messageId <= 0 || reaction === null || reaction.length > 16) {
    return res.status(400).json({ message: "Reação inválida" });
  }

  const message = await prisma.message.findUnique({ where: { id: messageId }, include: { contact: true } });
  if (!message) return res.status(404).json({ message: "Mensagem não encontrada" });

  try {
    await sendWhatsAppReaction({
      remoteJid: message.contact.isGroup
        ? message.contact.phone
        : `${message.contact.phone.replace(/\D/g, "")}@s.whatsapp.net`,
      fromMe: message.direction === "OUTGOING",
      id: message.externalId,
      reaction,
    });
    const updated = await prisma.message.update({ where: { id: messageId }, data: { reaction: reaction || null } });
    getSocketServer().emit("message_reaction", { messageId, reaction: updated.reaction });
    return res.json(updated);
  } catch (error) {
    console.error("Erro ao reagir à mensagem:", error);
    return res.status(500).json({ message: "Erro ao enviar reação" });
  }
}

export async function updateMessageFlags(req: Request, res: Response) {
  const messageId = Number(req.params.id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ message: "Mensagem inválida" });
  }

  const data: { pinned?: boolean; pinnedUntil?: Date | null; favorited?: boolean } = {};
  if (typeof req.body.pinned === "boolean") {
    data.pinned = req.body.pinned;
    if (req.body.pinned) {
      const durationHours = Number(req.body.pinDurationHours ?? 168);
      if (![24, 168, 720].includes(durationHours)) {
        return res.status(400).json({ message: "Prazo de fixação inválido" });
      }
      data.pinnedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    } else {
      data.pinnedUntil = null;
    }
  }
  if (typeof req.body.favorited === "boolean") data.favorited = req.body.favorited;
  if (data.pinned === undefined && data.favorited === undefined) {
    return res.status(400).json({ message: "Nenhuma alteração informada" });
  }

  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existing) return res.status(404).json({ message: "Mensagem não encontrada" });
  if (existing.pinned && existing.pinnedUntil && existing.pinnedUntil.getTime() <= Date.now() && data.pinned === undefined) {
    data.pinned = false;
    data.pinnedUntil = null;
  }

  const message = await prisma.message.update({ where: { id: messageId }, data });
  getSocketServer().emit("message_flags_updated", {
    messageId: message.id,
    pinned: message.pinned,
    pinnedUntil: message.pinnedUntil,
    favorited: message.favorited,
  });
  return res.json(message);
}

export async function deleteMessage(req: Request, res: Response) {
  const messageId = Number(req.params.id);
  const scope = req.query.scope;
  const userId = req.user?.id;
  if (!Number.isInteger(messageId) || messageId <= 0 || (scope !== "me" && scope !== "everyone")) {
    return res.status(400).json({ message: "Exclusão de mensagem inválida" });
  }
  if (!userId) return res.status(401).json({ message: "Não autenticado" });

  const message = await prisma.message.findUnique({ where: { id: messageId }, include: { contact: true } });
  if (!message) return res.status(404).json({ message: "Mensagem não encontrada" });

  if (scope === "me") {
    await prisma.messageDeletion.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: { deletedAt: new Date() },
      create: { messageId, userId },
    });
    return res.json({ messageId, scope: "me" });
  }

  if (!message.deletedAt) {
    const isPrivate = message.externalId.startsWith("private:");
    if (!isPrivate) {
      const remoteJid = message.contact.isGroup
        ? message.contact.phone
        : message.contact.whatsappLid ?? `${message.contact.phone.replace(/\D/g, "")}@s.whatsapp.net`;
      const participant = message.contact.isGroup && message.direction === "INCOMING" && message.senderPhone
        ? message.senderPhone.includes("@") ? message.senderPhone : `${message.senderPhone}@s.whatsapp.net`
        : undefined;
      try {
        await deleteWhatsAppMessage({
          remoteJid,
          fromMe: message.direction === "OUTGOING",
          id: message.externalId,
          ...(participant ? { participant } : {}),
        });
      } catch (error) {
        console.error("Erro ao apagar mensagem para todos:", error);
        return res.status(502).json({
          message: message.direction === "INCOMING"
            ? "O WhatsApp não permitiu apagar esta mensagem recebida para todos. Use “Apagar para mim”."
            : "Não foi possível apagar a mensagem para todos.",
        });
      }
    }

    const updated = await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    getSocketServer().emit("message_deleted", { messageId, deletedAt: updated.deletedAt });
    return res.json({ messageId, scope: "everyone", deletedAt: updated.deletedAt });
  }

  return res.json({ messageId, scope: "everyone", deletedAt: message.deletedAt });
}

// POST /contacts/:id/send-media
// Recebe uma mídia, envia pela Evolution
// e salva a mensagem como OUTGOING.
export async function sendMediaToContact(
  req: Request,
  res: Response
) {
  const contactId = Number(req.params.id);

  // Arquivo recebido pelo Multer.
  const file = req.file;

  // Legenda opcional enviada no form-data.
  const caption = typeof req.body.caption === "string" ? req.body.caption : "";
  const rawIncludeSignature = req.body.includeSignature;
  if (rawIncludeSignature !== undefined && rawIncludeSignature !== "true" && rawIncludeSignature !== "false") {
    return res.status(400).json({ message: "Opção de assinatura inválida" });
  }
  const includeSignature = rawIncludeSignature !== "false";
  const rawReplyToMessageId = req.body.replyToMessageId;
  const replyToMessageId = rawReplyToMessageId === undefined || rawReplyToMessageId === ""
    ? undefined
    : Number(rawReplyToMessageId);

  if (replyToMessageId !== undefined && (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0)) {
    return res.status(400).json({ message: "Mensagem respondida inválida" });
  }

  if (!file) {
    return res.status(400).json({
      message: "Nenhum arquivo foi enviado",
    });
  }

  // Busca o contato para descobrir o telefone.
  const contact = await prisma.contact.findUnique({
    where: {
      id: contactId,
    },
  });

  if (!contact) {
    return res.status(404).json({
      message: "Contato não encontrado",
    });
  }

  const quotedMessage = replyToMessageId === undefined
    ? null
    : await prisma.message.findFirst({ where: { id: replyToMessageId, contactId: contact.id } });
  if (replyToMessageId !== undefined && !quotedMessage) {
    return res.status(404).json({ message: "Mensagem respondida não encontrada" });
  }
  const quotedSenderName = quotedMessage
    ? quotedMessage.direction === "OUTGOING" ? "Você" : quotedMessage.senderName ?? contactDisplayName(contact)
    : null;

  // Descobre qual tipo de mídia será enviado
  // usando o MIME type do arquivo.
  let mediatype:
    | "image"
    | "video"
    | "document"
    | "audio";

  let messageType:
    | "IMAGE"
    | "VIDEO"
    | "DOCUMENT"
    | "AUDIO";

  if (file.mimetype.startsWith("image/")) {
    mediatype = "image";
    messageType = "IMAGE";
  } else if (file.mimetype.startsWith("video/")) {
    mediatype = "video";
    messageType = "VIDEO";
  } else if (file.mimetype.startsWith("audio/")) {
    mediatype = "audio";
    messageType = "AUDIO";
  } else {
    // PDF, DOCX, XLSX etc.
    mediatype = "document";
    messageType = "DOCUMENT";
  }

  try {
    const outgoingCaption = await getSignedOutgoingText(req.user!.id, req.activeOrganizationId, caption, undefined, includeSignature);

    // O arquivo está em bytes dentro da RAM.
    // Convertemos esses bytes para Base64
    // para enviar dentro do JSON da Evolution.
    const base64 =
      file.buffer.toString("base64");

    const evolutionResponse =
      await sendWhatsAppMedia({
        number: contact.phone,
        mediatype,
        mimetype: file.mimetype,
        media: base64,
        fileName: file.originalname,
        caption: outgoingCaption,
        ...(quotedMessage && !quotedMessage.private ? {
          quoted: {
            externalId: quotedMessage.externalId,
            content: quotedMessage.content,
            fromMe: quotedMessage.direction === "OUTGOING",
          },
        } : {}),
      });

    // ID criado pelo WhatsApp/Evolution.
    const externalId =
      evolutionResponse.key?.id;

    if (!externalId) {
      throw new Error(
        "A Evolution API não retornou o ID da mídia"
      );
    }

    // Define o texto que aparecerá na sidebar/chat.
    let content: string;

    if (outgoingCaption) {
      content = outgoingCaption;
    } else if (messageType === "IMAGE") {
      content = "[Imagem]";
    } else if (messageType === "VIDEO") {
      content = "[Vídeo]";
    } else if (messageType === "AUDIO") {
      content = "[Áudio]";
    } else {
      content = file.originalname;
    }

    // Salva a mídia no histórico local.
    const message = await prisma.message.upsert({
      where: { externalId },
      update: {
        content,
        sentByUserId: req.user!.id,
        quotedExternalId: quotedMessage?.externalId ?? null,
        quotedMessageId: quotedMessage?.id ?? null,
        quotedContent: quotedMessage?.content ?? null,
        quotedSenderName,
      },
      create: {
        externalId,
        content,
        direction: "OUTGOING",
        type: messageType,
        contactId: contact.id,
        sentByUserId: req.user!.id,
        quotedExternalId: quotedMessage?.externalId ?? null,
        quotedMessageId: quotedMessage?.id ?? null,
        quotedContent: quotedMessage?.content ?? null,
        quotedSenderName,
      },
      include: sentByUserInclude,
    });

    // Atualiza o frontend em tempo real.
    const io = getSocketServer();

    io.emit("new_message", {
      message,
      contact: { ...contact, name: contactDisplayName(contact) },
    });

    return res.status(201).json({
      message,
      evolution: evolutionResponse,
    });

  } catch (error) {
    if (error instanceof SignatureMembershipError) {
      return res.status(403).json({ message: error.message });
    }
    console.error(
      "Erro ao enviar mídia:",
      error
    );

    return res.status(500).json({
      message: "Erro ao enviar mídia",
    });
  }
}

// POST /messages/:id/transcribe
// Busca um áudio já salvo e solicita sua transcrição.
export async function transcribeMessage(
  req: Request,
  res: Response
) {
  const messageId = Number(req.params.id);

  // Busca a mensagem no banco.
  const message = await prisma.message.findUnique({
    where: {
      id: messageId,
    },
  });

  if (!message) {
    return res.status(404).json({
      message: "Mensagem não encontrada",
    });
  }

  // Por enquanto, só permitimos transcrição de áudio.
  if (message.type !== "AUDIO") {
    return res.status(400).json({
      message: "Essa mensagem não é um áudio",
    });
  }

  try {
    // Busca o áudio original através da Evolution.
    const media = await getMediaMessage(
      message.externalId
    );

    // Envia o áudio para o serviço Whisper.
    const transcription = await transcribeAudio({
      base64: media.base64,
      mimetype: media.mimetype,
      fileName: media.fileName,
    });

    return res.status(200).json({
      messageId: message.id,
      transcription,
    });
  } catch (error) {
    console.error(
      "Erro ao transcrever áudio:",
      error
    );

    return res.status(500).json({
      message: "Erro ao transcrever áudio",
    });
  }
}

/**
 * Controller do POST /contacts/:id/send.
 *
 * Coordena o fluxo de envio sem conhecer os detalhes da requisição HTTP feita à
 * Evolution API: route -> controller -> service -> Evolution API. Depois que a
 * Evolution confirma o envio, o controller usa o Prisma para persistir a mensagem.
 */
export async function sendMessageToContact(req: Request, res: Response) {
  // O parâmetro :id identifica no banco qual contato receberá a mensagem.
  const contactId = Number(req.params.id);

  // O texto enviado pelo cliente da API é recebido no corpo JSON da requisição.
  const { text, clientId, private: isPrivate = false, replyToMessageId, includeSignature = true } = req.body;

  // Procuramos o contato antes do envio porque precisamos do telefone cadastrado.
  // Isso também impede uma chamada desnecessária à Evolution para um contato
  // inexistente e mantém a resposta 404 já utilizada pela aplicação.
  const contact = await prisma.contact.findUnique({
    where: {
      id: contactId,
    },
  });

  if (!contact) {
    return res.status(404).json({
      message: "Contato não encontrado",
    });
  }

  // Não tentamos enviar uma mensagem quando o texto não foi informado.
  if (!text) {
    return res.status(400).json({
      message: "Texto da mensagem é obrigatório",
    });
  }

  if (typeof isPrivate !== "boolean") {
    return res.status(400).json({ message: "Indicador de mensagem privada inválido" });
  }

  if (typeof includeSignature !== "boolean") {
    return res.status(400).json({ message: "Opção de assinatura inválida" });
  }

  if (replyToMessageId !== undefined && (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0)) {
    return res.status(400).json({ message: "Mensagem respondida inválida" });
  }

  const quotedMessage = replyToMessageId === undefined
    ? null
    : await prisma.message.findFirst({ where: { id: replyToMessageId, contactId: contact.id } });
  if (replyToMessageId !== undefined && !quotedMessage) {
    return res.status(404).json({ message: "Mensagem respondida não encontrada" });
  }
  const quotedSenderName = quotedMessage
    ? quotedMessage.direction === "OUTGOING" ? "Você" : quotedMessage.senderName ?? contactDisplayName(contact)
    : null;

  try {
    if (isPrivate) {
      const privateMessage = await prisma.message.create({
        data: {
          externalId: `private:${randomUUID()}`,
          content: text,
          direction: "OUTGOING",
          type: "TEXT",
          contactId: contact.id,
          sentByUserId: req.user!.id,
          quotedExternalId: quotedMessage?.externalId ?? null,
          quotedMessageId: quotedMessage?.id ?? null,
          quotedContent: quotedMessage?.content ?? null,
          quotedSenderName,
        },
        include: sentByUserInclude,
      });
      const responseMessage = {
        ...privateMessage,
        private: true,
        ...(typeof clientId === "string" ? { clientId } : {}),
      };
      getSocketServer().emit("new_message", { message: responseMessage, contact: { ...contact, name: contactDisplayName(contact) } });
      return res.status(201).json({ message: responseMessage, evolution: null });
    }

    const outgoingText = await getSignedOutgoingText(req.user!.id, req.activeOrganizationId, text, undefined, includeSignature);

    // O service recebe apenas telefone e texto e cuida de toda a comunicação HTTP
    // com a Evolution API, mantendo esse detalhe fora do controller.
    const evolutionResponse = await sendWhatsAppMessage(
      contact.phone,
      outgoingText,
      quotedMessage && !quotedMessage.private ? {
        externalId: quotedMessage.externalId,
        content: quotedMessage.content,
        fromMe: quotedMessage.direction === "OUTGOING",
      } : undefined
    );

    // externalId é o identificador único criado pelo WhatsApp/Evolution para a
    // mensagem. Ele permite relacionar o registro local ao envio externo.
    const externalId = evolutionResponse.key?.id;

    if (!externalId) {
      throw new Error(
        "A Evolution API não retornou o ID da mensagem"
      );
    }

    // Salvamos como OUTGOING porque a mensagem saiu do CotrimBot em direção ao
    // WhatsApp do contato, em vez de ter sido recebida pelo webhook.
    const message = await prisma.message.upsert({
      where: { externalId },
      update: {
        content: outgoingText,
        sentByUserId: req.user!.id,
        quotedExternalId: quotedMessage?.externalId ?? null,
        quotedMessageId: quotedMessage?.id ?? null,
        quotedContent: quotedMessage?.content ?? null,
        quotedSenderName,
      },
      create: {
        externalId,
        content: outgoingText,
        direction: "OUTGOING",
        contactId: contact.id,
        sentByUserId: req.user!.id,
        quotedExternalId: quotedMessage?.externalId ?? null,
        quotedMessageId: quotedMessage?.id ?? null,
        quotedContent: quotedMessage?.content ?? null,
        quotedSenderName,
      },
      include: sentByUserInclude,
    });

    // Avisa os frontends conectados que uma nova
    // mensagem OUTGOING foi salva.
    const io = getSocketServer();

    const responseMessage = typeof clientId === "string"
      ? { ...message, clientId }
      : message;

    io.emit("new_message", {
      message: responseMessage,
      contact: { ...contact, name: contactDisplayName(contact) },
    });

    // Mantém a resposta atual: registro local e resposta original da Evolution.
    return res.status(201).json({
      message: responseMessage,
      evolution: evolutionResponse,
    });
  } catch (error) {
    if (error instanceof SignatureMembershipError) {
      return res.status(403).json({ message: error.message });
    }
    // Registra o erro técnico no backend, mas devolve ao cliente uma mensagem
    // estável sem expor detalhes internos da Evolution API ou do banco.
    console.error(error);

    return res.status(500).json({
      message: "Erro ao enviar mensagem",
    });
  }
}

// Envia a pesquisa de satisfação ao encerrar o atendimento com o bot.
export async function closeConversationWithBot(req: Request, res: Response) {
  const contactId = Number(req.params.id);
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  try {
    const survey = getSatisfactionSurvey();
    const evolutionResponse = await sendWhatsAppMessage(contact.phone, survey);
    const externalId = evolutionResponse?.key?.id;

    if (!externalId) {
      throw new Error("A Evolution API não retornou o ID da mensagem");
    }

    const message = await prisma.$transaction(async (transaction) => {
      const createdMessage = await transaction.message.create({
        data: {
          externalId,
          content: survey,
          direction: "OUTGOING",
          contactId,
          sentByUserId: req.user!.id,
        },
        include: sentByUserInclude,
      });

      // Um chamado encerrado volta para a fila sem responsáveis atribuídos.
      await transaction.contactAssignment.deleteMany({ where: { contactId } });

      return createdMessage;
    });

    // Avisa os frontends conectados que uma nova
    // mensagem OUTGOING foi salva.
    const io = getSocketServer();

    const updatedContact = {
      ...contact,
      name: contactDisplayName(contact),
      assignedUserIds: [],
    };

    io.emit("new_message", {
      message,
      contact: updatedContact,
    });
    io.emit("contact_updated", updatedContact);

    return res.status(201).json({ message, contact: updatedContact, evolution: evolutionResponse });
  } catch (error) {
    console.error("Erro ao encerrar chamado com o bot:", error);
    return res.status(500).json({ message: "Erro ao enviar pesquisa de satisfação" });
  }
}

// PATCH /contacts/:id/messages/read - Marca as mensagens recebidas como lidas

export async function markMessagesAsRead(
  req: Request,
  res: Response
) {
  const contactId = Number(req.params.id);

  await prisma.message.updateMany({
    where: {
      contactId,
      direction: "INCOMING",
      readAt: null,
    },

    data: {
      readAt: new Date(),
    },
  });

  return res.status(200).json({
    message: "Mensagens marcadas como lidas",
  });
}


// GET /messages/:id/media
// Busca a mídia de uma mensagem na Evolution
// e entrega os bytes reais para o navegador.
function sendMediaResponse(
  req: Request,
  res: Response,
  buffer: Buffer,
  mimetype: string,
  fileName?: string | null,
) {
  res.setHeader("Content-Type", mimetype);

  if (fileName) {
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const safeFileName = fileName.replace(/["\r\n]/g, "_");
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeFileName}"`);
  } else if (req.query.download === "1") {
    res.setHeader("Content-Disposition", "attachment");
  }

  return res.send(buffer);
}

export async function getMessageMedia(
  req: Request,
  res: Response
) {
  const messageId = Number(req.params.id);

  // Procura a mensagem no banco do CotrimBot.
  const message = await prisma.message.findUnique({
    where: {
      id: messageId,
    },
  });

  // Não existe uma Message com esse ID.
  if (!message) {
    return res.status(404).json({
      message: "Mensagem não encontrada",
    });
  }

  // Mensagens TEXT não possuem arquivo de mídia.
  if (message.type === "TEXT") {
    return res.status(400).json({
      message: "Essa mensagem não possui mídia",
    });
  }

  try {
    const cachedMedia = await prisma.messageMedia.findUnique({
      where: { messageId: message.id },
    });

    if (cachedMedia) {
      return sendMediaResponse(
        req,
        res,
        Buffer.from(cachedMedia.data),
        cachedMedia.mimetype,
        cachedMedia.fileName,
      );
    }

    // Usa o externalId salvo no banco
    // para pedir a mídia original à Evolution.
    const media = await getMediaMessage(
      message.externalId
    );

    // Converte o texto Base64 nos bytes
    // originais do arquivo.
    const buffer = Buffer.from(
      media.base64,
      "base64"
    );

    try {
      await prisma.messageMedia.create({
        data: {
          messageId: message.id,
          data: buffer,
          mimetype: media.mimetype,
          fileName: media.fileName ?? null,
        },
      });
    } catch (cacheError) {
      console.error("Não foi possível guardar a mídia no cache:", cacheError);
    }

    return sendMediaResponse(req, res, buffer, media.mimetype, media.fileName);
  } catch (error) {
    console.error(
      "Erro ao buscar mídia da mensagem:",
      error
    );

    return res.status(500).json({
      message: "Erro ao buscar mídia da mensagem",
    });
  }
}
