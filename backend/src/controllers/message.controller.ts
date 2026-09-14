import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// GET /contacts/:id/messages - Retorna as mensagens de um contato
export async function getMessages(req: Request, res: Response) {
  const contactId = Number(req.params.id);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  const messages = await prisma.message.findMany({
    where: { contactId },
    orderBy: { createdAt: "asc" },
  });

  res.json(messages);
}

// POST /contacts/:id/messages - Cria uma mensagem para um contato
export async function createMessage(req: Request, res: Response) {
  const contactId = Number(req.params.id);
  const { content, direction } = req.body;

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  const message = await prisma.message.create({
    data: {
      content,
      direction,
      contactId,
    },
  });

  res.status(201).json(message);
}
