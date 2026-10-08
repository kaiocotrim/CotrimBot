import { prisma } from "../lib/prisma.js";

type SignatureMember = {
  organizationId: string;
  signature: string | null;
  signatureEnabled: boolean;
};

type FindMembers = (userId: string, organizationId?: string) => Promise<SignatureMember[]>;

const findMembers: FindMembers = (userId, organizationId) => prisma.member.findMany({
  where: { userId, ...(organizationId ? { organizationId } : {}) },
  select: { organizationId: true, signature: true, signatureEnabled: true },
  take: 2,
});

export class SignatureMembershipError extends Error {}

export async function getSignedOutgoingText(
  userId: string,
  organizationId: string | undefined,
  content: string,
  lookup: FindMembers = findMembers,
  includeSignature = true,
): Promise<string> {
  const memberships = await lookup(userId, organizationId);
  if (memberships.length !== 1) {
    throw new SignatureMembershipError(memberships.length === 0
      ? "Você não pertence à empresa ativa."
      : "Selecione uma empresa ativa antes de enviar mensagens.");
  }

  const message = content.trim();
  const member = memberships[0]!;
  const signature = includeSignature && member.signatureEnabled ? member.signature?.trim() : null;
  if (!signature) return message;

  const prefix = `*${signature}:*`;
  if (!message) return prefix;
  if (message === prefix || message.startsWith(`${prefix} `) || message.startsWith(`${prefix}\n`)
    || message.startsWith(`${signature}: `) || message.startsWith(`${signature}:\n`)) {
    return message;
  }
  return `${prefix} ${message}`;
}
