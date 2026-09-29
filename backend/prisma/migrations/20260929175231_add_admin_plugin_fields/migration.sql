-- AlterTable
ALTER TABLE `Session` ADD COLUMN `impersonatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `banExpires` DATETIME(3) NULL,
    ADD COLUMN `banReason` VARCHAR(191) NULL,
    ADD COLUMN `banned` BOOLEAN NULL DEFAULT false,
    ADD COLUMN `role` VARCHAR(191) NULL DEFAULT 'user';
