-- AlterTable
ALTER TABLE `ScheduledMessage` ADD COLUMN `announcementContactId` INTEGER NULL,
    ADD COLUMN `announcementId` VARCHAR(191) NULL,
    ADD COLUMN `recipientName` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `requestKey` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Announcement_userId_organizationId_createdAt_idx`(`userId`, `organizationId`, `createdAt`),
    INDEX `Announcement_clientId_idx`(`clientId`),
    UNIQUE INDEX `Announcement_userId_requestKey_key`(`userId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ScheduledMessage_announcementId_idx` ON `ScheduledMessage`(`announcementId`);

-- AddForeignKey
ALTER TABLE `ScheduledMessage` ADD CONSTRAINT `ScheduledMessage_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `ClientProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
