import { Router } from "express";
import type { GroupPermissionKey } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export const organizationRouter = Router();

const permissionKeys = [
  "CONVERSATIONS_VIEW",
  "CONVERSATIONS_REPLY",
  "CONVERSATIONS_START",
  "CONVERSATIONS_CLOSE",
  "CONVERSATIONS_REOPEN",
  "CONVERSATIONS_FORWARD",
  "MESSAGES_DELETE",
  "CONTACTS_VIEW",
  "CONTACTS_CREATE",
  "CONTACTS_EDIT",
  "CONTACTS_DELETE",
  "COMPANY_MEMBERS_VIEW",
  "COMPANY_MEMBERS_INVITE",
  "COMPANY_MEMBERS_EDIT",
  "COMPANY_GROUPS_CREATE",
  "COMPANY_GROUPS_EDIT",
  "COMPANY_GROUPS_DELETE",
  "SETTINGS_ACCESS",
  "SETTINGS_WHATSAPP_MANAGE",
  "SETTINGS_COMPANY_MANAGE",
] as const satisfies readonly GroupPermissionKey[];

const permissionKeySet = new Set<string>(permissionKeys);

type Membership = { id: string; role: string; permissions: GroupPermissionKey[] };

async function findMembership(organizationId: string, userId: string): Promise<Membership | null> {
  const membership = await prisma.member.findFirst({
    where: { organizationId, userId },
    select: {
      id: true,
      role: true,
      groupMemberships: {
        select: { group: { select: { permissions: { select: { permission: true } } } } },
      },
    },
  });
  if (!membership) return null;

  return {
    id: membership.id,
    role: membership.role,
    permissions: [...new Set(membership.groupMemberships.flatMap(({ group }) => (
      group.permissions.map(({ permission }) => permission)
    )))],
  };
}

function canManageCompany(membership: Membership): boolean {
  return membership.role === "owner" || membership.role === "admin";
}

function canEditCompanyMembers(membership: Membership): boolean {
  return membership.role === "owner"
    || (membership.role === "admin" && membership.permissions.includes("COMPANY_MEMBERS_EDIT"));
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length <= maxLength ? result : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function parseGroupPayload(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const name = readString(input.name, 100);
  const description = readString(input.description ?? "", 500);
  const memberIds = readStringArray(input.memberIds);
  const rawPermissions = readStringArray(input.permissions);

  if (!name || description === null || memberIds === null || rawPermissions === null) return null;
  if (rawPermissions.some((permission) => !permissionKeySet.has(permission))) return null;

  return {
    name,
    description: description || null,
    memberIds,
    permissions: rawPermissions as GroupPermissionKey[],
  };
}

async function validateGroupMembers(organizationId: string, memberIds: string[]): Promise<boolean> {
  if (memberIds.length === 0) return true;
  const count = await prisma.member.count({ where: { organizationId, id: { in: memberIds } } });
  return count === memberIds.length;
}

organizationRouter.get("/organizations/:organizationId/workspace", async (request, response) => {
  const organizationId = request.params.organizationId;
  const userId = request.user?.id;
  if (!userId) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }

  try {
    const membership = await findMembership(organizationId, userId);
    if (!membership) {
      response.status(403).json({ error: "Você não pertence a esta empresa." });
      return;
    }

    const [members, groups] = await Promise.all([
      prisma.member.findMany({
        where: { organizationId },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          userId: true,
          role: true,
          jobTitle: true,
          displayName: true,
          signature: true,
          signatureEnabled: true,
          user: { select: { id: true, name: true, email: true } },
          groupMemberships: {
            select: { group: { select: { id: true, name: true, permissions: { select: { permission: true } } } } },
          },
        },
      }),
      prisma.organizationGroup.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: {
          members: { select: { memberId: true } },
          permissions: { select: { permission: true } },
        },
      }),
    ]);

    response.json({
      currentRole: membership.role,
      canManage: canManageCompany(membership),
      allPermissions: permissionKeys,
      members: members.map(({ groupMemberships, ...member }) => ({
        ...member,
        groups: groupMemberships.map(({ group }) => ({ id: group.id, name: group.name })),
        effectivePermissions: member.role === "owner"
          ? permissionKeys
          : [...new Set(groupMemberships.flatMap(({ group }) => group.permissions.map(({ permission }) => permission)))],
      })),
      groups: groups.map(({ members: groupMembers, permissions, ...group }) => ({
        ...group,
        memberIds: groupMembers.map(({ memberId }) => memberId),
        permissions: permissions.map(({ permission }) => permission),
      })),
    });
  } catch (error) {
    console.error("Falha ao carregar estrutura da empresa:", error);
    response.status(500).json({ error: "Não foi possível carregar a empresa." });
  }
});

