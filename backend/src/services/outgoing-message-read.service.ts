import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function createOutgoingMessageReadRecorder(
  database: Pick<typeof prisma, "message"> = prisma,
  emit: (payload: { messageId: number; readAt: Date }) => void = payload => { getSocketServer().emit("message_read", payload); },
) {
  return async function recordOutgoingMessageRead(value: unknown) {
    const data = record(value), key = record(data.key), update = record(data.update);
    const receipt = record(data.receipt);
    const externalId = key.id ?? data.keyId ?? data.id;
    if (typeof externalId !== "string" || !externalId.trim() || (key.fromMe ?? data.fromMe) === false) return false;

    const status = String(data.status ?? update.status ?? "").trim().toUpperCase();
    const hasReadReceipt = [receipt.readTimestamp, receipt.playedTimestamp].some(value => {
      const timestamp = Number(value);
      return Number.isFinite(timestamp) && timestamp > 0;
    });
    const remoteJid = key.remoteJid ?? data.remoteJid;
    // Uma leitura individual em grupo pertence ao painel de participantes;
    // ela não confirma que o grupo inteiro leu a mensagem.
    const individualReceipt = typeof remoteJid === "string"
      && /@(s\.whatsapp\.net|lid)$/.test(remoteJid)
      && hasReadReceipt;
    if (!["READ", "PLAYED", "4", "5"].includes(status) && !individualReceipt) return false;

    const message = await database.message.findFirst({
      where: { externalId, direction: "OUTGOING", private: false, deletedAt: null, readAt: null },
      select: { id: true },
    });
    if (!message) return false;
    const readAt = new Date();
    const result = await database.message.updateMany({ where: { id: message.id, readAt: null }, data: { readAt } });
    if (!result.count) return false;
    emit({ messageId: message.id, readAt });
    return true;
  };
}

export const recordOutgoingMessageRead = createOutgoingMessageReadRecorder();
