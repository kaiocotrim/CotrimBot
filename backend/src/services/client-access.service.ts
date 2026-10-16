import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export type FindClientMemberships = (
  userId: string,
  organizationId?: string,
) => Promise<{ organizationId: string }[]>;

export type ClientAccess = {
  organizationId: string | null;
  where: Prisma.ClientWhereInput;
};

const findMembers: FindClientMemberships = (userId, organizationId) => prisma.member.findMany({
  where: { userId, ...(organizationId ? { organizationId } : {}) },
  select: { organizationId: true },
  take: 2,
});

export class ClientAccessError extends Error {
  constructor(message: string, readonly status: 403 | 409) {
    super(message);
  }
}

export async function getClientAccess(
  userId: string,
  activeOrganizationId: string | undefined,
  lookup: FindClientMemberships = findMembers,
): Promise<ClientAccess> {
  const memberships = await lookup(userId, activeOrganizationId);
  if (activeOrganizationId && !memberships.some((member) => member.organizationId === activeOrganizationId)) {
    throw new ClientAccessError("Você não pertence à empresa ativa.", 403);
  }
  if (!activeOrganizationId && memberships.length > 1) {
    throw new ClientAccessError("Selecione uma empresa ativa para acessar os clientes.", 409);
  }

  const organizationId = activeOrganizationId ?? memberships[0]?.organizationId ?? null;
  return {
    organizationId,
    // Cadastros legados sem empresa continuam acessíveis somente ao autor.
    where: organizationId
      ? { OR: [{ organizationId }, { organizationId: null, userId }] }
      : { organizationId: null, userId },
  };
}
