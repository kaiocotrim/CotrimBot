import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import {
  archiveWhatsAppChat,
  getProfilePicture,
  subscribeWhatsAppPresence,
} from "../services/evolution.service.js";

// GET /contacts - Retorna todos os contatos
export async function getContacts(req: Request, res: Response) {
  const userId = req.user?.id;
  const contacts = await prisma.contact.findMany({
    include: {
      assignments: { select: { userId: true } },
      // Traz somente a mensagem mais recente de cada contato
      messages: {
        ...(userId ? { where: { deletions: { none: { userId } } } } : {}),
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
              ...(userId ? { deletions: { none: { userId } } } : {}),
            },
          },
        },
      },
    },
  });

  // Adiciona a contagem de mensagens não lidas e ordena os contatos pela data da última mensagem
  const result = contacts
    .map(({ _count, assignments, ...contact }) => ({
      ...contact,
      assignedUserIds: assignments.map((assignment) => assignment.userId),
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
    include: { assignments: { select: { userId: true } } },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  const { assignments, ...result } = contact;
  res.json({ ...result, assignedUserIds: assignments.map((assignment) => assignment.userId) });
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

// POST /contacts/:id/presence-subscription - Habilita o evento "digitando" desse contato.
export async function subscribeContactPresence(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "Contato inválido" });
  }

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { phone: true, whatsappLid: true, isGroup: true },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  // O indicador atual representa uma pessoa digitando; grupos não precisam
  // desta assinatura enquanto não houver identificação do participante.
  if (contact.isGroup) {
    return res.status(204).send();
  }

  try {
    // Contatos Multi-Device publicam presença pelo JID @lid. O telefone
    // continua como fallback para conversas que ainda usam @s.whatsapp.net.
    const identifiers = [...new Set([contact.whatsappLid, contact.phone].filter(Boolean))] as string[];
    let lastError: unknown;

    for (const identifier of identifiers) {
      try {
        await subscribeWhatsAppPresence(identifier);
        return res.status(204).send();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  } catch (error) {
    console.error("Erro ao assinar presença do contato:", error);
    return res.status(502).json({ message: "Não foi possível acompanhar a digitação deste contato" });
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

  res.status(201).json({ ...newContact, assignedUserIds: [] });
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

export async function getContactAssignees(req: Request, res: Response) {
  if (!req.user?.id) return res.status(401).json({ message: "Não autenticado" });
  const users = await prisma.user.findMany({
    select: { id: true, name: true, image: true },
    orderBy: { name: "asc" },
  });
  return res.json(users);
}

export async function setContactAssignment(req: Request, res: Response) {
  const id = Number(req.params.id);
  const userId = req.user?.id;
  const requestedUserIds = req.body?.assignedUserIds;
  if (!Number.isInteger(id) || id <= 0 || !userId || !Array.isArray(requestedUserIds)
    || requestedUserIds.some((value) => typeof value !== "string" || !value.trim())) {
    return res.status(400).json({ message: "Dados de atribuição inválidos" });
  }
  const assigneeIds = [...new Set(requestedUserIds.map((value: string) => value.trim()))];

  if (assigneeIds.length) {
    const users = await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true } });
    if (users.length !== assigneeIds.length) return res.status(400).json({ message: "Um ou mais usuários não foram encontrados" });
  }

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { assignments: { select: { userId: true } } },
  });
  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });
  if (contact.isGroup) return res.status(400).json({ message: "Grupos não podem ser atribuídos" });
  const currentIds = contact.assignments.map((assignment) => assignment.userId).sort();
  const nextIds = [...assigneeIds].sort();
  if (currentIds.length === nextIds.length && currentIds.every((value, index) => value === nextIds[index])) {
    const { assignments, ...unchanged } = contact;
    return res.json({ ...unchanged, assignedUserIds: assignments.map((assignment) => assignment.userId) });
  }

  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.contactAssignment.deleteMany({ where: { contactId: id } });
    if (assigneeIds.length) {
      await transaction.contactAssignment.createMany({
        data: assigneeIds.map((assignedUserId) => ({ contactId: id, userId: assignedUserId })),
      });
    }
    return transaction.contact.findUniqueOrThrow({
      where: { id },
      include: { assignments: { select: { userId: true } } },
    });
  });
  const { assignments, ...updatedContact } = updated;
  const response = { ...updatedContact, assignedUserIds: assignments.map((assignment) => assignment.userId) };
  getSocketServer().emit("contact_updated", response);
  return res.json(response);
}

export async function setContactPriority(req: Request, res: Response) {
  const id = Number(req.params.id);
  const priority = req.body?.priority;
  if (!Number.isInteger(id) || id <= 0 || !["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    return res.status(400).json({ message: "Prioridade inválida" });
  }

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });
  if (contact.priority === priority) return res.json(contact);

  const updated = await prisma.contact.update({ where: { id }, data: { priority } });
  getSocketServer().emit("contact_updated", updated);
  return res.json(updated);
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