organizationRouter.patch("/organizations/:organizationId/profile", async (request, response) => {
  const organizationId = request.params.organizationId;
  const userId = request.user?.id;
  const logo = request.body?.logo;

  if (!userId) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }

  if (logo !== null && typeof logo !== "string") {
    response.status(400).json({ error: "Logo inválida." });
    return;
  }

  if (typeof logo === "string") {
    const match = logo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || logo.length > 60_000) {
      response.status(400).json({ error: "Use uma imagem PNG, JPG ou WebP de até 45 KB." });
      return;
    }

    try {
      const base64Payload = match[2];
      if (!base64Payload || Buffer.from(base64Payload, "base64").byteLength > 45_000) {
        response.status(400).json({ error: "A logo processada ficou muito grande." });
        return;
      }
    } catch {
      response.status(400).json({ error: "Logo inválida." });
      return;
    }
  }

  try {
    const membership = await findMembership(organizationId, userId);
    if (!membership || !canManageCompany(membership)) {
      response.status(403).json({ error: "Você não tem permissão para alterar esta empresa." });
      return;
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: { logo },
      select: { logo: true },
    });
    response.json(organization);
  } catch (error) {
    console.error("Falha ao atualizar logo da empresa:", error);
    response.status(500).json({ error: "Não foi possível atualizar a logo da empresa." });
  }
});

organizationRouter.post("/organizations/:organizationId/groups", async (request, response) => {
  const organizationId = request.params.organizationId;
  const userId = request.user?.id;
  const payload = parseGroupPayload(request.body);
  if (!userId) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }
  if (!payload) {
    response.status(400).json({ error: "Dados do grupo inválidos." });
    return;
  }

  try {
    const membership = await findMembership(organizationId, userId);
    if (!membership || !canManageCompany(membership)) {
      response.status(403).json({ error: "Você não tem permissão para criar grupos." });
      return;
    }
    if (!await validateGroupMembers(organizationId, payload.memberIds)) {
      response.status(400).json({ error: "Um ou mais usuários não pertencem à empresa." });
      return;
    }
    const duplicate = await prisma.organizationGroup.findFirst({ where: { organizationId, name: payload.name } });
    if (duplicate) {
      response.status(409).json({ error: "Já existe um grupo com este nome." });
      return;
    }

    const group = await prisma.organizationGroup.create({
      data: {
        organizationId,
        name: payload.name,
        description: payload.description,
        members: { create: payload.memberIds.map((memberId) => ({ memberId })) },
        permissions: { create: payload.permissions.map((permission) => ({ permission })) },
      },
    });
    response.status(201).json({ id: group.id });
  } catch (error) {
    console.error("Falha ao criar grupo:", error);
    response.status(500).json({ error: "Não foi possível criar o grupo." });
  }
});

