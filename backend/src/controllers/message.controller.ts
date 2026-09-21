// Importa somente os tipos HTTP do Express usados nas assinaturas dos controllers.
import type { Request, Response } from "express";

// Importa a instância do Prisma usada para consultar contatos e salvar mensagens.
import { prisma } from "../lib/prisma.js";

// Importa o servidor de socket para enviar notificações em tempo real.
import { getSocketServer } from "../lib/socket.js";

// Importa o service que concentra toda a comunicação HTTP com a Evolution API.
import {
  getMediaMessage,
  sendWhatsAppReaction,
  sendWhatsAppMessage,
  sendWhatsAppMedia
} from "../services/evolution.service.js";

import {
  transcribeAudio
} from "../services/transcription.service.js";

import { getSatisfactionSurvey } from "../services/bot.service.js";

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
      ...(before ? { id: { lt: before } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse();

  return res.json({
    messages: page,
    hasMore,
    nextCursor: hasMore ? page[0]?.id ?? null : null,
  });
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
      remoteJid: `${message.contact.phone.replace(/\D/g, "")}@s.whatsapp.net`,
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
  const { caption } = req.body;

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
        caption: caption ?? "",
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

    if (caption?.trim()) {
      content = caption.trim();
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
    const message = await prisma.message.create({
      data: {
        externalId,
        content,
        direction: "OUTGOING",
        type: messageType,
        contactId: contact.id,
      },
    });

    // Atualiza o frontend em tempo real.
    const io = getSocketServer();

    io.emit("new_message", {
      message,
      contact,
    });

    return res.status(201).json({
      message,
      evolution: evolutionResponse,
    });

  } catch (error) {
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
  const { text } = req.body;

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

  try {
    // O service recebe apenas telefone e texto e cuida de toda a comunicação HTTP
    // com a Evolution API, mantendo esse detalhe fora do controller.
    const evolutionResponse = await sendWhatsAppMessage(contact.phone, text);

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
    const message = await prisma.message.create({
      data: {
        externalId,
        content: text,
        direction: "OUTGOING",
        contactId: contact.id,
      },
    });

    // Avisa os frontends conectados que uma nova
    // mensagem OUTGOING foi salva.
    const io = getSocketServer();

    io.emit("new_message", {
      message,
      contact,
    });

    // Mantém a resposta atual: registro local e resposta original da Evolution.
    return res.status(201).json({
      message,
      evolution: evolutionResponse,
    });
  } catch (error) {
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

    const message = await prisma.message.create({
      data: {
        externalId,
        content: survey,
        direction: "OUTGOING",
        contactId,
      },
    });

    // Avisa os frontends conectados que uma nova
    // mensagem OUTGOING foi salva.
    const io = getSocketServer();

    io.emit("new_message", {
      message,
      contact,
    });

    return res.status(201).json({ message, evolution: evolutionResponse });
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

    // Informa ao navegador qual tipo
    // de arquivo estamos enviando.
    res.setHeader(
      "Content-Type",
      media.mimetype
    );

    // Permite que o navegador tente exibir/tocar
    // a mídia diretamente.
    if (media.fileName) {
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${media.fileName}"`
      );
    }

    return res.send(buffer);
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
