import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { authenticateApiToken } from "../services/api-token.js";

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
async function authenticateSession(request: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (!session) return false;
  request.user = session.user;
  request.activeOrganizationId = session.session.activeOrganizationId ?? undefined;
  return true;
}

export async function requireSessionAuth(request: Request, response: Response, next: NextFunction) {
  if (!await authenticateSession(request)) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  if (await authenticateSession(request)) {
    next();
    return;
  }

  const user = await authenticateApiToken(request.headers.authorization, prisma, process.env.BETTER_AUTH_SECRET!);
  if (!user) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }
  request.user = user;
  request.activeOrganizationId = undefined;
  next();
}
