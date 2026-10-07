import { prisma } from "../src/lib/prisma.js";

async function main() {
  if (!process.argv.includes("--confirm=APAGAR")) {
    throw new Error("Confirmação ausente. Use --confirm=APAGAR para executar a limpeza.");
  }

  const before = {
    contacts: await prisma.contact.count(),
    messages: await prisma.message.count(),
    media: await prisma.messageMedia.count(),
    deletions: await prisma.messageDeletion.count(),
  };

  const deleted = await prisma.$transaction(async (tx) => {
    const deletions = await tx.messageDeletion.deleteMany();
    const media = await tx.messageMedia.deleteMany();
    await tx.message.updateMany({ data: { quotedMessageId: null } });
    const messages = await tx.message.deleteMany();
    const contacts = await tx.contact.deleteMany();
    return {
      contacts: contacts.count,
      messages: messages.count,
      media: media.count,
      deletions: deletions.count,
    };
  });

  const after = {
    contacts: await prisma.contact.count(),
    messages: await prisma.message.count(),
    media: await prisma.messageMedia.count(),
    deletions: await prisma.messageDeletion.count(),
  };

  console.log(JSON.stringify({ before, deleted, after }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
