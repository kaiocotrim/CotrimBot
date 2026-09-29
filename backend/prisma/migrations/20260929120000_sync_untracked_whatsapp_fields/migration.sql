-- AlterTable
ALTER TABLE `Contact` ADD COLUMN `advancedPrivacy` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `blocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `chatTheme` VARCHAR(32) NOT NULL DEFAULT 'default',
    ADD COLUMN `ephemeralSeconds` INTEGER NULL,
    ADD COLUMN `favorited` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `listName` VARCHAR(64) NULL,
    ADD COLUMN `muted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `whatsappLid` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Message` ADD COLUMN `favorited` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `private` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `quotedContent` TEXT NULL,
    ADD COLUMN `quotedExternalId` VARCHAR(191) NULL,
    ADD COLUMN `quotedMessageId` INTEGER NULL,
    ADD COLUMN `quotedSenderName` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Contact_whatsappLid_key` ON `Contact`(`whatsappLid`);

-- CreateIndex
CREATE INDEX `Message_contactId_fkey` ON `Message`(`contactId`);

-- CreateIndex
CREATE INDEX `Message_quotedExternalId_idx` ON `Message`(`quotedExternalId`);

-- CreateIndex
CREATE INDEX `Message_quotedMessageId_idx` ON `Message`(`quotedMessageId`);

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_quotedMessageId_fkey` FOREIGN KEY (`quotedMessageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
