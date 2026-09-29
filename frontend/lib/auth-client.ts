import { createAuthClient } from "better-auth/react";

// O backend Express expõe o Better Auth em /api/auth (frontend é export estático).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const AUTH_BASE_URL = API_URL.replace(/\/api\/?$/, "") + "/api/auth";

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
});

export const { useSession, signIn, signOut } = authClient;
