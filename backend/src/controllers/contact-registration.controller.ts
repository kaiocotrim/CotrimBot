import type { Request, Response } from "express";
import type { prisma } from "../lib/prisma.js";
import type { ContactPhoneInspection } from "../services/contact-phone.service.js";
import { findInforbotUserId } from "../services/bot.service.js";

type Dependencies = {
  database: Pick<typeof prisma, "contact"> & Partial<Pick<typeof prisma, "contactAssignment" | "member" | "user">>;
  inspect: (phone: string) => Promise<ContactPhoneInspection>;
  emit: (event: string, data: unknown) => void;
};
const verificationFailure = "Não foi possível verificar o WhatsApp agora. Confira a conexão e tente novamente.";
const duplicateMessage = "Este número já está cadastrado. Abra o contato existente para consultar ou editar seus dados.";
const normalizePhone = (value: unknown) => typeof value === "string" ? value.replace(/\D/g, "") : "";
const normalizeText = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export function createContactPhoneCheckHandler(inspect: Dependencies["inspect"]) {
  return async function checkContactPhone(req: Request, res: Response) {
    const phone = normalizePhone(req.body?.phone);
    if (!/^\d{7,15}$/.test(phone)) return res.status(400).json({ message: "Informe um número internacional válido (7 a 15 dígitos)" });
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.json(await inspect(phone));
    } catch {
      return res.status(502).json({ message: verificationFailure });
    }
  };
}

export function createContactRegistrationHandler({ database, inspect, emit }: Dependencies) {
  return async function createContact(req: Request, res: Response) {
    const name = normalizeText(req.body?.name);
    const phone = normalizePhone(req.body?.phone);
    const companyName = normalizeText(req.body?.companyName);
    const jobTitle = normalizeText(req.body?.jobTitle);
    if (!name || !/^\d{7,15}$/.test(phone)) return res.status(400).json({ message: "Informe um nome e um número internacional válido (7 a 15 dígitos)" });
    if (name.length > 191 || companyName.length > 191 || jobTitle.length > 191) return res.status(400).json({ message: "Nome, empresa e cargo devem ter no máximo 191 caracteres" });
    let checked: ContactPhoneInspection;
    try { checked = await inspect(phone); }
    catch { return res.status(502).json({ message: verificationFailure }); }
    if (checked.contact?.isSaved) return res.status(409).json({ message: duplicateMessage, contact: checked.contact });
    if (checked.whatsapp !== true) return res.status(400).json({ message: "Este número não possui WhatsApp. Confira o país, o DDD e o telefone." });

    const data = { name, companyName: companyName || null, jobTitle: jobTitle || null, isSaved: true };
    try {
      let contact;
      const botUserId = database.member && database.user
        ? await findInforbotUserId(database as Pick<typeof prisma, "member" | "user">, req.activeOrganizationId)
        : undefined;
      if (checked.contact) {
        // The extra predicate also protects against another user saving it in the meantime.
        contact = await database.contact.update({
          where: { id: checked.contact.id, isSaved: false }, data,
          include: { assignments: { select: { userId: true } } },
        });
      } else {
        contact = await database.contact.create({
          data: { ...data, phone: checked.phone },
          include: { assignments: { select: { userId: true } } },
        });
      }
      if (botUserId && database.contactAssignment) {
        await database.contactAssignment.upsert({
          where: { contactId_userId: { contactId: contact.id, userId: botUserId } },
          create: { contactId: contact.id, userId: botUserId },
          update: {},
        });
        contact = await database.contact.findUniqueOrThrow({
          where: { id: contact.id },
          include: { assignments: { select: { userId: true } } },
        });
      }
      const { assignments, ...savedContact } = contact;
      const result = { ...savedContact, assignedUserIds: assignments.map(item => item.userId) };
      emit("contact_updated", result);
      return res.json(result);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "P2002" || code === "P2025") return res.status(409).json({ message: "Este número já foi cadastrado ou alterado. Verifique o telefone novamente." });
      throw error;
    }
  };
}
