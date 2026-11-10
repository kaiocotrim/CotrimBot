import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import type { prisma } from "../lib/prisma.js";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

declare global {
  namespace Express {
    interface Request {
      user?: AuthSession["user"];
      activeOrganizationId: string | undefined;
    }
  }
}

// Bloqueia rotas privadas para requisições sem sessão válida do Better Auth.
export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (!session) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }
  request.user = session.user;
  request.activeOrganizationId = session.session.activeOrganizationId ?? undefined;
  next();
}

// Sessões de chave de API não têm empresa ativa: usa o cabeçalho X-Organization-Id ou a única empresa do usuário.
export async function resolveRequestOrganizationId(database: Pick<typeof prisma, "member">, request: Request): Promise<string | null> {
  const userId = request.user?.id;
  if (!userId) return null;
  const headerOrganizationId = request.get("x-organization-id")?.trim();
  if (headerOrganizationId) {
    const member = await database.member.findUnique({
      where: { organizationId_userId: { organizationId: headerOrganizationId, userId } },
      select: { role: true },
    });
    return member ? headerOrganizationId : null;
  }
  if (request.activeOrganizationId) return request.activeOrganizationId;
  const memberships = await database.member.findMany({ where: { userId }, select: { organizationId: true }, take: 2 });
  return memberships.length === 1 ? memberships[0]!.organizationId : null;
}
