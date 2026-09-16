import type { Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";

export async function whatsappWebhook(req: Request, res: Response) {
  const body = req.body;

  // Aceitamos somente eventos de nova mensagem
  if (body.event !== "messages.upsert") {
    return res.status(200).json({
      received: true,
    });
  }

  const data = body.data;

  // Ignora mensagens enviadas pelo próprio número conectado.
  // Isso evita que o CotrimBot responda às próprias mensagens
  // e entre em um loop infinito.
  if (data.key?.fromMe === true) {
    return res.status(200).json({
      received: true,
    });
  }

  const remoteJid = data.key?.remoteJid;
  const remoteJidAlt = data.key?.remoteJidAlt;

  // Ignora mensagens sem identificação.
  if (!remoteJid) {
    console.log("Mensagem sem remoteJid.");

    return res.status(200).json({
      received: true,
    });
  }

  // Por enquanto continuamos ignorando grupos.
  if (remoteJid.endsWith("@g.us")) {
    console.log("Mensagem de grupo ignorada.");

    return res.status(200).json({
      received: true,
    });
  }

  // Esse será o JID que usaremos para descobrir
  // o telefone real do contato.
  let contactJid: string;

  // Formato tradicional do WhatsApp.
  if (remoteJid.endsWith("@s.whatsapp.net")) {
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

  // Nome exibido pelo contato no WhatsApp.
  const name = data.pushName || "Contato";

  // Conteúdo da mensagem de texto.
  const content = data.message?.conversation;

  // Remove "@s.whatsapp.net" e mantém somente o número.
  const phone = contactJid.replace("@s.whatsapp.net", "");

  // Se não existir ID ou conteúdo de texto,
  // ignoramos a mensagem por enquanto.
  if (!externalId || !content) {
    console.log("Mensagem sem ID ou sem texto. Ignorando.");

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

  // Se já existir, não salvamos novamente.
  if (existingMessage) {
    console.log("Mensagem já registrada:", externalId);

    return res.status(200).json({
      received: true,
    });
  }

  // Procura o contato pelo telefone.
  // Se não existir, cria.
  // Se já existir, atualiza o nome.
  const contact = await prisma.contact.upsert({
    where: {
      phone,
    },

    update: {
      name,
    },

    create: {
      name,
      phone,
    },
  });

  // Salva a mensagem recebida no banco.
  // INCOMING significa que a mensagem veio do usuário para o CotrimBot.
  const incomingMessage = await prisma.message.create({
    data: {
      externalId,
      content,
      direction: "INCOMING",
      contactId: contact.id,
    },
  });

  const io = getSocketServer();

  // Dispara um evento para os navegadores conectados.
  io.emit("new_message", {
    message: incomingMessage,
    contact,
  });

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
