import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { ORGANIZATION_WEBHOOK_EVENTS, normalizeWebhookEvents } from "../services/organization-webhook-events.js";
import { generateWebhookSecret, normalizeWebhookUrl, type WebhookDatabase } from "../services/organization-webhook.service.js";

type WebhookRouteDatabase = WebhookDatabase & Pick<typeof prisma, "member">;

const webhookSelect = {
  id: true,
  name: true,
  url: true,
  events: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

const deliverySelect = {
  id: true,
  event: true,
  status: true,
  attempts: true,
  responseStatus: true,
  error: true,
  createdAt: true,
} as const;

function normalizeName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= 100 ? name : null;
}

export function createOrganizationWebhookRouter(database: WebhookRouteDatabase = prisma) {
  const router = Router();

  // Somente owner/admin da empresa podem gerenciar webhooks. A empresa vem do cabeçalho
  // X-Organization-Id (escolhida pela tela) ou, na falta dele, da empresa ativa da sessão.
  // Em ambos os casos a membership é verificada abaixo.
  async function requireAdmin(request: Request, response: Response): Promise<string | null> {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ error: "Não autenticado." });
      return null;
    }
    const headerOrganizationId = request.get("x-organization-id")?.trim();
    const organizationId = headerOrganizationId || request.activeOrganizationId;
    if (!organizationId) {
      response.status(409).json({ error: "Selecione uma empresa ativa." });
      return null;
    }
    const member = await database.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });
    if (!member || !["owner", "admin"].includes(member.role)) {
      response.status(403).json({ error: "Apenas administradores da empresa podem gerenciar webhooks." });
      return null;
    }
    return organizationId;
  }

  async function findOwnedWebhook(organizationId: string, id: string) {
    return database.organizationWebhook.findFirst({ where: { id, organizationId }, select: { id: true } });
  }

  router.get("/organization-webhooks/events", async (request, response) => {
    if (!await requireAdmin(request, response)) return;
    response.json({ events: ORGANIZATION_WEBHOOK_EVENTS });
  });

  router.get("/organization-webhooks", async (request, response) => {
    const organizationId = await requireAdmin(request, response);
    if (!organizationId) return;
    const webhooks = await database.organizationWebhook.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: webhookSelect,
    });
    response.json({ webhooks });
  });

  router.post("/organization-webhooks", async (request, response) => {
    const organizationId = await requireAdmin(request, response);
    if (!organizationId) return;
    const name = normalizeName(request.body?.name);
    const url = normalizeWebhookUrl(request.body?.url);
    const events = normalizeWebhookEvents(request.body?.events);
    const active = request.body?.active ?? true;
    if (!name) return response.status(400).json({ error: "Informe um nome de até 100 caracteres." });
    if (!url) return response.status(400).json({ error: "Informe uma URL válida (https://)." });
    if (!events) return response.status(400).json({ error: "Selecione ao menos um evento válido." });
    if (typeof active !== "boolean") return response.status(400).json({ error: "Valor de ativação inválido." });

    const secret = generateWebhookSecret();
    const webhook = await database.organizationWebhook.create({
      data: { organizationId, name, url, events, active, secret },
      select: webhookSelect,
    });
    // O secret é exibido somente nesta resposta e na rotação.
    return response.status(201).json({ webhook, secret });
  });

  router.patch("/organization-webhooks/:id", async (request, response) => {
    const organizationId = await requireAdmin(request, response);
    if (!organizationId) return;
    const id = String(request.params.id);
    const data: { name?: string; url?: string; events?: string[]; active?: boolean } = {};
    if (request.body?.name !== undefined) {
      const name = normalizeName(request.body.name);
      if (!name) return response.status(400).json({ error: "Informe um nome de até 100 caracteres." });
      data.name = name;
    }
    if (request.body?.url !== undefined) {
      const url = normalizeWebhookUrl(request.body.url);
      if (!url) return response.status(400).json({ error: "Informe uma URL válida (https://)." });
      data.url = url;
    }
    if (request.body?.events !== undefined) {
      const events = normalizeWebhookEvents(request.body.events);
      if (!events) return response.status(400).json({ error: "Selecione ao menos um evento válido." });
      data.events = events;
    }
    if (request.body?.active !== undefined) {
      if (typeof request.body.active !== "boolean") return response.status(400).json({ error: "Valor de ativação inválido." });
      data.active = request.body.active;
    }
    if (!await findOwnedWebhook(organizationId, id)) return response.status(404).json({ error: "Webhook não encontrado." });

    const webhook = await database.organizationWebhook.update({ where: { id }, data, select: webhookSelect });
    return response.json({ webhook });
  });

  router.post("/organization-webhooks/:id/rotate-secret", async (request, response) => {
    const organizationId = await requireAdmin(request, response);
    if (!organizationId) return;
    const id = String(request.params.id);
    if (!await findOwnedWebhook(organizationId, id)) return response.status(404).json({ error: "Webhook não encontrado." });

    const secret = generateWebhookSecret();
    const webhook = await database.organizationWebhook.update({ where: { id }, data: { secret }, select: webhookSelect });
    return response.json({ webhook, secret });
  });

  router.delete("/organization-webhooks/:id", async (request, response) => {
    const organizationId = await requireAdmin(request, response);
    if (!organizationId) return;
    const deleted = await database.organizationWebhook.deleteMany({ where: { id: String(request.params.id), organizationId } });
    if (!deleted.count) return response.status(404).json({ error: "Webhook não encontrado." });
    return response.status(204).send();
  });

  router.get("/organization-webhooks/:id/deliveries", async (request, response) => {
    const organizationId = await requireAdmin(request, response);
    if (!organizationId) return;
    const id = String(request.params.id);
    if (!await findOwnedWebhook(organizationId, id)) return response.status(404).json({ error: "Webhook não encontrado." });

    const deliveries = await database.organizationWebhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: deliverySelect,
    });
    return response.json({ deliveries });
  });

  return router;
}

export const organizationWebhookRouter = createOrganizationWebhookRouter();
