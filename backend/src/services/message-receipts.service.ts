import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.js";

function recipientJid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhatsAppJid(value);
  return /^\d+@(s\.whatsapp\.net|lid)$/.test(normalized) ? normalized : null;
}

function receiptDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = value < 1e12 ? value * 1000 : value;
  return milliseconds > Date.now() + 300_000 || milliseconds < 946684800000 ? null : new Date(milliseconds);
}

export function createMessageReceiptRecorder(
  database: Pick<typeof prisma, "message" | "messageReceipt"> = prisma,
  emit: (messageId: number) => void = messageId => { getSocketServer().emit("message_receipts_updated", { messageId }); },
) {
  return async function recordMessageReceipt(update: any) {
    const key = update?.key;
    const receipt = update?.receipt;
    const userJid = recipientJid(receipt?.userJid);
    const phoneJid = recipientJid(receipt?.phoneJid);
    const recipientId = phoneJid?.endsWith("@s.whatsapp.net") ? phoneJid : userJid;
    if (key?.fromMe !== true || typeof key.id !== "string" || !recipientId || !/^\d+(?:-\d+)?@g\.us$/.test(key.remoteJid ?? "")) return false;
    const dates = {
      deliveredAt: receiptDate(receipt?.receiptTimestamp),
      readAt: receiptDate(receipt?.readTimestamp),
      playedAt: receiptDate(receipt?.playedTimestamp),
    };
    if (!Object.values(dates).some(Boolean)) return false;
    const message = await database.message.findFirst({
      where: { externalId: key.id, direction: "OUTGOING", private: false, deletedAt: null, contact: { isGroup: true, phone: key.remoteJid } },
      select: { id: true },
    });
    if (!message) return false;
    // Create without overwriting another receipt; each timestamp update below is atomic.
    const inserted = await database.messageReceipt.createMany({ data: [{ messageId: message.id, recipientId, ...dates }], skipDuplicates: true });
    let changed = inserted.count > 0;
    for (const field of ["deliveredAt", "readAt", "playedAt"] as const) {
      const value = dates[field];
      if (!value) continue;
      const result = await database.messageReceipt.updateMany({
        where: { messageId: message.id, recipientId, OR: [{ [field]: null }, { [field]: { gt: value } }] },
        data: { [field]: value },
      });
      changed ||= result.count > 0;
    }
    if (changed) emit(message.id);
    return true;
  };
}

export const recordMessageReceipt = createMessageReceiptRecorder();
