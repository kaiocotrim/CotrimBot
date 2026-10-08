CREATE TABLE `ContactAssignment` (
  `contactId` INTEGER NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ContactAssignment_userId_idx`(`userId`),
  PRIMARY KEY (`contactId`, `userId`),
  CONSTRAINT `ContactAssignment_contactId_fkey`
    FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ContactAssignment_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ContactAssignment` (`contactId`, `userId`, `assignedAt`)
SELECT `id`, `assignedUserId`, CURRENT_TIMESTAMP(3)
FROM `Contact`
WHERE `assignedUserId` IS NOT NULL;

ALTER TABLE `Contact` DROP FOREIGN KEY `Contact_assignedUserId_fkey`;
DROP INDEX `Contact_assignedUserId_idx` ON `Contact`;
ALTER TABLE `Contact` DROP COLUMN `assignedUserId`;
