import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

declare global {
  namespace Express {
    interface Request {
      user?: AuthSession["user"];
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
  next();
}
