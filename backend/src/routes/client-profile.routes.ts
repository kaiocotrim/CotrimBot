import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const clientRouter = Router();

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
  name: true,
  image: true,
  links: true,
  createdAt: true,
} as const;

clientRouter.get("/clients", async (request, response) => {
  const clients = await prisma.client.findMany({
    where: { userId: request.user!.id },
    orderBy: { createdAt: "desc" },
    select: clientSelect,
  });
  response.json({
    clients: clients.map((client) => ({
      ...client,
      links: Array.isArray(client.links) ? client.links : [],
    })),
  });
});

clientRouter.post("/clients", async (request, response) => {
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

  const client = await prisma.client.create({
    data: { userId: request.user!.id, name, image, links },
    select: clientSelect,
  });
  return response.status(201).json({ client });
});

clientRouter.put("/clients/:id", async (request, response) => {
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

  const existing = await prisma.client.findFirst({
    where: { id: request.params.id, userId: request.user!.id },
    select: { id: true },
  });
  if (!existing) return response.status(404).json({ error: "Cliente não encontrado." });

  const client = await prisma.client.update({
    where: { id: existing.id },
    data: { name, image, links },
    select: clientSelect,
  });
  return response.json({ client });
});

clientRouter.delete("/clients/:id", async (request, response) => {
  const deleted = await prisma.client.deleteMany({
    where: { id: request.params.id, userId: request.user!.id },
  });
  if (!deleted.count) return response.status(404).json({ error: "Cliente não encontrado." });
  return response.status(204).send();
});
