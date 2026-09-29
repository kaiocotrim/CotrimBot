import "../config/env.js";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }

  return value;
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

// Servidor de autenticação do CotrimBot. Roda no Express porque o
// frontend Next.js é exportado como site estático (sem rotas de API).
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: requireEnv("BETTER_AUTH_URL"),
  trustedOrigins: [process.env.FRONTEND_URL ?? "http://localhost:3000"],

  // Cadastro fechado: apenas usuários criados via seed/convite podem logar.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },

  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }
    : {}),
});
