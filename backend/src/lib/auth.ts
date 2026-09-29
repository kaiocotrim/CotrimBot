import "../config/env.js";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import { sendEmail } from "./mailer.js";

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

    // Reaproveitado tanto para "Esqueci minha senha" quanto para o convite enviado pelo admin.
    sendResetPassword: async ({ user, url }) => {
      sendEmail({
        to: user.email,
        subject: "Defina sua senha no CotrimBot",
        text: `Olá, ${user.name}! Acesse o link a seguir para definir sua senha de acesso ao CotrimBot: ${url}`,
        html: `<p>Olá, ${user.name}!</p><p>Acesse o link a seguir para definir sua senha de acesso ao CotrimBot:</p><p><a href="${url}">${url}</a></p>`,
      }).catch((error: unknown) => console.error("Falha ao enviar e-mail de convite/redefinição:", error));
    },
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

  // Plugin admin self-hosted (sem depender de serviços externos como o dash() da Better Auth).
  plugins: [admin()],
});
