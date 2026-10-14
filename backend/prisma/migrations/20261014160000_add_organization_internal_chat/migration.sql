CREATE TABLE `OrganizationMessage` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `organizationId` VARCHAR(191) NOT NULL,
  `senderId` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `OrganizationMessage_organizationId_id_idx`(`organizationId`, `id`),
  INDEX `OrganizationMessage_senderId_idx`(`senderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrganizationMessage`
ADD CONSTRAINT `OrganizationMessage_organizationId_fkey`
FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrganizationMessage`
ADD CONSTRAINT `OrganizationMessage_senderId_fkey`
FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
