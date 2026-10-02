import "../src/config/env.js";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/prisma.js";

// Cria (ou atualiza a senha de) o primeiro usuário autorizado a logar no CotrimBot.
// Uso: SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... SEED_ADMIN_NAME=... npm run prisma:seed
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Administrador";

  if (!email || !password) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD para criar o usuário inicial."
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: "admin" },
    create: { email, name, emailVerified: true, role: "admin" },
  });

  const existingAccount = await prisma.account.findFirst({
    where: { providerId: "credential", accountId: user.id },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: passwordHash },
    });
  } else {
    await prisma.account.create({
      data: {
        providerId: "credential",
        accountId: user.id,
        userId: user.id,
        password: passwordHash,
      },
    });
  }

  console.log(`Usuário autorizado: ${email}`);

  // Organização padrão que recebe os convites; o admin inicial é o proprietário.
  const organization = await prisma.organization.upsert({
    where: { slug: "cotrim" },
    update: {},
    create: { name: "Cotrim", slug: "cotrim" },
  });

  const existingMember = await prisma.member.findFirst({
    where: { organizationId: organization.id, userId: user.id },
  });

  if (existingMember) {
    await prisma.member.update({ where: { id: existingMember.id }, data: { role: "owner" } });
  } else {
    await prisma.member.create({
      data: { organizationId: organization.id, userId: user.id, role: "owner" },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
