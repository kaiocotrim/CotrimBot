import { Router } from "express";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../lib/prisma.js";

// Rotas públicas: o convidado ainda não tem conta/sessão, o ID do convite (enviado por e-mail) é a credencial.
export const invitationRouter = Router();

async function findPendingInvitation(id: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { organization: { select: { name: true } } },
  });

  if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
    return null;
  }

  return invitation;
}

invitationRouter.get("/invitations/:id", async (request, response) => {
  try {
    const invitation = await findPendingInvitation(request.params.id);

    if (!invitation) {
      response.status(404).json({ error: "Convite inválido ou expirado." });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email.toLowerCase() } });

    response.json({
      email: invitation.email,
      organizationName: invitation.organization.name,
      userExists: Boolean(existingUser),
    });
  } catch (error) {
    console.error("Falha ao consultar convite:", error);
    response.status(500).json({ error: "Não foi possível consultar o convite." });
  }
});

// Cria a conta do convidado (cadastro público está desabilitado) e o vincula à organização.
invitationRouter.post("/invitations/:id/accept", async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";

  if (!name || name.length > 100) {
    response.status(400).json({ error: "Informe seu nome." });
    return;
  }

  if (password.length < 8 || password.length > 128) {
    response.status(400).json({ error: "A senha deve ter entre 8 e 128 caracteres." });
    return;
  }

  try {
    const invitation = await findPendingInvitation(request.params.id);

    if (!invitation) {
      response.status(404).json({ error: "Convite inválido ou expirado." });
      return;
    }

    const email = invitation.email.toLowerCase();

    // Conta existente exige login: definir senha por link permitiria sobrescrever credenciais.
    if (await prisma.user.findUnique({ where: { email } })) {
      response.status(409).json({ error: "Já existe uma conta com este e-mail. Faça login para aceitar o convite." });
      return;
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      // Garante que o convite só seja consumido uma vez, mesmo com requisições concorrentes.
      const consumed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: "pending" },
        data: { status: "accepted" },
      });

      if (consumed.count === 0) {
        throw new Error("INVITATION_ALREADY_USED");
      }

      const user = await tx.user.create({
        data: { name, email, emailVerified: true, role: "user" },
      });

      await tx.account.create({
        data: { providerId: "credential", accountId: user.id, userId: user.id, password: passwordHash },
      });

      await tx.member.create({
        data: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role ?? "member" },
      });
    });

    response.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_USED") {
      response.status(404).json({ error: "Convite inválido ou expirado." });
      return;
    }

    console.error("Falha ao aceitar convite:", error);
    response.status(500).json({ error: "Não foi possível aceitar o convite." });
  }
});
