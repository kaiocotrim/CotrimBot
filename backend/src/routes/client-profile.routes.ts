import { Router, type Request, type Response } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ClientAccessError, getClientAccess, type ClientAccess } from "../services/client-access.service.js";

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value) || value.length > 20) return null;
  const links: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const link = item.trim();
    if (!link) continue;
    if (link.length > 2048) return null;
    try {
      const url = new URL(link);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    } catch {
      return null;
    }
    if (!links.includes(link)) links.push(link);
  }
  return links;
}

function normalizeImage(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const image = value.trim();
  if (/^data:image\/(jpeg|png|webp);base64,/i.test(image)) {
    return image.length <= 56_000 ? image : undefined;
  }
  if (image.length > 2048) return undefined;
  try {
    const url = new URL(image);
    return url.protocol === "http:" || url.protocol === "https:" ? image : undefined;
  } catch {
    return undefined;
  }
}

const clientSelect = {
  id: true,
  userId: true,
  name: true,
  image: true,
  links: true,
  createdAt: true,
} as const;

function presentClient(client: Prisma.ClientGetPayload<{ select: typeof clientSelect }>) {
  const { userId, ...data } = client;
  return {
    ...data,
    links: Array.isArray(client.links) ? client.links : [],
    canDelete: true,
  };
}

type ClientDatabase = Pick<typeof prisma, "client" | "member">;

export function createClientRouter(database: ClientDatabase = prisma) {
  const router = Router();

  async function authorize(request: Request, response: Response): Promise<ClientAccess | null> {
    if (!request.user) {
      response.status(401).json({ error: "Não autenticado." });
      return null;
    }
    try {
      return await getClientAccess(request.user.id, request.activeOrganizationId, (userId, organizationId) => (
        database.member.findMany({
          where: { userId, ...(organizationId ? { organizationId } : {}) },
          select: { organizationId: true },
          take: 2,
        })
      ));
    } catch (error) {
      if (!(error instanceof ClientAccessError)) throw error;
      response.status(error.status).json({ error: error.message });
      return null;
    }
  }

  router.get("/clients", async (request, response) => {
    const access = await authorize(request, response);
    if (!access) return;
    const clients = await database.client.findMany({
      where: access.where,
      orderBy: { createdAt: "desc" },
      select: clientSelect,
    });
    response.json({
      clients: clients.map((client) => presentClient(client)),
    });
  });

  router.post("/clients", async (request, response) => {
    const access = await authorize(request, response);
    if (!access) return;
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const image = normalizeImage(request.body?.image);
    const links = normalizeLinks(request.body?.links);

    if (!name || name.length > 191) {
      return response.status(400).json({ error: "Informe um nome de até 191 caracteres." });
    }
    if (image === undefined) {
      return response.status(400).json({ error: "A imagem enviada não é válida." });
    }
    if (!links) {
      return response.status(400).json({ error: "Informe até 20 links válidos começando com http:// ou https://." });
    }

    const client = await database.client.create({
      data: { userId: request.user!.id, organizationId: access.organizationId, name, image, links },
      select: clientSelect,
    });
    return response.status(201).json({ client: presentClient(client) });
  });

  router.put("/clients/:id", async (request, response) => {
    const access = await authorize(request, response);
    if (!access) return;
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const image = normalizeImage(request.body?.image);
    const links = normalizeLinks(request.body?.links);

    if (!name || name.length > 191) {
      return response.status(400).json({ error: "Informe um nome de até 191 caracteres." });
    }
    if (image === undefined) {
      return response.status(400).json({ error: "A imagem enviada não é válida." });
    }
    if (!links) {
      return response.status(400).json({ error: "Informe até 20 links válidos começando com http:// ou https://." });
    }

    const existing = await database.client.findFirst({
      where: { ...access.where, id: request.params.id },
      select: { id: true },
    });
    if (!existing) return response.status(404).json({ error: "Cliente não encontrado." });

    const client = await database.client.update({
      where: { ...access.where, id: existing.id },
      data: { name, image, links },
      select: clientSelect,
    });
    return response.json({ client: presentClient(client) });
  });

  router.delete("/clients/:id", async (request, response) => {
    const access = await authorize(request, response);
    if (!access) return;
    const deleted = await database.client.deleteMany({
      where: { ...access.where, id: request.params.id },
    });
    if (!deleted.count) return response.status(404).json({ error: "Cliente não encontrado." });
    return response.status(204).send();
  });

  return router;
}

export const clientRouter = createClientRouter();
