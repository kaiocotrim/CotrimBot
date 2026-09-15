import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function whatsappWebhook(req: Request, res: Response) {
  const body = req.body;

  // Aceitamos somente eventos de nova mensagem
  if (body.event !== "messages.upsert") {
    return res.status(200).json({ received: true });
  }

  const data = body.data;

  // Ignora mensagens enviadas pelo próprio número conectado
  if (data.key?.fromMe === true) {
    return res.status(200).json({ received: true });
  }

  const remoteJid = data.key?.remoteJid;

  // Por enquanto não vamos processar grupos
  if (!remoteJid || remoteJid.endsWith("@g.us")) {
    console.log("Mensagem de grupo ignorada.");

    return res.status(200).json({ received: true });
  }

  // Por enquanto processamos apenas contatos no formato normal do WhatsApp
  if (!remoteJid.endsWith("@s.whatsapp.net")) {
    console.log("Formato de contato ainda não suportado:", remoteJid);

    return res.status(200).json({ received: true });
  }

  const externalId = data.key?.id;
  const name = data.pushName || "Contato";
  const content = data.message?.conversation;

  // Remove @s.whatsapp.net e deixa somente o número
  const phone = remoteJid.replace("@s.whatsapp.net", "");

  if (!externalId || !content) {
    console.log("Mensagem sem ID ou sem texto. Ignorando.");

    return res.status(200).json({ received: true });
  }

  // Verifica se essa mensagem já foi salva
  const existingMessage = await prisma.message.findUnique({
    where: {
      externalId,
    },
  });

  if (existingMessage) {
    console.log("Mensagem já registrada:", externalId);

    return res.status(200).json({ received: true });
  }

  // Procura o contato pelo telefone.
  // Se não existir, cria.
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

  // Salva a mensagem
  const message = await prisma.message.create({
    data: {
      externalId,
      content,
      direction: "INCOMING",
      contactId: contact.id,
    },
  });

  console.log("Mensagem salva no banco:");
  console.log({
    contato: contact.name,
    telefone: contact.phone,
    mensagem: message.content,
    externalId: message.externalId,
  });

  return res.status(200).json({
    received: true,
  });
}