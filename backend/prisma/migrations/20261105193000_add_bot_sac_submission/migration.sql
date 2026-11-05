CREATE TABLE `BotSacSubmission` (
  `startMessageId` INTEGER NOT NULL,
  `botId` VARCHAR(191) NOT NULL,
  `contactId` INTEGER NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `protocol` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`startMessageId`),
  INDEX `BotSacSubmission_organizationId_createdAt_idx` (`organizationId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
