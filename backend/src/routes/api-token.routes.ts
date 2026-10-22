import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createApiToken, MAX_API_TOKENS_PER_USER } from "../services/api-token.js";
import { requireSessionAuth } from "../middlewares/auth.middleware.js";

export const apiTokenRouter = Router();
apiTokenRouter.use(requireSessionAuth);

apiTokenRouter.get("/tokens", async (request, response) => {
  const tokens = await prisma.apiToken.findMany({
    where: { userId: request.user!.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, tokenPrefix: true, createdAt: true, lastUsedAt: true },
  });
  return response.json({ tokens });
});

apiTokenRouter.post("/tokens", async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  if (!name || name.length > 100) {
    return response.status(400).json({ error: "Informe um nome de até 100 caracteres para o token." });
  }

  const tokenCount = await prisma.apiToken.count({
    where: { userId: request.user!.id, revokedAt: null },
  });
  if (tokenCount >= MAX_API_TOKENS_PER_USER) {
    return response.status(409).json({ error: "Limite de tokens ativos atingido." });
  }

  const generated = createApiToken();
  const token = await prisma.apiToken.create({
    data: {
      userId: request.user!.id,
      name,
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
    },
    select: { id: true, name: true, tokenPrefix: true, createdAt: true },
  });
  return response.status(201).json({ ...token, token: generated.token });
});

apiTokenRouter.delete("/tokens/:id", async (request, response) => {
  const result = await prisma.apiToken.updateMany({
    where: { id: String(request.params.id), userId: request.user!.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) return response.status(404).json({ error: "Token não encontrado." });
  return response.status(204).send();
});