organizationRouter.put("/organizations/:organizationId/groups/:groupId", async (request, response) => {
  const { organizationId, groupId } = request.params;
  const userId = request.user?.id;
  const payload = parseGroupPayload(request.body);
  if (!userId) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }
  if (!payload) {
    response.status(400).json({ error: "Dados do grupo inválidos." });
    return;
  }

  try {
    const [membership, group] = await Promise.all([
      findMembership(organizationId, userId),
      prisma.organizationGroup.findFirst({ where: { id: groupId, organizationId }, select: { id: true } }),
    ]);
    if (!membership || !canManageCompany(membership)) {
      response.status(403).json({ error: "Você não tem permissão para editar grupos." });
      return;
    }
    if (!group) {
      response.status(404).json({ error: "Grupo não encontrado." });
      return;
    }
    if (!await validateGroupMembers(organizationId, payload.memberIds)) {
      response.status(400).json({ error: "Um ou mais usuários não pertencem à empresa." });
      return;
    }
    const duplicate = await prisma.organizationGroup.findFirst({
      where: { organizationId, name: payload.name, NOT: { id: groupId } },
      select: { id: true },
    });
    if (duplicate) {
      response.status(409).json({ error: "Já existe um grupo com este nome." });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationGroup.update({
        where: { id: groupId },
        data: { name: payload.name, description: payload.description },
      });
      await tx.organizationGroupMember.deleteMany({ where: { groupId } });
      await tx.groupPermission.deleteMany({ where: { groupId } });
      if (payload.memberIds.length) {
        await tx.organizationGroupMember.createMany({ data: payload.memberIds.map((memberId) => ({ groupId, memberId })) });
      }
      if (payload.permissions.length) {
        await tx.groupPermission.createMany({ data: payload.permissions.map((permission) => ({ groupId, permission })) });
      }
    });
    response.json({ success: true });
  } catch (error) {
    console.error("Falha ao atualizar grupo:", error);
    response.status(500).json({ error: "Não foi possível atualizar o grupo." });
  }
});

organizationRouter.delete("/organizations/:organizationId/groups/:groupId", async (request, response) => {
  const { organizationId, groupId } = request.params;
  const userId = request.user?.id;
  if (!userId) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }

  try {
    const membership = await findMembership(organizationId, userId);
    if (!membership || !canManageCompany(membership)) {
      response.status(403).json({ error: "Você não tem permissão para excluir grupos." });
      return;
    }
    const result = await prisma.organizationGroup.deleteMany({ where: { id: groupId, organizationId } });
    if (!result.count) {
      response.status(404).json({ error: "Grupo não encontrado." });
      return;
    }
    response.status(204).send();
  } catch (error) {
    console.error("Falha ao excluir grupo:", error);
    response.status(500).json({ error: "Não foi possível excluir o grupo." });
  }
});

organizationRouter.patch("/organizations/:organizationId/members/:memberId/profile", async (request, response) => {
  const { organizationId, memberId } = request.params;
  const userId = request.user?.id;
  if (!userId) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }
  if (!request.body || typeof request.body !== "object") {
    response.status(400).json({ error: "Dados do usuário inválidos." });
    return;
  }

  const input = request.body as Record<string, unknown>;
  const displayName = readString(input.displayName ?? "", 100);
  const jobTitle = readString(input.jobTitle ?? "", 100);
  const signature = readString(input.signature ?? "", 255);
  const signatureEnabled = input.signatureEnabled;
  if (displayName === null || jobTitle === null || signature === null || typeof signatureEnabled !== "boolean") {
    response.status(400).json({ error: "Confira os campos de nome, cargo e assinatura." });
    return;
  }

  try {
    const [requester, target] = await Promise.all([
      findMembership(organizationId, userId),
      prisma.member.findFirst({ where: { id: memberId, organizationId }, select: { id: true, userId: true, role: true } }),
    ]);
    if (!requester || !target) {
      response.status(404).json({ error: "Usuário da empresa não encontrado." });
      return;
    }
    const editingSelf = requester.id === target.id;
    if (!editingSelf && !canEditCompanyMembers(requester)) {
      response.status(403).json({ error: "Você não tem permissão para editar este usuário." });
      return;
    }
    if (target.role === "owner" && requester.role !== "owner") {
      response.status(403).json({ error: "Somente o dono pode alterar o próprio perfil na empresa." });
      return;
    }

    await prisma.member.update({
      where: { id: memberId },
      data: {
        displayName: displayName || null,
        jobTitle: jobTitle || null,
        signature: signature || null,
        signatureEnabled: signature ? signatureEnabled : false,
      },
    });
    response.json({ success: true });
  } catch (error) {
    console.error("Falha ao atualizar perfil do usuário:", error);
    response.status(500).json({ error: "Não foi possível atualizar o usuário." });
  }
});

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
