import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ClientAccessError, getClientAccess } from "../services/client-access.service.js";
import { announcementPreviewToken, announcementRecipients, companyKey } from "../services/announcement-policy.js";

export function createAnnouncementRouter(database: typeof prisma = prisma) {
  const router = Router();
  router.use("/announcements", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    try {
      res.locals.access = await getClientAccess(req.user.id, req.activeOrganizationId, (userId, organizationId) => database.member.findMany({
        where: { userId, ...(organizationId ? { organizationId } : {}) }, select: { organizationId: true }, take: 2,
      }));
      next();
    } catch (error) {
      if (error instanceof ClientAccessError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  });

  router.get("/announcements", async (req, res) => {
    const announcements = await database.announcement.findMany({
      where: { userId: req.user!.id, organizationId: res.locals.access.organizationId },
      orderBy: { createdAt: "desc" }, take: 30,
      include: { messages: { select: { id: true, recipientName: true, phone: true, status: true, error: true, sentAt: true } } },
    });
    res.json({ announcements });
  });

  // Esta rota apenas calcula a prévia. Não grava nem envia mensagens.
  router.post(["/announcements/preview", "/announcements"], async (req, res) => {
    const body = req.body;
    const clientId = typeof body?.clientId === "string" ? body.clientId : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!clientId || !content || content.length > 5000) return res.status(400).json({ error: "Selecione a empresa e escreva uma mensagem de até 5.000 caracteres." });
    const confirming = req.path === "/announcements";
    const requestKey = typeof body.requestKey === "string" && /^[a-zA-Z0-9-]{16,64}$/.test(body.requestKey) ? body.requestKey : null;
    if (confirming && !requestKey) return res.status(400).json({ error: "Confirmação inválida. Revise o comunicado novamente." });
    if (confirming) {
      const existing = await database.announcement.findUnique({ where: { userId_requestKey: { userId: req.user!.id, requestKey: requestKey! } } });
      if (existing) {
        if (existing.organizationId !== res.locals.access.organizationId || existing.clientId !== clientId || existing.content !== content) return res.status(409).json({ error: "Essa confirmação pertence a outro comunicado." });
        return res.json({ announcement: existing });
      }
    }
    const client = await database.client.findFirst({ where: { AND: [res.locals.access.where, { id: clientId }] } });
    if (!client) return res.status(404).json({ error: "Empresa não encontrada." });
    // Contatos antigos não têm clientId: nomes repetidos tornam o destino ambíguo.
    const companies = await database.client.findMany({ select: { id: true, name: true } });
    if (companies.filter((item) => companyKey(item.name) === companyKey(client.name)).length !== 1) {
      return res.status(409).json({ error: "Há empresas com esse mesmo nome. Diferencie os nomes e confira os vínculos dos contatos antes de enviar." });
    }
    const contacts = await database.contact.findMany({
      where: { companyName: { not: null } },
      select: { id: true, name: true, phone: true, companyName: true, blocked: true, isGroup: true },
    });
    const { recipients, excluded } = announcementRecipients(client.name, contacts);
    if (recipients.length > 1000) return res.status(400).json({ error: "Esta versão permite até 1.000 destinatários por comunicado." });
    const previewToken = announcementPreviewToken(clientId, content, recipients);
    if (!confirming) return res.json({ companyName: client.name, recipients, excluded, previewToken });
    if (!recipients.length) return res.status(400).json({ error: "Esta empresa não possui destinatários disponíveis." });
    if (body.previewToken !== previewToken) return res.status(409).json({ error: "Os destinatários ou a mensagem mudaram. Revise novamente antes de enviar." });

    try {
      // Uma única gravação transacional: todos entram na fila ou nenhum entra.
      const announcement = await database.announcement.create({ data: {
        userId: req.user!.id, organizationId: res.locals.access.organizationId,
        clientId, companyName: client.name, content, requestKey: requestKey!,
        messages: { create: recipients.map((contact, index) => ({
          userId: req.user!.id, phone: contact.phone, recipientName: contact.name.slice(0, 191),
          announcementContactId: contact.id, content,
          scheduledAt: new Date(Date.now() + index * 3000),
        })) },
      } });
      return res.status(201).json({ announcement });
    } catch (error) {
      // Duplo clique/reenvio HTTP concorrente mantém uma única fila.
      if ((error as { code?: string }).code !== "P2002") throw error;
      const announcement = await database.announcement.findUniqueOrThrow({ where: { userId_requestKey: { userId: req.user!.id, requestKey: requestKey! } } });
      if (announcement.clientId !== clientId || announcement.content !== content || announcement.organizationId !== res.locals.access.organizationId) return res.status(409).json({ error: "Essa confirmação pertence a outro comunicado." });
      return res.json({ announcement });
    }
  });
  return router;
}

export const announcementRouter = createAnnouncementRouter();
