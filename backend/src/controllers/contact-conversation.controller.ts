import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { contactDisplayName } from "../utils/contact-name.js";

export function createContactConversationHandler(database: Pick<typeof prisma, "contact"> = prisma) {
  return async function startContactConversation(req: Request, res: Response) {
    const phone = typeof req.body?.phone === "string" ? req.body.phone.replace(/\D/g, "") : "";
    if (!/^\d{7,15}$/.test(phone)) {
      return res.status(400).json({ message: "Informe um número internacional válido (7 a 15 dígitos)" });
    }
    const contact = await database.contact.upsert({
      where: { phone },
      create: { name: `+${phone}`, phone, isSaved: false },
      update: {},
      include: { assignments: { select: { userId: true } } },
    });
    const { assignments, ...record } = contact;
    return res.json({ ...record, name: contactDisplayName(record), assignedUserIds: assignments.map((item) => item.userId) });
  };
}

export const startContactConversation = createContactConversationHandler();
