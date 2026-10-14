import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { notifyAssignment } from "../services/notification.service.js";
import { contactDisplayName } from "../utils/contact-name.js";
import {
  archiveWhatsAppChat,
  getGroupInfo,
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
      name: contactDisplayName(contact),
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
  res.json({ ...result, name: contactDisplayName(result), assignedUserIds: assignments.map((assignment) => assignment.userId) });
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

// GET /contacts/:id/group-participants - Lista os participantes atuais de um grupo.
export async function getContactGroupParticipants(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Contato inválido" });
  }

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { phone: true, isGroup: true },
  });

  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });
  if (!contact.isGroup) return res.status(400).json({ message: "Este contato não é um grupo" });

  try {
    const group = await getGroupInfo(contact.phone, true);
    const participants = [...new Map((group.participants ?? []).flatMap((participant) => {
      const identifier = participant.phoneNumber ?? participant.id ?? "";
      const phone = identifier.replace(/@.*$/, "").replace(/\D/g, "");
      return phone ? [[phone, { phone, isAdmin: Boolean(participant.admin) }] as const] : [];
    })).values()];
    const phones = participants.map((participant) => participant.phone);

    const [savedContacts, cachedAvatars] = phones.length ? await Promise.all([
      prisma.contact.findMany({
        where: { phone: { in: phones }, isSaved: true },
        select: { phone: true, name: true, profilePictureUrl: true },
      }),
      prisma.message.findMany({
        where: {
          contactId: id,
          senderPhone: { in: phones },
          senderProfilePictureUrl: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { senderPhone: true, senderProfilePictureUrl: true },
      }),
    ]) : [[], []];

    const contactsByPhone = new Map(savedContacts.map((item) => [item.phone.replace(/\D/g, ""), item]));
    const avatarsByPhone = new Map<string, string>();
    for (const item of cachedAvatars) {
      const phone = item.senderPhone?.replace(/\D/g, "");
      if (phone && item.senderProfilePictureUrl && !avatarsByPhone.has(phone)) {
        avatarsByPhone.set(phone, item.senderProfilePictureUrl);
      }
    }

    const result = participants
      .map((participant) => {
        const savedContact = contactsByPhone.get(participant.phone);
        return {
          phone: participant.phone,
          name: savedContact?.name ?? null,
          profilePictureUrl: savedContact?.profilePictureUrl ?? avatarsByPhone.get(participant.phone) ?? null,
          isAdmin: participant.isAdmin,
        };
      })
      .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)
        || (a.name ?? a.phone).localeCompare(b.name ?? b.phone, "pt-BR"));

    return res.json(result);
  } catch (error) {
    console.error("Erro ao buscar participantes do grupo:", error);
    return res.status(502).json({ message: "Não foi possível carregar os participantes do grupo" });
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
  const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.replace(/\D/g, "") : "";
  const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim().replace(/\s+/g, " ") : "";
  if (!name || !/^\d{7,15}$/.test(phone)) {
    return res.status(400).json({ message: "Informe um nome e um número internacional válido (7 a 15 dígitos)" });
  }
  if (companyName.length > 191) {
    return res.status(400).json({ message: "A empresa deve ter no máximo 191 caracteres" });
  }

  const contact = await prisma.contact.upsert({
    where: { phone },
    create: { name, phone, companyName: companyName || null, isSaved: true },
    update: { name, ...(companyName ? { companyName } : {}), isSaved: true },
    include: { assignments: { select: { userId: true } } },
  });
  const { assignments, ...savedContact } = contact;
  const response = { ...savedContact, assignedUserIds: assignments.map((assignment) => assignment.userId) };
  getSocketServer().emit("contact_updated", response);
  return res.json(response);
}

