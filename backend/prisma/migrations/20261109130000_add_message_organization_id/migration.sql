-- AlterTable
ALTER TABLE `Message` ADD COLUMN `organizationId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Message_organizationId_idx` ON `Message`(`organizationId`);
