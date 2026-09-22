import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { archiveWhatsAppChat, getProfilePicture } from "../services/evolution.service.js";

// GET /contacts - Retorna todos os contatos
export async function getContacts(_req: Request, res: Response) {
  const contacts = await prisma.contact.findMany({
    include: {
      // Traz somente a mensagem mais recente de cada contato
      messages: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },

      // Conta quantas mensagens recebidas ainda não foram lidas
      _count: {
        select: {
          messages: {
            where: {
              direction: "INCOMING",
              readAt: null,
            },
          },
        },
      },
    },
  });

  // Adiciona a contagem de mensagens não lidas e ordena os contatos pela data da última mensagem
  const result = contacts
    .map(({ _count, ...contact }) => ({
      ...contact,
      unreadCount: _count.messages,
    }))
    .sort((a, b) => {
      const dateA = a.messages[0]?.createdAt
        ? new Date(a.messages[0].createdAt).getTime()
        : 0;

      const dateB = b.messages[0]?.createdAt
        ? new Date(b.messages[0].createdAt).getTime()
        : 0;

      return dateB - dateA;
    });

  return res.json(result);
}

// GET /contacts/:id - Retorna um contato especifico pelo ID
export async function getContactById(req: Request, res: Response) {
  const id = Number(req.params.id);

  const contact = await prisma.contact.findUnique({
    where: { id },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  res.json(contact);
}

// GET /contacts/:id/avatar - Busca a foto do contato na Evolution API
export async function getContactAvatar(req: Request, res: Response) {
  const id = Number(req.params.id);

  const contact = await prisma.contact.findUnique({
    where: { id },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  if (contact.profilePictureUrl) {
    return res.json({ profilePictureUrl: contact.profilePictureUrl });
  }

  try {
    const profile = await getProfilePicture(contact.phone);

    if (profile.profilePictureUrl) {
      await prisma.contact.update({
        where: { id },
        data: { profilePictureUrl: profile.profilePictureUrl },
      });
    }

    return res.json({
      profilePictureUrl: profile.profilePictureUrl ?? null,
    });
  } catch (error) {
    console.error("Erro ao buscar avatar:", error);

    return res.status(500).json({
      message: "Erro ao buscar foto do contato",
    });
  }
}

// POST /contacts - Cria um novo contato
export async function createContact(req: Request, res: Response) {
  const { name, phone } = req.body;

  const newContact = await prisma.contact.create({
    data: {
      name,
      phone,
    },
  });

  res.status(201).json(newContact);
}

// PATCH /contacts/:id - Atualiza um contato especifico pelo ID
export async function updateContact(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { name, phone } = req.body;

  const contact = await prisma.contact.findUnique({
    where: { id },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  const updatedContact = await prisma.contact.update({
    where: { id },
    data: {
      name,
      phone,
    },
  });

  res.json(updatedContact);
}

export async function setContactArchived(req: Request, res: Response) {
  const id = Number(req.params.id);
  const archived = req.body?.archived;
  if (!Number.isInteger(id) || typeof archived !== "boolean") {
    return res.status(400).json({ message: "Dados de arquivamento inválidos" });
  }

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });

  const remoteJid = contact.isGroup ? contact.phone : `${contact.phone.replace(/\D/g, "")}@s.whatsapp.net`;
  const lastMessage = contact.messages[0];

  // Grupos recém-sincronizados podem existir sem um chat/última mensagem na Evolution.
  // Nesse caso, o arquivamento ainda funciona como organização local do CotrimBot.
  if (!lastMessage) {
    const updated = await prisma.contact.update({ where: { id }, data: { archived } });
    getSocketServer().emit("contact_updated", updated);
    return res.json(updated);
  }

  try {
    await archiveWhatsAppChat({
      chat: remoteJid,
      archive: archived,
      ...(lastMessage ? { lastMessage: { id: lastMessage.externalId, fromMe: lastMessage.direction === "OUTGOING" } } : {}),
    });
    const updated = await prisma.contact.update({ where: { id }, data: { archived } });
    getSocketServer().emit("contact_updated", updated);
    return res.json(updated);
  } catch (error) {
    console.error("Erro ao alterar arquivamento:", error);
    return res.status(502).json({ message: "Não foi possível alterar o arquivamento no WhatsApp" });
  }
}

// DELETE /contacts/:id - Exclui um contato especifico pelo ID
export async function deleteContact(req: Request, res: Response) {
  const id = Number(req.params.id);

  const contact = await prisma.contact.findUnique({
    where: { id },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  await prisma.contact.delete({
    where: { id },
  });

  res.status(204).send();
}
