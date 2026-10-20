import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getGroupInfo } from "../services/evolution.service.js";
import { normalizeWhatsAppJid, whatsAppJidIdentifier } from "../utils/whatsapp-jid.js";

export function createMessageInfoHandler(
  database: Pick<typeof prisma, "message" | "contact"> = prisma,
  loadGroup = getGroupInfo,
) {
  return async function getMessageInfo(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Mensagem inválida" });
    if (!req.user?.id) return res.status(401).json({ message: "Não autenticado" });
    const message = await database.message.findFirst({
      where: { id, direction: "OUTGOING", private: false, deletedAt: null, contact: { isGroup: true }, deletions: { none: { userId: req.user.id } } },
      include: { contact: true, receipts: true },
    });
    if (!message) return res.status(404).json({ message: "Dados da mensagem indisponíveis" });
    let participants: NonNullable<Awaited<ReturnType<typeof getGroupInfo>>["participants"]> = [];
    try { participants = (await loadGroup(message.contact.phone, true)).participants ?? []; } catch { /* Existing receipts remain available offline. */ }
    const canonical = new Map<string, string>();
    for (const participant of participants) {
      const phone = participant.phoneNumber ?? (participant.id?.endsWith("@s.whatsapp.net") ? participant.id : null);
      const pn = phone ? normalizeWhatsAppJid(phone.includes("@") ? phone : `${phone}@s.whatsapp.net`) : null;
      if (!pn) continue;
      for (const alias of [participant.id, participant.lid, pn]) if (alias) canonical.set(normalizeWhatsAppJid(alias), pn);
    }
    const merged = new Map<string, { recipientId: string; deliveredAt: Date | null; readAt: Date | null; playedAt: Date | null; aliases: Set<string> }>();
    for (const receipt of message.receipts) {
      const raw = normalizeWhatsAppJid(receipt.recipientId);
      const recipientId = canonical.get(raw) ?? raw;
      const entry = merged.get(recipientId) ?? { recipientId, deliveredAt: null, readAt: null, playedAt: null, aliases: new Set<string>() };
      entry.aliases.add(raw);
      entry.aliases.add(recipientId);
      for (const field of ["deliveredAt", "readAt", "playedAt"] as const) {
        const value = receipt[field];
        if (value && (!entry[field] || value < entry[field])) entry[field] = value;
      }
      merged.set(recipientId, entry);
    }
    const aliases = [...new Set([...merged.values()].flatMap(entry => [...entry.aliases]))];
    const identifiers = aliases.map(whatsAppJidIdentifier);
    const [contacts, senders] = aliases.length ? await Promise.all([
      database.contact.findMany({ where: { isGroup: false, OR: [{ phone: { in: identifiers } }, { whatsappLid: { in: aliases } }] }, select: { phone: true, whatsappLid: true, name: true, isSaved: true, profilePictureUrl: true } }),
      database.message.findMany({ where: { contactId: message.contactId, senderPhone: { in: identifiers } }, orderBy: { createdAt: "desc" }, select: { senderPhone: true, senderName: true, senderProfilePictureUrl: true } }),
    ]) : [[], []];
    const recipients = [...merged.values()].map(entry => {
      const matches = (value: string | null | undefined) => Boolean(value && [...entry.aliases].some(alias => whatsAppJidIdentifier(alias) === whatsAppJidIdentifier(value)));
      const saved = contacts.find(contact => matches(contact.phone) || matches(contact.whatsappLid));
      const sender = senders.find(sender => matches(sender.senderPhone));
      return {
        recipientId: entry.recipientId,
        phone: entry.recipientId.endsWith("@s.whatsapp.net") ? whatsAppJidIdentifier(entry.recipientId) : null,
        name: saved?.isSaved ? saved.name : sender?.senderName ?? saved?.name ?? null,
        profilePictureUrl: saved?.profilePictureUrl ?? sender?.senderProfilePictureUrl ?? null,
        deliveredAt: entry.deliveredAt,
        readAt: entry.readAt ?? entry.playedAt,
      };
    });
    return res.json({
      messageId: message.id,
      readBy: recipients.filter(recipient => recipient.readAt).sort((a, b) => a.readAt!.getTime() - b.readAt!.getTime()),
      deliveredTo: recipients.filter(recipient => !recipient.readAt && recipient.deliveredAt).sort((a, b) => a.deliveredAt!.getTime() - b.deliveredAt!.getTime()),
    });
  };
}

export const getMessageInfo = createMessageInfoHandler();
