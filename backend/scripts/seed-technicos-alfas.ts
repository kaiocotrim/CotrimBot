import "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

const requiredEmails = [
  "felype.souza@infordoc.com.br",
  "bruno.campaner@infordoc.com.br",
  "kaio.cotrim@infordoc.com.br",
  "thiago.praxedes@infordoc.com.br",
  "admin@cotrimbot.local",
];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: requiredEmails } },
    select: { id: true, email: true },
  });
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const missingUsers = requiredEmails.filter((email) => !usersByEmail.has(email));
  if (missingUsers.length) {
    throw new Error(`Usuários não cadastrados: ${missingUsers.join(", ")}`);
  }

  const userIds = users.map((user) => user.id);
  const memberships = await prisma.member.findMany({
    where: { userId: { in: userIds } },
    select: { organizationId: true, userId: true },
  });
  const byOrganization = new Map<string, Set<string>>();
  for (const member of memberships) {
    const ids = byOrganization.get(member.organizationId) ?? new Set<string>();
    ids.add(member.userId);
    byOrganization.set(member.organizationId, ids);
  }
  const organizationId = [...byOrganization.entries()].find(([, ids]) => userIds.every((id) => ids.has(id)))?.[0];
  if (!organizationId) {
    const linked = new Set(memberships.map((member) => member.userId));
    const missingMemberships = users.filter((user) => !linked.has(user.id)).map((user) => user.email);
    throw new Error(`Não existe uma empresa com os cinco membros. Vínculos ausentes: ${missingMemberships.length ? missingMemberships.join(", ") : "os usuários estão em empresas diferentes."}`);
  }

  const existing = await prisma.internalConversation.findFirst({
    where: { organizationId, type: "GROUP", name: "Técnicos Alfas" },
    select: { id: true },
  });
  if (existing) {
    console.log(`Grupo Técnicos Alfas já existe (${existing.id}); nenhum membro foi reintroduzido.`);
    return;
  }

  const group = await prisma.internalConversation.create({
    data: {
      organizationId,
      type: "GROUP",
      name: "Técnicos Alfas",
    },
  });
  await prisma.internalConversationParticipant.createMany({
    data: userIds.map((userId, index) => ({
      conversationId: group.id,
      organizationId,
      userId,
      role: index === 0 ? "ADMIN" : "MEMBER",
    })),
  });
  console.log(`Grupo Técnicos Alfas criado: ${group.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
