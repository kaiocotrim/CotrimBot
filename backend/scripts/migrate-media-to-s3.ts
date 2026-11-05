import "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { uploadMediaObject } from "../src/services/media-storage.service.js";

// Uso: npm run media:migrate-s3 [-- --dry-run]
const BATCH_SIZE = 50;
const dryRun = process.argv.includes("--dry-run");

async function migrateMessageMedia() {
  if (dryRun) return prisma.messageMedia.count({ where: { storageKey: null, data: { not: null } } });

  let migrated = 0;
  for (;;) {
    const rows = await prisma.messageMedia.findMany({
      where: { storageKey: null, data: { not: null } },
      select: { messageId: true, data: true, mimetype: true },
      take: BATCH_SIZE,
    });
    if (!rows.length) return migrated;

    for (const row of rows) {
      const storageKey = await uploadMediaObject(row.data!, row.mimetype);
      await prisma.messageMedia.update({ where: { messageId: row.messageId }, data: { storageKey, data: null } });
      migrated += 1;
    }
  }
}

async function migrateInternalMessageMedia() {
  if (dryRun) return prisma.internalMessageMedia.count({ where: { storageKey: null, data: { not: null } } });

  let migrated = 0;
  for (;;) {
    const rows = await prisma.internalMessageMedia.findMany({
      where: { storageKey: null, data: { not: null } },
      select: { messageId: true, data: true, mimeType: true },
      take: BATCH_SIZE,
    });
    if (!rows.length) return migrated;

    for (const row of rows) {
      const storageKey = await uploadMediaObject(row.data!, row.mimeType);
      await prisma.internalMessageMedia.update({ where: { messageId: row.messageId }, data: { storageKey, data: null } });
      migrated += 1;
    }
  }
}

async function main() {
  const messageMedia = await migrateMessageMedia();
  const internalMessageMedia = await migrateInternalMessageMedia();
  console.log(JSON.stringify({ dryRun, messageMedia, internalMessageMedia }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