// PATCH /contacts/:id/saved - Remove ou recoloca um contato na agenda local.
export async function setContactSaved(req: Request, res: Response) {
  const id = Number(req.params.id);
  const isSaved = req.body?.isSaved;
  if (!Number.isInteger(id) || typeof isSaved !== "boolean") {
    return res.status(400).json({ message: "Dados do contato inválidos" });
  }

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });
  if (contact.isGroup) return res.status(400).json({ message: "Grupos não podem ser salvos como contatos" });

  const updated = await prisma.contact.update({ where: { id }, data: { isSaved } });
  const response = { ...updated, name: contactDisplayName(updated) };
  getSocketServer().emit("contact_updated", response);
  return res.json(response);
}

// PATCH /contacts/:id - Atualiza um contato especifico pelo ID
export async function updateContact(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { name, phone, companyName } = req.body;

  if (companyName !== undefined && companyName !== null && typeof companyName !== "string") {
    return res.status(400).json({ message: "Empresa inválida" });
  }
  const normalizedCompanyName = typeof companyName === "string" ? companyName.trim().replace(/\s+/g, " ") : null;
  if (normalizedCompanyName && normalizedCompanyName.length > 191) {
    return res.status(400).json({ message: "A empresa deve ter no máximo 191 caracteres" });
  }

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
      ...(companyName !== undefined ? { companyName: normalizedCompanyName } : {}),
      isSaved: true,
    },
  });

  getSocketServer().emit("contact_updated", updatedContact);
  return res.json(updatedContact);
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
    const response = { ...updated, name: contactDisplayName(updated) };
    getSocketServer().emit("contact_updated", response);
    return res.json(response);
  }

  try {
    await archiveWhatsAppChat({
      chat: remoteJid,
      archive: archived,
      ...(lastMessage ? { lastMessage: { id: lastMessage.externalId, fromMe: lastMessage.direction === "OUTGOING" } } : {}),
    });
    const updated = await prisma.contact.update({ where: { id }, data: { archived } });
    const response = { ...updated, name: contactDisplayName(updated) };
    getSocketServer().emit("contact_updated", response);
    return res.json(response);
  } catch (error) {
    console.error("Erro ao alterar arquivamento:", error);
    return res.status(502).json({ message: "Não foi possível alterar o arquivamento no WhatsApp" });
  }
}

export async function setContactPinned(req: Request, res: Response) {
  const id = Number(req.params.id);
  const pinned = req.body?.pinned;
  if (!Number.isInteger(id) || id <= 0 || typeof pinned !== "boolean") {
    return res.status(400).json({ message: "Dados de fixação inválidos" });
  }

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });

  const updated = await prisma.contact.update({ where: { id }, data: { pinned } });
  const response = { ...updated, name: contactDisplayName(updated) };
  getSocketServer().emit("contact_updated", response);
  return res.json(response);
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
    return res.json({ ...unchanged, name: contactDisplayName(unchanged), assignedUserIds: assignments.map((assignment) => assignment.userId) });
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
  const response = { ...updatedContact, name: contactDisplayName(updatedContact), assignedUserIds: assignments.map((assignment) => assignment.userId) };
  getSocketServer().emit("contact_updated", response);
  notifyAssignment(
    contact,
    assigneeIds.filter((assigneeId) => !currentIds.includes(assigneeId)),
    { id: userId, name: req.user!.name },
  );
  return res.json(response);
}

export async function setContactPriority(req: Request, res: Response) {
  const id = Number(req.params.id);
  const priority = req.body?.priority;
  if (!Number.isInteger(id) || id <= 0 || !["NONE", "LOW", "MEDIUM", "HIGH"].includes(priority)) {
    return res.status(400).json({ message: "Prioridade inválida" });
  }

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return res.status(404).json({ message: "Contato não encontrado" });
  if (contact.priority === priority) return res.json({ ...contact, name: contactDisplayName(contact) });

  const updated = await prisma.contact.update({ where: { id }, data: { priority } });
  const response = { ...updated, name: contactDisplayName(updated) };
  getSocketServer().emit("contact_updated", response);
  return res.json(response);
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
