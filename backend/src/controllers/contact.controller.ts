import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getProfilePicture } from "../services/evolution.service.js";

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

  // Transforma _count.messages em unreadCount
  const result = contacts.map(({ _count, ...contact }) => {
    return {
      ...contact,
      unreadCount: _count.messages,
    };
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

  try {
    const profile = await getProfilePicture(contact.phone);

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
