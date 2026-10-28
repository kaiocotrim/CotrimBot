import type { Request, Response } from "express";
import type { prisma } from "../lib/prisma.js";

type Dependencies = {
  database: Pick<typeof prisma, "message">;
  sendEdit: (input: { remoteJid: string; id: string; text: string }) => Promise<void>;
  emit: (event: string, data: unknown) => void;
};

export function createEditMessageHandler({ database, sendEdit, emit }: Dependencies) {
  return async function editMessage(req: Request, res: Response) {
    if (!req.user?.id) return res.status(401).json({ message: "Não autenticado" });
    const id = Number(req.params.id);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!Number.isInteger(id) || id <= 0 || !text || Buffer.byteLength(text, "utf8") > 60_000) {
      return res.status(400).json({ message: "Informe um texto válido para editar a mensagem" });
    }
    const message = await database.message.findUnique({ where: { id }, include: { contact: true } });
    if (!message) return res.status(404).json({ message: "Mensagem não encontrada" });
    if (message.direction !== "OUTGOING" || message.type !== "TEXT" || message.deletedAt || message.private || message.externalId.startsWith("private:")) {
      return res.status(400).json({ message: "Somente mensagens de texto enviadas ao WhatsApp podem ser editadas" });
    }
    if (Date.now() - message.createdAt.getTime() >= 15 * 60_000) {
      return res.status(400).json({ message: "O prazo de 15 minutos para editar esta mensagem terminou" });
    }
    if (message.content === text) return res.json(message);
    const remoteJid = message.contact.isGroup ? message.contact.phone
      : message.contact.whatsappLid ?? `${message.contact.phone.replace(/\D/g, "")}@s.whatsapp.net`;
    try {
      await sendEdit({ remoteJid, id: message.externalId, text });
    } catch (error) {
      console.error("Erro ao editar mensagem:", error);
      return res.status(502).json({ message: "Não foi possível editar a mensagem no WhatsApp. Tente novamente." });
    }
    const updated = await database.message.update({ where: { id }, data: { content: text, editedAt: new Date() } });
    emit("message_edited", { messageId: id, content: updated.content, editedAt: updated.editedAt });
    return res.json(updated);
  };
}
