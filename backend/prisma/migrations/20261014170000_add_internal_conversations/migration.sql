ALTER TABLE `Member`
  ADD UNIQUE INDEX `Member_organizationId_userId_key`(`organizationId`, `userId`);

CREATE TABLE `InternalConversation` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `type` ENUM('DIRECT', 'GROUP') NOT NULL,
  `name` VARCHAR(100) NULL,
  `avatarUrl` TEXT NULL,
  `directKey` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `InternalConversation_organizationId_id_key`(`organizationId`, `id`),
  UNIQUE INDEX `InternalConversation_organizationId_directKey_key`(`organizationId`, `directKey`),
  INDEX `InternalConversation_organizationId_updatedAt_idx`(`organizationId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InternalConversationParticipant` (
  `conversationId` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `role` ENUM('MEMBER', 'ADMIN') NOT NULL DEFAULT 'MEMBER',
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastReadAt` DATETIME(3) NULL,

  INDEX `InternalConversationParticipant_organizationId_userId_idx`(`organizationId`, `userId`),
  INDEX `InternalConversationParticipant_userId_lastReadAt_idx`(`userId`, `lastReadAt`),
  PRIMARY KEY (`conversationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InternalMessage` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `organizationId` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `senderId` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `type` ENUM('TEXT', 'FILE') NOT NULL DEFAULT 'TEXT',
  `clientId` VARCHAR(80) NULL,
  `replyToMessageId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `InternalMessage_conversationId_clientId_key`(`conversationId`, `clientId`),
  INDEX `InternalMessage_organizationId_conversationId_id_idx`(`organizationId`, `conversationId`, `id`),
  INDEX `InternalMessage_senderId_idx`(`senderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InternalMessageReaction` (
  `messageId` INTEGER NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `emoji` VARCHAR(32) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `InternalMessageReaction_userId_idx`(`userId`),
  PRIMARY KEY (`messageId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `InternalConversation`
  ADD CONSTRAINT `InternalConversation_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `InternalConversationParticipant`
  ADD CONSTRAINT `InternalConversationParticipant_conversation_fkey`
  FOREIGN KEY (`organizationId`, `conversationId`) REFERENCES `InternalConversation`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `InternalConversationParticipant_member_fkey`
  FOREIGN KEY (`organizationId`, `userId`) REFERENCES `Member`(`organizationId`, `userId`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `InternalConversationParticipant_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `InternalMessage`
  ADD CONSTRAINT `InternalMessage_conversation_fkey`
  FOREIGN KEY (`organizationId`, `conversationId`) REFERENCES `InternalConversation`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `InternalMessage_senderId_fkey`
  FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `InternalMessage_replyToMessageId_fkey`
  FOREIGN KEY (`replyToMessageId`) REFERENCES `InternalMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `InternalMessageReaction`
  ADD CONSTRAINT `InternalMessageReaction_messageId_fkey`
  FOREIGN KEY (`messageId`) REFERENCES `InternalMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `InternalMessageReaction_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
