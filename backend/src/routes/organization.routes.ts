import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const organizationRouter = Router();

organizationRouter.patch("/organizations/:organizationId/invitations/:invitationId/profile", async (request, response) => {
  const organizationId = request.params.organizationId;
  const invitationId = request.params.invitationId;
  const userId = request.user?.id;
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const jobTitle = typeof request.body?.jobTitle === "string" ? request.body.jobTitle.trim() : "";

  if (!name || name.length > 100 || jobTitle.length > 100) {
    response.status(400).json({ error: "Informe um nome válido e um cargo de até 100 caracteres." });
    return;
  }

  if (!userId) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }

  try {
    const membership = await prisma.member.findFirst({
      where: { organizationId, userId, role: { in: ["owner", "admin"] } },
      select: { id: true },
    });

    if (!membership) {
      response.status(403).json({ error: "Você não tem permissão para alterar esta empresa." });
      return;
    }

    const result = await prisma.invitation.updateMany({
      where: { id: invitationId, organizationId, status: "pending" },
      data: { name, jobTitle: jobTitle || null },
    });

    if (result.count === 0) {
      response.status(404).json({ error: "Convite não encontrado." });
      return;
    }

    response.json({ success: true });
  } catch (error) {
    console.error("Falha ao salvar dados do usuário convidado:", error);
    response.status(500).json({ error: "Não foi possível salvar os dados do usuário." });
  }
});
