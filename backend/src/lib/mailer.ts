import * as nodemailer from "nodemailer";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }

  return value;
}

let transporter: nodemailer.Transporter | null = null;

// Cria o transporte SMTP na primeira chamada, reaproveitando a conexão nas próximas.
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: requireEnv("SMTP_HOST"),
      port: Number(requireEnv("SMTP_PORT")),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: requireEnv("SMTP_USER"),
        pass: requireEnv("SMTP_PASSWORD"),
      },
    });
  }

  return transporter;
}

export async function sendEmail(options: { to: string; subject: string; text: string; html?: string }) {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}
