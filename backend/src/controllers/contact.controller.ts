import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// GET /contacts - Retorna todos os contatos
export async function getContacts(_req: Request, res: Response) {
  const contacts = await prisma.contact.findMany();

  res.json(contacts);
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
