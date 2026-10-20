CREATE TABLE `MessageReceipt` (
  `messageId` INTEGER NOT NULL,
  `recipientId` VARCHAR(100) NOT NULL,
  `deliveredAt` DATETIME(3) NULL,
  `readAt` DATETIME(3) NULL,
  `playedAt` DATETIME(3) NULL,
  PRIMARY KEY (`messageId`, `recipientId`),
  CONSTRAINT `MessageReceipt_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
